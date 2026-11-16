package com.lusiad.backend.router.restore;

import com.intellij.openapi.project.Project;
import com.sun.net.httpserver.HttpServer;

import com.lusiad.backend.router.Router;
import com.lusiad.backend.handler.restore.RestoreHandlers;

public class RestoreRouter extends Router {

    private final Project project;

    public RestoreRouter(Project project, com.lusiad.backend.config.LocalApiAccess access) {
        super(access);
        this.project = project;
    }

    @Override
    public void register(HttpServer server) {
        server.createContext("/restore/apply", exchange -> {
            if (handleCors(exchange)) return;
            RestoreHandlers.handleApply(project, exchange);
        });
        server.createContext("/restore/pending", exchange -> {
            if (handleCors(exchange)) return;
            RestoreHandlers.handlePending(project, exchange);
        });
        server.createContext("/restore/rewind/preview", exchange -> {
            if (handleCors(exchange)) return;
            RestoreHandlers.handleRewind(project, exchange, false);
        });
        server.createContext("/restore/rewind/apply", exchange -> {
            if (handleCors(exchange)) return;
            RestoreHandlers.handleRewind(project, exchange, true);
        });
        server.createContext("/restore/commit/check", exchange -> {
            if (handleCors(exchange)) return;
            RestoreHandlers.handleCommitCheck(project, exchange, false);
        });
        server.createContext("/restore/commit/refresh", exchange -> {
            if (handleCors(exchange)) return;
            RestoreHandlers.handleCommitCheck(project, exchange, true);
        });
    }
}
