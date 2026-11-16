package com.lusiad.backend.service.diagnostics;

import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;

/** Bounded worker pool, separate from the HTTP dispatcher and the IDE write thread. */
public final class JavaAnalysisJobs implements AutoCloseable {
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(2, 2, 30, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(4), task -> { Thread thread = new Thread(task, "Lusiad Java analysis"); thread.setDaemon(true); return thread; });
    private record Job(String id, CompletableFuture<?> result) {}
    private final ConcurrentMap<String, Job> latest = new ConcurrentHashMap<>();
    public <T> CompletableFuture<T> submit(String key, long timeoutMs, Function<Runnable, T> operation) {
        return submit(key, java.util.UUID.randomUUID().toString(), timeoutMs, operation);
    }
    public <T> CompletableFuture<T> submit(String key, String requestId, long timeoutMs, Function<Runnable, T> operation) {
        var result = new CompletableFuture<T>();
        var job = new Job(requestId, result);
        var previous = latest.put(key, job);
        if (previous != null) previous.result().cancel(true);
        var cancelled = new AtomicBoolean();
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        Runnable checkpoint = () -> {
            if (cancelled.get() || Thread.currentThread().isInterrupted() || System.nanoTime() > deadline)
                throw new JavaAnalysisContext.Failure("java_analysis_cancelled", "Java analysis was cancelled or exceeded its timeout");
        };
        Future<?> worker;
        try {
            worker = workers.submit(() -> {
                try { checkpoint.run(); T value = operation.apply(checkpoint); checkpoint.run(); result.complete(value); }
                catch (Throwable failure) {
                    Throwable cause = failure;
                    while (cause != null && !(cause instanceof JavaAnalysisContext.Failure)) cause = cause.getCause();
                    result.completeExceptionally(cause == null ? failure : cause);
                }
            });
        } catch (RejectedExecutionException busy) {
            latest.remove(key, job);
            result.completeExceptionally(new JavaAnalysisContext.Failure("java_analysis_busy", "Java analysis workers are busy; try again"));
            return result;
        }
        result.orTimeout(timeoutMs, TimeUnit.MILLISECONDS).whenComplete((value, error) -> {
            cancelled.set(true);
            if (error != null) worker.cancel(true);
            workers.purge(); latest.remove(key, job);
        });
        return result;
    }
    public void cancel(String key) { cancel(key, null); }
    public void cancel(String key, String requestId) { var current = latest.get(key); if (current != null && (requestId == null || current.id().equals(requestId))) current.result().cancel(true); }
    @Override public void close() { latest.values().forEach(value -> value.result().cancel(true)); latest.clear(); workers.shutdownNow(); }
}
