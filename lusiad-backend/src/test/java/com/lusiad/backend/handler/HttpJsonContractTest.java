package com.lusiad.backend.handler;

import com.google.gson.JsonParser;
import com.intellij.testFramework.fixtures.BasePlatformTestCase;
import com.lusiad.backend.handler.fs.FsDirHandlers;
import com.lusiad.backend.handler.fs.FsFileHandlers;
import com.lusiad.backend.handler.psi.PsiGenericHandlers;
import com.lusiad.backend.handler.restore.RestoreHandlers;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/** Actual HTTP handlers on an ephemeral port; invalid input must never reach SQL/PSI. Not UI E2E. */
public class HttpJsonContractTest extends BasePlatformTestCase {
    public void testAllMutationAndReadRoutesRejectBadBodiesBeforeResolvingProjects() throws Exception {
        Map<String, HttpHandler> routes = Map.ofEntries(
                Map.entry("/psi/format", e -> PsiGenericHandlers.handleFormat(null, e)),
                Map.entry("/psi/read", e -> PsiGenericHandlers.handleRead(null, e)),
                Map.entry("/psi/parse", e -> PsiGenericHandlers.handleParse(null, e)),
                Map.entry("/psi/diagnose", e -> PsiGenericHandlers.handleDiagnose(null, e)),
                Map.entry("/psi/diagnose-edit", e -> PsiGenericHandlers.handleDiagnose(null, e)),
                Map.entry("/psi/create", e -> PsiGenericHandlers.handleCreate(null, e)),
                Map.entry("/psi/update", e -> PsiGenericHandlers.handleUpdate(null, e)),
                Map.entry("/psi/delete", e -> PsiGenericHandlers.handleDelete(null, e)),
                Map.entry("/psi/move", e -> PsiGenericHandlers.handleMove(null, e)),
                Map.entry("/fs/file/create", e -> FsFileHandlers.handleCreate(null, e)),
                Map.entry("/fs/file/delete", e -> FsFileHandlers.handleDelete(null, e)),
                Map.entry("/fs/file/rename", e -> FsFileHandlers.handleRename(null, e)),
                Map.entry("/fs/file/move", e -> FsFileHandlers.handleMove(null, e)),
                Map.entry("/fs/dir/create", e -> FsDirHandlers.handleCreate(null, e)),
                Map.entry("/fs/dir/delete", e -> FsDirHandlers.handleDelete(null, e)),
                Map.entry("/fs/dir/rename", e -> FsDirHandlers.handleRename(null, e)),
                Map.entry("/fs/dir/move", e -> FsDirHandlers.handleMove(null, e)),
                Map.entry("/restore/apply", e -> RestoreHandlers.handleApply(null, e)));
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        routes.forEach(server::createContext);
        server.start();
        try (HttpClient client = HttpClient.newHttpClient()) {
            String base = "http://127.0.0.1:" + server.getAddress().getPort();
            for (String route : routes.keySet()) {
                for (String body : new String[]{"{", "[]", "{\"projectId\":1}",
                        "{\"projectId\":true,\"changeId\":false}"}) {
                    var request = HttpRequest.newBuilder(URI.create(base + route)).timeout(Duration.ofSeconds(5))
                            .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body)).build();
                    var response = client.send(request, HttpResponse.BodyHandlers.ofString());
                    assertEquals(route + ": " + body + " -> " + response.body(), 400, response.statusCode());
                    var error = JsonParser.parseString(response.body()).getAsJsonObject();
                    assertEquals("error", error.get("status").getAsString());
                    assertEquals("invalid_request", error.get("code").getAsString());
                    assertTrue(error.has("error"));
                    assertFalse(error.has("tree"));
                }
                var get = client.send(HttpRequest.newBuilder(URI.create(base + route)).GET().build(), HttpResponse.BodyHandlers.ofString());
                assertEquals(405, get.statusCode());
                assertEquals("POST", get.headers().firstValue("Allow").orElseThrow());
            }
            var oversized = HttpRequest.newBuilder(URI.create(base + "/psi/parse"))
                    .POST(HttpRequest.BodyPublishers.ofString(" ".repeat(4 * 1024 * 1024 + 1))).build();
            assertEquals(413, client.send(oversized, HttpResponse.BodyHandlers.ofString()).statusCode());
        } finally { server.stop(0); }
    }
}
