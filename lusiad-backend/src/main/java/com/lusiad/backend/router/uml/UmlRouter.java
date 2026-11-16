package com.lusiad.backend.router.uml;

import com.intellij.openapi.project.Project;
import com.lusiad.backend.config.LocalApiAccess;
import com.lusiad.backend.handler.uml.UmlHandler;
import com.lusiad.backend.router.Router;
import com.sun.net.httpserver.HttpServer;

public final class UmlRouter extends Router {
    private final Project project;
    public UmlRouter(Project project, LocalApiAccess access) { super(access); this.project = project; }
    @Override public void register(HttpServer server) {
        server.createContext("/uml/render", exchange -> {
            if (handleCors(exchange)) return;
            UmlHandler.render(project, exchange);
        });
        server.createContext("/uml/current", exchange -> {
            if (handleCors(exchange)) return;
            UmlHandler.current(project, exchange);
        });
    }
}
