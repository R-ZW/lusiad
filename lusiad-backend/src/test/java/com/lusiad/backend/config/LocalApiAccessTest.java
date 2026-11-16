package com.lusiad.backend.config;

import com.google.gson.JsonParser;
import com.lusiad.backend.router.fs.FsRouter;
import com.sun.net.httpserver.HttpServer;
import junit.framework.TestCase;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.Map;
import java.util.Properties;

public class LocalApiAccessTest extends TestCase {
    private static final String TOKEN = "fixture-token-" + "x".repeat(32);

    public void testUnidentifiedForeignAndSimpleBrowserRequestsAreRefusedBeforeHandlers() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        new FsRouter(null, new LocalApiAccess("http://localhost:3000", TOKEN)).register(server);
        server.start();
        String base = "http://127.0.0.1:" + server.getAddress().getPort();
        try (HttpClient client = HttpClient.newHttpClient()) {
            assertEquals(403, post(client, base, null, null, "application/json").statusCode());
            assertEquals(403, post(client, base, null, "http://localhost:3000", "application/json").statusCode());
            assertEquals(403, post(client, base, "wrong", null, "application/json").statusCode());
            for (String origin : new String[]{"http://evil.example", "null", "http://localhost:3001", "http://localhost:3000.evil.example"}) {
                assertEquals(origin, 403, post(client, base, TOKEN, origin, "application/json").statusCode());
            }
            assertEquals(415, post(client, base, TOKEN, "http://localhost:3000", "text/plain").statusCode());
            assertEquals(415, post(client, base, TOKEN, null, "application/x-www-form-urlencoded").statusCode());
            // A valid Next-style request (no Origin) and allowed browser-origin request reach the real JSON validator.
            assertEquals(400, post(client, base, TOKEN, null, "application/json").statusCode());
            var allowed = post(client, base, TOKEN, "http://localhost:3000", "application/json; charset=utf-8");
            assertEquals(400, allowed.statusCode());
            assertEquals("http://localhost:3000", allowed.headers().firstValue("Access-Control-Allow-Origin").orElseThrow());
            var options = HttpRequest.newBuilder(URI.create(base + "/fs/file/create")).method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                    .header("Origin", "http://localhost:3000").header("Access-Control-Request-Method", "POST")
                    .header("Access-Control-Request-Headers", "content-type,x-lusiad-token").build();
            assertEquals(204, client.send(options, HttpResponse.BodyHandlers.ofString()).statusCode());
            var badOptions = HttpRequest.newBuilder(options.uri()).method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                    .header("Origin", "http://evil.example").header("Access-Control-Request-Method", "POST").build();
            assertEquals(403, client.send(badOptions, HttpResponse.BodyHandlers.ofString()).statusCode());
            try (Socket socket = new Socket("127.0.0.1", server.getAddress().getPort())) {
                socket.setSoTimeout(5000);
                socket.getOutputStream().write(("POST /fs/file/create HTTP/1.1\r\nHost: evil.example:" + server.getAddress().getPort()
                        + "\r\nX-Lusiad-Token: " + TOKEN + "\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}")
                        .getBytes(StandardCharsets.UTF_8));
                String response = new String(socket.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
                assertTrue(response, response.startsWith("HTTP/1.1 403"));
                assertFalse(response.contains(TOKEN));
            }
            // Rejection does not poison the following request.
            assertEquals(400, post(client, base, TOKEN, null, "application/json").statusCode());
        } finally { server.stop(0); }
    }

    private HttpResponse<String> post(HttpClient client, String base, String token, String origin, String type) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(base + "/fs/file/create"))
                .POST(HttpRequest.BodyPublishers.ofString("{}"));
        if (token != null) request.header(LocalApiAccess.TOKEN_HEADER, token);
        if (origin != null) request.header("Origin", origin);
        request.header("Content-Type", type);
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    public void testTokenBootstrapPreservesSharedValuesAndRespectsSettingsLock() throws Exception {
        Path root = Files.createTempDirectory("lusiad-api-config-");
        Path file = root.resolve("config.json");
        try {
            Files.writeString(file, "{\"version\":1,\"tempRoot\":\"keep\",\"database\":{\"password\":\"fixture-secret\"},\"extension\":{\"keep\":true,\"nullOption\":null}}");
            var settings = OperationalSettings.read(Map.of("LUSIAD_CONFIG_FILE", file.toString()), new Properties(), root, root);
            String token = LocalApiToken.ensure(settings);
            assertTrue(token.matches("[A-Za-z0-9_-]{43}"));
            var saved = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
            assertEquals("fixture-secret", saved.getAsJsonObject("database").get("password").getAsString());
            assertTrue(saved.getAsJsonObject("extension").get("keep").getAsBoolean());
            assertTrue(saved.getAsJsonObject("extension").get("nullOption").isJsonNull());
            assertEquals("keep", saved.get("tempRoot").getAsString());
            String original = Files.readString(file);
            assertEquals(token, LocalApiToken.ensure(settings)); // Stale reader rereads under the lock, never rotates.
            assertEquals(original, Files.readString(file));
            assertEquals(TOKEN, LocalApiToken.ensure(OperationalSettings.read(Map.of("LUSIAD_CONFIG_FILE", file.toString(), "LUSIAD_API_TOKEN", TOKEN), new Properties(), root, root)));
            assertEquals(original, Files.readString(file));
            Files.delete(file);
            Files.createFile(root.resolve("config.json.lock"));
            try { LocalApiToken.ensure(settings); fail("Concurrent writer ignored"); } catch (FileAlreadyExistsException expected) {}
            assertFalse(Files.exists(file));
        } finally {
            try (var paths = Files.walk(root)) { for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) Files.delete(path); }
        }
    }
}
