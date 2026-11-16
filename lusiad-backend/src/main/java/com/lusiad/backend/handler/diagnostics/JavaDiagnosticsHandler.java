package com.lusiad.backend.handler.diagnostics;

import com.google.gson.*;
import com.intellij.openapi.project.Project;
import com.lusiad.backend.config.OperationalSettings;
import com.lusiad.backend.handler.*;
import com.lusiad.backend.service.diagnostics.*;
import com.lusiad.backend.service.psi.PsiService;
import com.sun.net.httpserver.HttpExchange;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.*;

public final class JavaDiagnosticsHandler extends BaseHandler implements AutoCloseable {
    private static final Gson JSON = new GsonBuilder().serializeNulls().create();
    private static final com.intellij.openapi.diagnostic.Logger LOG = com.intellij.openapi.diagnostic.Logger.getInstance(JavaDiagnosticsHandler.class);
    private final JavaAnalysisJobs jobs = new JavaAnalysisJobs();
    private final Project host;
    public JavaDiagnosticsHandler(Project host) { this.host = host; }
    public void handle(HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);
            Map<String, String> request = parseBody(exchange);
            String route = exchange.getRequestURI().getPath();
            String channel = switch (route) {
                case "/java/context" -> "context";
                case "/java/check" -> "check";
                case "/java/analyze-edit" -> "proposal";
                case "/java/cancel" -> request.get("channel");
                default -> "saved";
            };
            String key = request.get("projectId") + ":" + channel;
            if (route.equals("/java/cancel")) { jobs.cancel(key, request.get("requestId")); send(exchange, 200, "{\"status\":\"ok\"}"); return; }
            var settings = OperationalSettings.load();
            int timeout = settings.integer("LUSIAD_API_TIMEOUT_MS", 60000, 0, 120000);
            jobs.submit(key, request.get("requestId"), timeout == 0 ? 60000 : timeout, checkpoint -> {
                try (var activity=com.lusiad.backend.service.project.ProjectActivity.enter(Integer.parseInt(request.get("projectId")))) {
                    var paths = resolveProject(request.get("projectId"));
                    Path root = Path.of(paths.basePath);
                    if (route.equals("/java/context")) {
                        if (request.containsKey("settings")) JavaProjectSettings.save(root, settings.configFile, request.get("configurationRevision"), JsonParser.parseString(request.get("settings")).getAsJsonObject());
                        return JSON.toJson(JavaProjectSettings.view(root, settings.configFile));
                    }
                    var snapshot = JavaAnalysisContext.capture(paths.basePath, paths.tempPath, settings.configFile, checkpoint);
                    if (route.equals("/java/check")) {
                        if (!snapshot.revision().equals(request.get("contextRevision"))) throw new JavaAnalysisContext.Failure("java_context_stale", "Sources, dependencies or Java settings changed; analyze again");
                        return "{\"status\":\"ok\"}";
                    }
                    JavaCompilerDiagnostics.Overlay overlay = null;
                    if (route.equals("/java/analyze-edit")) {
                        String file = projectRelativePath(paths, request.get("path"), false);
                        var original = snapshot.sources().get(file);
                        if (original == null || !original.revision().equals(request.get("expectedHash")) || !original.content().equals(request.get("sourceContent")))
                            throw new JavaAnalysisContext.Failure("revision_conflict", "Proposal does not match captured source; reload before analyzing");
                        if (host == null || host.isDisposed()) throw new JavaAnalysisContext.Failure("java_analysis_unavailable", "Proposal PSI context is unavailable");
                        String proposed = PsiService.proposedEdit(host, file, original.content(), request, request.get("operation"));
                        overlay = new JavaCompilerDiagnostics.Overlay(file, original.revision(), proposed);
                    }
                    var result = JavaCompilerDiagnostics.analyze(snapshot, request.get("requestId"), overlay, checkpoint);
                    var after = JavaAnalysisContext.capture(paths.basePath, paths.tempPath, settings.configFile, checkpoint);
                    if (!snapshot.revision().equals(after.revision())) throw new JavaAnalysisContext.Failure("java_context_stale", "Project changed during Java analysis; analyze again");
                    return JSON.toJson(result);
                } catch (HandlerException failure) { throw new CompletionException(failure); }
                catch (java.io.IOException failure) { throw new JavaAnalysisContext.Failure("java_context_incomplete", failure.getMessage()); }
            }).whenComplete((body, error) -> {
                try {
                    if (error == null) { send(exchange, 200, body); return; }
                    Throwable cause = error;
                    while (cause instanceof CompletionException && cause.getCause() != null) cause = cause.getCause();
                    if (cause instanceof HandlerException failure) { send(exchange, failure.status, failure.body); return; }
                    String code = cause instanceof JavaAnalysisContext.Failure failure ? failure.code
                            : cause instanceof TimeoutException || cause instanceof CancellationException ? "java_analysis_cancelled" : "java_analysis_failed";
                    int status = code.endsWith("stale") || code.equals("revision_conflict") || code.endsWith("conflict") || code.endsWith("cancelled") ? 409 : 503;
                    String message = cause.getMessage() == null ? code : cause.getMessage();
                    if (code.equals("java_analysis_failed")) LOG.warn("Java analysis failed", cause);
                    send(exchange, status, ApiJson.error(code, message));
                } catch (java.io.IOException disconnected) { exchange.close(); }
            });
        });
    }
    @Override public void close() { jobs.close(); }
}
