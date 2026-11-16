package com.lusiad.backend.router.run;

import com.intellij.openapi.diagnostic.Logger;
import com.lusiad.backend.config.LocalApiAccess;
import com.lusiad.backend.handler.*;
import com.lusiad.backend.router.Router;
import com.lusiad.backend.service.diagnostics.JavaAnalysisContext;
import com.lusiad.backend.service.run.JavaRunService;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.util.List;

/** Authenticated local boundary for saved-source Java execution. */
public final class JavaRunRouter extends Router implements AutoCloseable {
    private final Handler handler = new Handler();
    public JavaRunRouter(LocalApiAccess access) { super(access); }
    @Override public void register(HttpServer server) {
        for (String action : List.of("list", "start", "status", "stop")) server.createContext("/run/" + action, exchange -> {
            if (!handleCors(exchange)) handler.handle(exchange);
        });
    }
    @Override public void close() { handler.runs.close(); }

    private static final class Handler extends BaseHandler {
        private static final Logger LOG = Logger.getInstance(Handler.class);
        final JavaRunService runs = new JavaRunService();
        void handle(HttpExchange exchange) {
            handleSafely(exchange, LOG, () -> {
                requirePost(exchange);
                var request = parseBody(exchange);
                try(var activity=com.lusiad.backend.service.project.ProjectActivity.enter(Integer.parseInt(request.get("projectId")))) {
                    var paths = resolveProject(request.get("projectId"));
                    String route = exchange.getRequestURI().getPath();
                    String result = switch (route) {
                        case "/run/list" -> runs.list(paths.basePath, paths.tempPath).toString();
                        case "/run/start" -> runs.start(paths.id, paths.basePath, paths.tempPath,
                                request.get("main"), request.get("contextRevision"),com.lusiad.backend.service.project.ProjectActivity.enter(paths.id)).toString();
                        case "/run/status" -> runs.status(paths.id).toString();
                        case "/run/stop" -> runs.stop(paths.id, request.get("runId")).toString();
                        default -> throw new IllegalArgumentException("Unknown Java run action");
                    };
                    send(exchange, 200, result);
                } catch (com.lusiad.backend.service.project.ProjectManagementService.Failure failure) {
                    send(exchange,409,ApiJson.error(failure.code,"Project administration is in progress"));
                } catch (JavaAnalysisContext.Failure failure) {
                    int status = failure.code.equals("java_run_busy") || failure.code.equals("java_run_stale")
                            || failure.code.equals("java_context_stale") || failure.code.equals("java_main_unavailable") ? 409 : 503;
                    send(exchange, status, ApiJson.error(failure.code, failure.getMessage()));
                } catch (IOException failure) {
                    send(exchange, 503, ApiJson.error("java_run_unavailable", failure.getMessage()));
                }
            });
        }
    }
}
