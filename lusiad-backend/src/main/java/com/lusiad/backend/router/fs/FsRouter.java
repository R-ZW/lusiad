package com.lusiad.backend.router.fs;

import com.intellij.openapi.project.Project;
import com.sun.net.httpserver.HttpServer;

import com.lusiad.backend.router.Router;
import com.lusiad.backend.handler.fs.FsFileHandlers;
import com.lusiad.backend.handler.fs.FsDirHandlers;

public class FsRouter extends Router implements AutoCloseable {

    private final Project project;
    private final com.lusiad.backend.service.fs.NativeDirectoryPicker picker = new com.lusiad.backend.service.fs.NativeDirectoryPicker();

    public FsRouter(Project project, com.lusiad.backend.config.LocalApiAccess access) {
        super(access);
        this.project = project;
        com.intellij.openapi.util.Disposer.register(project, (com.intellij.openapi.Disposable) picker::close);
    }

    @Override public void close() { picker.close(); }

    @Override
    public void register(HttpServer server) {
        server.createContext("/fs/directory-picker", exchange -> {
            if (handleCors(exchange)) return;
            com.lusiad.backend.handler.fs.FsBrowseHandlers.chooseDirectory(project, picker, exchange);
        });
        server.createContext("/fs/reveal", exchange -> {
            if (handleCors(exchange)) return;
            com.lusiad.backend.handler.fs.FsBrowseHandlers.reveal(exchange);
        });
        // ── File endpoints ──────────────────────────────────────────────────
        server.createContext("/fs/file/create", exchange -> {
            if (handleCors(exchange)) return;
            FsFileHandlers.handleCreate(project, exchange);
        });

        server.createContext("/fs/file/delete", exchange -> {
            if (handleCors(exchange)) return;
            FsFileHandlers.handleDelete(project, exchange);
        });

        server.createContext("/fs/file/rename", exchange -> {
            if (handleCors(exchange)) return;
            FsFileHandlers.handleRename(project, exchange);
        });

        server.createContext("/fs/file/move", exchange -> {
            if (handleCors(exchange)) return;
            FsFileHandlers.handleMove(project, exchange);
        });

        // ── Directory endpoints ─────────────────────────────────────────────
        server.createContext("/fs/dir/create", exchange -> {
            if (handleCors(exchange)) return;
            FsDirHandlers.handleCreate(project, exchange);
        });

        server.createContext("/fs/dir/delete", exchange -> {
            if (handleCors(exchange)) return;
            FsDirHandlers.handleDelete(project, exchange);
        });

        server.createContext("/fs/dir/rename", exchange -> {
            if (handleCors(exchange)) return;
            FsDirHandlers.handleRename(project, exchange);
        });

        server.createContext("/fs/dir/move", exchange -> {
            if (handleCors(exchange)) return;
            FsDirHandlers.handleMove(project, exchange);
        });
    }
}
