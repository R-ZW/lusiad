package com.lusiad.backend.router.psi;

import com.intellij.openapi.project.Project;
import com.sun.net.httpserver.HttpServer;

import com.lusiad.backend.router.Router;
import com.lusiad.backend.handler.psi.PsiGenericHandlers;

public class PsiRouter extends Router {

    private final Project project;

    public PsiRouter(Project project, com.lusiad.backend.config.LocalApiAccess access) {
        super(access);
        this.project = project;
    }

    @Override
    public void register(HttpServer server) {
        server.createContext("/psi/recover", exchange -> {
            if (handleCors(exchange)) return;
            PsiGenericHandlers.handleRecover(project, exchange);
        });
        server.createContext("/psi/read", exchange -> {
            if (handleCors(exchange)) return;
            PsiGenericHandlers.handleRead(project, exchange);
        });

        server.createContext("/psi/parse", exchange -> {
            if (handleCors(exchange)) return;
            PsiGenericHandlers.handleParse(project, exchange);
        });

        server.createContext("/psi/diagnose", exchange -> {
            if (handleCors(exchange)) return;
            PsiGenericHandlers.handleDiagnose(project, exchange);
        });
        server.createContext("/psi/diagnose-edit", exchange -> {
            if (handleCors(exchange)) return;
            PsiGenericHandlers.handleDiagnose(project, exchange);
        });

        server.createContext("/psi/create", exchange -> {
            if (handleCors(exchange)) return;
            PsiGenericHandlers.handleCreate(project, exchange);
        });

        server.createContext("/psi/move", exchange -> {
            if (handleCors(exchange)) return;
            PsiGenericHandlers.handleMove(project, exchange);
        });

        server.createContext("/psi/delete", exchange -> {
            if (handleCors(exchange)) return;
            PsiGenericHandlers.handleDelete(project, exchange);
        });

        server.createContext("/psi/update", exchange -> {
            if (handleCors(exchange)) return;
            PsiGenericHandlers.handleUpdate(project, exchange);
        });

    }
}
