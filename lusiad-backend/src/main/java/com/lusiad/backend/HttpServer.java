package com.lusiad.backend;

import com.intellij.openapi.project.Project;
import com.lusiad.backend.router.psi.PsiRouter;
import com.lusiad.backend.router.fs.FsRouter;
import com.lusiad.backend.router.restore.RestoreRouter;

import java.io.IOException;
import java.net.InetSocketAddress;

public class HttpServer {
    private com.sun.net.httpserver.HttpServer server;
    private final int port;
    private final Project project;
    private com.lusiad.backend.router.diagnostics.JavaDiagnosticsRouter javaDiagnostics;
    private com.lusiad.backend.router.undo.UndoRouter undo;
    private com.lusiad.backend.router.run.JavaRunRouter javaRun;
    private FsRouter files;

    public HttpServer(Project project, int port) {
        this.project = project;
        this.port = port;
    }

    public synchronized void start() throws IOException {
        if (server != null) return;
        var test = com.lusiad.backend.config.RuntimeEnvironment.loadTest();
        if (test != null && port != com.lusiad.backend.config.RuntimeEnvironment.apiPort()) {
            throw new IOException("API port differs from the test manifest");
        }
        com.sun.net.httpserver.HttpServer candidate = com.sun.net.httpserver.HttpServer
                .create(new InetSocketAddress("127.0.0.1", port), 0);
        try {
            var settings = com.lusiad.backend.config.OperationalSettings.load();
            var access = new com.lusiad.backend.config.LocalApiAccess(
                    test == null ? settings.clientOrigin() : test.manifest().get("frontendUrl").getAsString(),
                    com.lusiad.backend.config.LocalApiToken.ensure(settings));
            candidate.createContext("/_lusiad/runtime", exchange -> {
                if (!access.authorize(exchange)) return;
                if (com.lusiad.backend.config.RuntimeEnvironment.testMode()) { exchange.sendResponseHeaders(404, -1); exchange.close(); return; }
                if (!"GET".equals(exchange.getRequestMethod())) { exchange.sendResponseHeaders(405, -1); exchange.close(); return; }
                try {
                    var db = com.lusiad.backend.service.change.ChangeLogService.databaseConfiguration();
                    try (var connection = new com.lusiad.backend.repository.sql.SqlConnectionFactory(db).openConnection(3000, 3000)) {
                        if (!connection.isValid(2)) throw new java.sql.SQLException("Database unavailable");
                    }
                    var value = new com.google.gson.JsonObject();
                    value.addProperty("version", 1);
                    value.addProperty("apiAccessVersion", 1);
                    value.addProperty("apiPort", candidate.getAddress().getPort());
                    String identity = db.host.toLowerCase(java.util.Locale.ROOT) + "\n" + db.port + "\n" + db.database;
                    value.addProperty("databaseId", java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(identity.getBytes(java.nio.charset.StandardCharsets.UTF_8))));
                    com.lusiad.backend.config.RuntimeEnvironment.send(exchange, 200, value.toString());
                } catch (Exception | LinkageError failure) { com.lusiad.backend.config.RuntimeEnvironment.send(exchange, 503, "{\"code\":\"configuration_unavailable\"}"); }
            });
            candidate.createContext("/_lusiad/test-context", exchange -> {
                if (!access.authorize(exchange)) return;
                try {
                  var environment = com.lusiad.backend.config.RuntimeEnvironment.loadTest();
                  if (environment == null) { exchange.sendResponseHeaders(404, -1); exchange.close(); return; }
                  if (!"GET".equals(exchange.getRequestMethod())) { exchange.sendResponseHeaders(405, -1); exchange.close(); return; }
                  try (var connection = new com.lusiad.backend.repository.sql.SqlConnectionFactory(
                        com.lusiad.backend.repository.sql.SqlConnectionConfig.load()).openConnection(5000, 5000)) {
                    var context = com.lusiad.backend.config.RuntimeEnvironment.context();
                    context.addProperty("service", "backend"); context.addProperty("ready", true);
                    context.addProperty("pid", ProcessHandle.current().pid());
                    com.lusiad.backend.config.RuntimeEnvironment.send(exchange, 200, context.toString());
                  }
                } catch (Exception failure) {
                    com.lusiad.backend.config.RuntimeEnvironment.send(exchange, 503, "{\"ready\":false,\"code\":\"test_environment_unavailable\"}");
                }
            });
            new PsiRouter(project, access).register(candidate);
            javaDiagnostics = new com.lusiad.backend.router.diagnostics.JavaDiagnosticsRouter(project, access);
            javaDiagnostics.register(candidate);
            new com.lusiad.backend.router.uml.UmlRouter(project, access).register(candidate);
            files = new FsRouter(project, access); files.register(candidate);
            undo = new com.lusiad.backend.router.undo.UndoRouter(project, access); undo.register(candidate);
            javaRun = new com.lusiad.backend.router.run.JavaRunRouter(access); javaRun.register(candidate);
            new RestoreRouter(project, access).register(candidate);
            new com.lusiad.backend.router.project.ProjectManagementRouter(project, access).register(candidate);
            new com.lusiad.backend.router.project.ProjectPresenceRouter(access).register(candidate);
            candidate.setExecutor(null);
            candidate.start();
            server = candidate;
        } catch (IOException | RuntimeException | Error failure) {
            if (javaDiagnostics != null) { javaDiagnostics.close(); javaDiagnostics = null; }
            if (undo != null) { undo.close(); undo = null; }
            if (javaRun != null) { javaRun.close(); javaRun = null; }
            if (files != null) { files.close(); files = null; }
            candidate.stop(0);
            throw failure;
        }
    }

    public synchronized boolean isRunning() {
        return server != null;
    }

    public synchronized void stop() {
        com.lusiad.backend.service.undo.UndoRegistry.clear();
        if (undo != null) { undo.close(); undo = null; }
        if (javaRun != null) { javaRun.close(); javaRun = null; }
        if (files != null) { files.close(); files = null; }
        if (javaDiagnostics != null) { javaDiagnostics.close(); javaDiagnostics = null; }
        if (server != null) {
            server.stop(0);
            server = null;
        }
    }
}
