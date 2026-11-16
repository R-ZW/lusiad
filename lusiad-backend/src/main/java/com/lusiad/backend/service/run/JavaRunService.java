package com.lusiad.backend.service.run;

import com.google.gson.*;
import com.lusiad.backend.config.OperationalSettings;
import com.lusiad.backend.service.diagnostics.JavaAnalysisContext;
import com.lusiad.backend.service.fs.ContainedPaths;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** One bounded, disposable Java execution per Lusiad project. Never writes into the source tree. */
public final class JavaRunService implements AutoCloseable {
    private static final int OUTPUT_LIMIT = 256 * 1024;
    private static final long COMPILE_SECONDS = 90, RUN_SECONDS = 120;
    private final ExecutorService workers = Executors.newFixedThreadPool(2, task -> {
        Thread thread = new Thread(task, "lusiad-java-run"); thread.setDaemon(true); return thread;
    });
    private final Semaphore capacity = new Semaphore(2);
    private final Map<Integer, Job> latest = new ConcurrentHashMap<>();
    private final Path configFile;
    public JavaRunService() { this(OperationalSettings.load().configFile); }
    public JavaRunService(Path configFile) { this.configFile = configFile; }

    public JsonObject list(String root, String temporary) throws Exception {
        var captured = capture(root, temporary);
        JsonObject result = ok(); result.addProperty("contextRevision", captured.revision());
        result.add("mains", new Gson().toJsonTree(JavaMainDiscovery.find(captured)));
        return result;
    }

    public synchronized JsonObject start(int projectId, String root, String temporary, String selected, String revision) throws Exception {
        return start(projectId,root,temporary,selected,revision,()->{});
    }
    public synchronized JsonObject start(int projectId, String root, String temporary, String selected, String revision, AutoCloseable lifetime) throws Exception {
        boolean acquired=false;
        try {
        Job previous = latest.get(projectId);
        if (previous != null && previous.active()) throw new JavaAnalysisContext.Failure("java_run_busy", "A Java program is already running in this project");
        if (!capacity.tryAcquire()) throw new JavaAnalysisContext.Failure("java_run_busy", "Two Java executions are already active");
        acquired=true;
            var captured = capture(root, temporary);
            if (!captured.revision().equals(revision)) throw new JavaAnalysisContext.Failure("java_context_stale", "Java sources or settings changed; choose the main class again");
            var entry = JavaMainDiscovery.find(captured).stream().filter(value -> value.className().equals(selected)).findFirst()
                    .orElseThrow(() -> new JavaAnalysisContext.Failure("java_main_unavailable", "The selected main class is no longer available"));
            if (captured.sources().keySet().stream().anyMatch(file -> file.equals("module-info.java") || file.endsWith("/module-info.java")))
                throw new JavaAnalysisContext.Failure("java_context_incomplete", "Modular source projects are not supported by this run action");
            Job job = new Job(projectId, entry.className(), captured.revision());
            latest.put(projectId, job);
            try {
                workers.execute(new RunTask(()->execute(job,captured,entry,temporary),lifetime,capacity));
            } catch (RejectedExecutionException rejected) {
                latest.remove(projectId, job);
                throw rejected;
            }
            return job.view();
        } catch (Exception failure) { if(acquired)capacity.release();closeLifetime(lifetime);throw failure; }
    }
    private static void closeLifetime(AutoCloseable lifetime){try{lifetime.close();}catch(Exception ignored){}}
    private static final class RunTask implements Runnable {
        final Runnable work; final AutoCloseable lifetime; final Semaphore capacity;
        final java.util.concurrent.atomic.AtomicBoolean released=new java.util.concurrent.atomic.AtomicBoolean();
        RunTask(Runnable work,AutoCloseable lifetime,Semaphore capacity){this.work=work;this.lifetime=lifetime;this.capacity=capacity;}
        public void run(){try{work.run();}finally{release();}}
        void release(){if(released.compareAndSet(false,true)){capacity.release();closeLifetime(lifetime);}}
    }

    public JsonObject status(int projectId) {
        Job job = latest.get(projectId);
        return job == null ? idle() : job.view();
    }

