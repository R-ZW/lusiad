package com.lusiad.backend.router.undo;

import com.google.gson.*;
import com.intellij.openapi.project.Project;
import com.lusiad.backend.config.*;
import com.lusiad.backend.handler.*;
import com.lusiad.backend.router.Router;
import com.lusiad.backend.service.undo.*;
import com.lusiad.backend.service.diagnostics.*;
import com.lusiad.backend.service.psi.*;
import java.util.*;

/** Same authenticated local boundary and bounded analysis workers as P29; no arbitrary snapshot writes. */
public final class UndoRouter extends Router implements AutoCloseable {
    private final Handler handler;
    public UndoRouter(Project project, LocalApiAccess access) { super(access); handler = new Handler(project); }
    @Override public void register(com.sun.net.httpserver.HttpServer server) {
        for (String action : List.of("status", "preview", "analyze", "apply", "receipt", "cancel")) server.createContext("/undo/" + action, exchange -> {
            if (handleCors(exchange)) return; handler.handle(exchange);
        });
    }
    @Override public void close() { handler.jobs.close(); }
    private static final class Handler extends BaseHandler {
        private static final com.intellij.openapi.diagnostic.Logger LOG = com.intellij.openapi.diagnostic.Logger.getInstance(Handler.class);
        final Project host; final JavaAnalysisJobs jobs = new JavaAnalysisJobs();
        Handler(Project host) { this.host = host; }
        void handle(com.sun.net.httpserver.HttpExchange exchange) {
            handleSafely(exchange, LOG, () -> {
                requirePost(exchange); var req = parseBody(exchange); var paths = resolveProject(req.get("projectId"));
                String action = exchange.getRequestURI().getPath().substring(6);
                String key = paths.id + ":undo:" + (action.equals("analyze") || action.equals("cancel") ? "analysis" : UUID.randomUUID());
                if (action.equals("cancel")) { jobs.cancel(key, req.get("requestId")); send(exchange, 200, "{\"status\":\"ok\"}"); return; }
                jobs.submit(key, req.getOrDefault("requestId", UUID.randomUUID().toString()), timeout(), checkpoint -> {
                    try {
                        checkpoint.run();
                        if (action.equals("status")) return UndoService.status(host, paths.id, paths.basePath).toString();
                        if (action.equals("receipt")) return UndoService.receipt(host, paths.id, paths.basePath, req).toString();
                        if (action.equals("apply")) {
                            if (req.containsKey("contextRevision")) {
                                var snapshot = JavaAnalysisContext.capture(paths.basePath, paths.tempPath, OperationalSettings.load().configFile, checkpoint);
                                if (!snapshot.revision().equals(req.get("contextRevision"))) throw new JavaAnalysisContext.Failure("java_context_stale", "Java context changed before applying undo/redo");
                            }
                            return UndoService.apply(host, paths.id, paths.basePath, req).toString();
                        }
                        var proposal = UndoService.preview(host, paths.id, paths.basePath, req);
                        if (action.equals("preview")) return proposal.view().toString();
                        if ("true".equals(req.get("semantic"))) {
                            var snapshot = JavaAnalysisContext.capture(paths.basePath, paths.tempPath, OperationalSettings.load().configFile, checkpoint);
                            SortedMap<String,JavaAnalysisContext.Source> sources = new TreeMap<>(snapshot.sources());
                            Set<String> affected = new TreeSet<>(proposal.before().entries().keySet()); affected.addAll(proposal.after().entries().keySet());
                            for (String file : affected) {
                                if (!file.toLowerCase(Locale.ROOT).endsWith(".java")) continue;
                                sources.remove(file); var entry = proposal.after().entries().get(file);
                                if (entry == null || !entry.kind().equals("file")) continue;
                                Boolean test = role(paths.basePath, file, snapshot.settings());
                                if (test == null) throw new JavaAnalysisContext.Failure("java_context_incomplete", "Restored Java file is outside configured source roots: " + file);
                                String text = UndoService.text(entry); sources.put(file, new JavaAnalysisContext.Source(file, text, EditCoordinator.hash(text), test));
                            }
                            var overlaid = new JavaAnalysisContext.Snapshot(snapshot.revision(), snapshot.settings(), sources, snapshot.classpath(), snapshot.modulePath());
                            var result = JavaCompilerDiagnostics.analyze(overlaid, req.get("requestId"), null, checkpoint);
                            var after = JavaAnalysisContext.capture(paths.basePath, paths.tempPath, OperationalSettings.load().configFile, checkpoint);
                            if (!after.revision().equals(snapshot.revision())) throw new JavaAnalysisContext.Failure("java_context_stale", "Project changed during undo analysis");
                            UndoService.preview(host, paths.id, paths.basePath, req); return ResourceImage.JSON.toJson(result);
                        }
                        JsonArray results = new JsonArray();
                        for (var item : proposal.after().entries().entrySet()) {
                            checkpoint.run();
                            if (item.getKey().toLowerCase(Locale.ROOT).endsWith(".java") && item.getValue().kind().equals("file") && !Objects.equals(item.getValue(), proposal.before().entries().get(item.getKey())))
                                results.add(ResourceImage.JSON.toJsonTree(SyntaxDiagnostics.analyze(host, new SyntaxDiagnostics.Request(item.getKey(), UndoService.text(item.getValue()), null))));
                        }
                        UndoService.preview(host, paths.id, paths.basePath, req);
                        JsonObject result = new JsonObject(); result.addProperty("status", "ok"); result.add("files", results); return result.toString();
                    } catch (RuntimeException failure) { throw failure; }
                    catch (Exception failure) { throw new java.util.concurrent.CompletionException(failure); }
                }).whenComplete((result, error) -> {
                    try {
                        if (error == null) { send(exchange, 200, result); return; }
                        Throwable cause = error; while (cause instanceof java.util.concurrent.CompletionException && cause.getCause() != null) cause = cause.getCause();
                        send(exchange, 409, ResourceEdits.error(cause instanceof Exception failure ? failure : new Exception(cause)));
                    } catch (Exception disconnected) { exchange.close(); }
                });
            });
        }
        private static int timeout() { int value = OperationalSettings.load().integer("LUSIAD_API_TIMEOUT_MS", 60000, 0, 120000); return value == 0 ? 60000 : value; }
        private static Boolean role(String root, String file, JavaAnalysisContext.Settings settings) {
            if (Arrays.stream(file.split("/")).anyMatch(part -> part.startsWith(".") || Set.of("node_modules", "build", "dist", "out", "target").contains(part))) return null;
            Boolean role = null; int length = -1;
            for (boolean test : List.of(false, true)) for (String source : test ? settings.testRoots() : settings.sourceRoots()) {
                String path = com.lusiad.backend.service.fs.ContainedPaths.relative(root, source, true);
                if ((path.isEmpty() || ResourceImage.within(file, path)) && path.length() > length) { role = test; length = path.length(); }
            }
            return role;
        }
    }
}
