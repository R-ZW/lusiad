package com.lusiad.backend.router.diagnostics;

import com.intellij.openapi.project.Project;
import com.lusiad.backend.config.LocalApiAccess;
import com.lusiad.backend.handler.diagnostics.JavaDiagnosticsHandler;
import com.lusiad.backend.router.Router;
import com.sun.net.httpserver.HttpServer;

public final class JavaDiagnosticsRouter extends Router implements AutoCloseable {
    private final JavaDiagnosticsHandler handler;
    public JavaDiagnosticsRouter(Project project, LocalApiAccess access) { super(access); handler = new JavaDiagnosticsHandler(project); }
    @Override public void register(HttpServer server) {
        for (String path : new String[]{"/java/context", "/java/analyze", "/java/analyze-edit", "/java/check", "/java/cancel"})
            server.createContext(path, exchange -> { if (!handleCors(exchange)) handler.handle(exchange); });
    }
    @Override public void close() { handler.close(); }
}