    public JsonObject stop(int projectId, String id) {
        Job job = latest.get(projectId);
        if (job == null || !job.id.equals(id)) throw new JavaAnalysisContext.Failure("java_run_stale", "Execution changed; refresh the output panel");
        job.stop(); return job.view();
    }

    private JavaAnalysisContext.Snapshot capture(String root, String temporary) {
        return JavaAnalysisContext.capture(root, temporary, configFile, () -> {
            if (Thread.currentThread().isInterrupted()) throw new CancellationException("Java execution cancelled");
        });
    }

    private static void execute(Job job, JavaAnalysisContext.Snapshot captured, JavaMainDiscovery.MainClass entry, String temporary) {
        Path directory = null;
        try {
            Path runs = Path.of(ContainedPaths.resolve(temporary, "runs", false));
            Files.createDirectories(runs);
            directory = Files.createTempDirectory(runs, "java-");
            Path sources = Files.createDirectory(directory.resolve("src"));
            Path classes = Files.createDirectory(directory.resolve("classes"));
            List<Path> inputs = new ArrayList<>();
            for (var source : captured.sources().values()) {
                if (source.test() && !entry.test()) continue;
                Path destination = sources.resolve(source.file()).normalize();
                if (!destination.startsWith(sources)) throw new IOException("Invalid Java source path");
                Files.createDirectories(destination.getParent());
                Files.writeString(destination, source.content(), StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
                inputs.add(destination);
            }
            if (job.stopped) return;
            Path argumentFile = directory.resolve("javac.args");
            List<String> args = new ArrayList<>(List.of("-proc:none", "-implicit:none", "-encoding", "UTF-8", "--release",
                    Integer.toString(captured.settings().release()), "-d", classes.toString()));
            if (!captured.classpath().isEmpty()) args.addAll(List.of("-classpath", join(captured.classpath())));
            if (!captured.modulePath().isEmpty()) args.addAll(List.of("--module-path", join(captured.modulePath()), "--add-modules", "ALL-MODULE-PATH"));
            inputs.forEach(path -> args.add(path.toString()));
            Files.writeString(argumentFile, String.join("\n", args.stream().map(JavaRunService::argument).toList()) + "\n", StandardCharsets.UTF_8);
            job.stage("compiling");
            int compile = process(job, List.of(tool(captured.settings().jdkHome(), "javac"), "@" + argumentFile), directory, COMPILE_SECONDS, "compile");
            if (job.stopped) return;
            if (compile != 0) { job.finish("failed", compile, "Compilation failed"); return; }
            List<String> command = new ArrayList<>(List.of(tool(captured.settings().jdkHome(), "java"), "-cp",
                    classes + (captured.classpath().isEmpty() ? "" : File.pathSeparator + join(captured.classpath()))));
            if (!captured.modulePath().isEmpty()) command.addAll(List.of("--module-path", join(captured.modulePath()), "--add-modules", "ALL-MODULE-PATH"));
            command.add(entry.className());
            job.stage("running");
            int code = process(job, command, directory, RUN_SECONDS, "program");
            if (!job.stopped) job.finish(code == 0 ? "succeeded" : "failed", code, code == 0 ? null : "Program exited with an error");
        } catch (Exception failure) {
            if (!job.stopped) job.finish("failed", null, failure.getMessage() == null ? "Java execution failed" : failure.getMessage());
        } finally {
            if (directory != null) try (var entries = Files.walk(directory)) {
                for (Path path : entries.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
            } catch (IOException ignored) { /* Isolated output may be held briefly by Windows; no source tree is touched. */ }
        }
    }

    private static String argument(String value) { return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }
    private static String join(List<Path> paths) {
        for (Path path : paths) if (path.toString().contains(File.pathSeparator))
            throw new JavaAnalysisContext.Failure("java_context_incomplete", "Declared dependency path contains the classpath separator: " + path);
        return String.join(File.pathSeparator, paths.stream().map(Path::toString).toList());
    }
    private static String tool(String home, String name) {
        String suffix = System.getProperty("os.name").startsWith("Windows") ? ".exe" : "";
        Path path = Path.of(home, "bin", name + suffix);
        if (!Files.isRegularFile(path)) throw new JavaAnalysisContext.Failure("java_context_incomplete", "Configured JDK has no " + name);
        return path.toString();
    }
    private static int process(Job job, List<String> command, Path directory, long seconds, String phase) throws Exception {
        ProcessBuilder builder = new ProcessBuilder(command).directory(directory.toFile());
        for (String name : List.of("JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "_JAVA_OPTIONS", "CLASSPATH")) builder.environment().remove(name);
        Process process = builder.start();
        job.process = process;
        process.getOutputStream().close(); // No interactive stdin in this version.
        Thread stdout = Thread.startVirtualThread(() -> pump(job, process.getInputStream(), phase, false));
        Thread stderr = Thread.startVirtualThread(() -> pump(job, process.getErrorStream(), phase, true));
        try {
            if (job.stopped) { kill(process); return -1; }
            if (!process.waitFor(seconds, TimeUnit.SECONDS)) {
                kill(process); throw new IOException((phase.equals("compile") ? "Compilation" : "Program") + " exceeded the time limit");
            }
            stdout.join(2000); stderr.join(2000);
            if (job.outputLimit) throw new IOException("Java output exceeded 256 KiB");
            return process.exitValue();
        } finally { job.process = null; }
    }
    private static void pump(Job job, InputStream input, String phase, boolean error) {
        try (Reader reader = new InputStreamReader(input, StandardCharsets.UTF_8)) {
            char[] buffer = new char[1024]; int count;
            while ((count = reader.read(buffer)) >= 0) if (count > 0) job.append(phase, error, buffer, count);
        } catch (IOException ignored) { /* Process termination closes its pipes. */ }
    }
    private static void kill(Process process) {
        process.toHandle().descendants().forEach(child -> { if (child.isAlive()) child.destroyForcibly(); });
        process.destroyForcibly();
    }
    private static JsonObject ok() { JsonObject value = new JsonObject(); value.addProperty("status", "ok"); return value; }
    private static JsonObject idle() { JsonObject value = ok(); value.addProperty("state", "idle"); return value; }

    private static final class Job {
        final int projectId; final String id = UUID.randomUUID().toString(), main, revision;
        volatile Process process; volatile boolean stopped, outputLimit;
        String state = "preparing", message; Integer exitCode;
        final StringBuilder output = new StringBuilder(), errors = new StringBuilder();
        Job(int projectId, String main, String revision) { this.projectId = projectId; this.main = main; this.revision = revision; }
        synchronized boolean active() { return Set.of("preparing", "compiling", "running").contains(state); }
        synchronized void stage(String next) { if (!stopped) state = next; }
        synchronized void finish(String next, Integer code, String detail) { if (!stopped) { state = next; exitCode = code; message = detail; } }
        synchronized void append(String phase, boolean error, char[] characters, int count) {
            if (stopped || outputLimit) return;
            int remaining = OUTPUT_LIMIT - output.length() - errors.length();
            if (remaining <= 0 || count > remaining) { outputLimit = true; Process running = process; if (running != null) kill(running); return; }
            (error ? errors : output).append(characters, 0, count);
        }
        void stop() {
            synchronized (this) { if (!active()) return; stopped = true; state = "stopped"; message = "Execution interrupted"; }
            Process running = process; if (running != null) kill(running);
        }
        synchronized JsonObject view() {
            JsonObject result = ok(); result.addProperty("id", id); result.addProperty("projectId", projectId);
            result.addProperty("state", state); result.addProperty("main", main); result.addProperty("contextRevision", revision);
            result.addProperty("output", output.toString()); result.addProperty("errors", errors.toString());
            if (exitCode != null) result.addProperty("exitCode", exitCode);
            if (message != null) result.addProperty("message", message);
            return result;
        }
    }
    @Override public void close() {
        latest.values().forEach(Job::stop);
        for(var queued:workers.shutdownNow())if(queued instanceof RunTask task)task.release();
        latest.clear();
    }
}
