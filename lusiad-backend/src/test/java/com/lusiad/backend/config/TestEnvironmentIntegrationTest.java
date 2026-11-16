package com.lusiad.backend.config;

import com.google.gson.JsonParser;
import com.lusiad.backend.HttpServer;
import com.lusiad.backend.repository.sql.SqlConnectionConfig;
import com.lusiad.backend.repository.sql.SqlConnectionFactory;
import org.junit.Assume;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.Duration;

/** Opt-in integration check; attaches only to the disposable lab and frontend. Not UI E2E. */
public class TestEnvironmentIntegrationTest extends org.junit.Assert {
    @org.junit.Test
    public void testLiveFrontendBackendRunnerIdentityAndOwnershipRefusals() throws Exception {
        String configFile = System.getProperty("lusiad.integration.config");
        Assume.assumeTrue("Supply -PlusiadIntegrationConfig after starting an owned lab/frontend", configFile != null);
        String oldProfile = System.getProperty("lusiad.env"), oldConfig = System.getProperty("lusiad.test.config");
        System.setProperty("lusiad.env", "test"); System.setProperty("lusiad.test.config", configFile);
        HttpServer server = null;
        try {
            var test = RuntimeEnvironment.loadTest();
            var sql = SqlConnectionConfig.load();
            try (var connection = new SqlConnectionFactory(sql).openConnection(5000, 5000)) { assertTrue(connection.isValid(2)); }
            server = new HttpServer(null, RuntimeEnvironment.apiPort()); server.start();
            HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build();
            String backendUrl = RuntimeEnvironment.apiUrl();
            String token = LocalApiToken.validate(OperationalSettings.load().value("LUSIAD_API_TOKEN", null));
            var context = client.send(HttpRequest.newBuilder(URI.create(backendUrl + "/_lusiad/test-context")).header(LocalApiAccess.TOKEN_HEADER, token).GET().build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(200, context.statusCode());
            assertEquals(test.hash(), JsonParser.parseString(context.body()).getAsJsonObject().get("configHash").getAsString());
            var refused = client.send(HttpRequest.newBuilder(URI.create(backendUrl + "/fs/file/create"))
                    .POST(HttpRequest.BodyPublishers.ofString("{}")).build(), HttpResponse.BodyHandlers.ofString());
            assertEquals("Unidentified test mutation must be refused before handlers", 403, refused.statusCode());
            var frontendUri = URI.create(test.manifest().get("frontendUrl").getAsString() + "/api/lusiad/test-context");
            var frontend = client.send(HttpRequest.newBuilder(frontendUri).timeout(Duration.ofSeconds(45)).GET().build(), HttpResponse.BodyHandlers.ofString());
            assertEquals("Frontend readiness must include matching backend/SQL", 200, frontend.statusCode());
            var home = client.send(HttpRequest.newBuilder(URI.create(test.manifest().get("frontendUrl").getAsString() + "/"))
                    .timeout(Duration.ofSeconds(45)).GET().build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(200, home.statusCode());
            assertTrue(home.body().contains("data-environment=\"test\""));
            assertTrue(home.body().contains("data-testid=\"project-create\""));
            Path tools = test.root().getParent().getParent().resolve("tools/environment.py");
            Process runner = new ProcessBuilder("python", tools.toString(), "preflight", "--config", configFile).redirectErrorStream(true).start();
            String report = new String(runner.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            assertEquals(report, 0, runner.waitFor());
            assertTrue(report.contains("matching_test_contexts"));

            // This connection was proven owned above. Raw access is confined to fault setup/cleanup.
            String jdbc = "jdbc:mysql://" + sql.host + ":" + sql.port + "/" + sql.database + "?useSSL=false&allowPublicKeyRetrieval=true&connectTimeout=5000&socketTimeout=5000";
            try (var raw = DriverManager.getConnection(jdbc, sql.user, sql.password)) {
                try {
                    try (var update = raw.prepareStatement("UPDATE lusiad_test_context SET config_hash=? WHERE singleton=1")) {
                        update.setString(1, "0".repeat(64)); update.executeUpdate();
                    }
                    var bad = client.send(HttpRequest.newBuilder(URI.create(backendUrl + "/_lusiad/test-context")).header(LocalApiAccess.TOKEN_HEADER, token).GET().build(), HttpResponse.BodyHandlers.ofString());
                    assertEquals("Wrong SQL identity cannot report ready", 503, bad.statusCode());
                    var badFront = client.send(HttpRequest.newBuilder(frontendUri).GET().build(), HttpResponse.BodyHandlers.ofString());
                    assertEquals(503, badFront.statusCode());
                } finally {
                    try (var update = raw.prepareStatement("UPDATE lusiad_test_context SET config_hash=? WHERE singleton=1")) {
                        update.setString(1, test.hash()); update.executeUpdate();
                    }
                }
            }
            assertEquals(200, client.send(HttpRequest.newBuilder(frontendUri).GET().build(), HttpResponse.BodyHandlers.ofString()).statusCode());
        } finally {
            if (server != null) server.stop();
            if (oldProfile == null) System.clearProperty("lusiad.env"); else System.setProperty("lusiad.env", oldProfile);
            if (oldConfig == null) System.clearProperty("lusiad.test.config"); else System.setProperty("lusiad.test.config", oldConfig);
        }
    }
}
