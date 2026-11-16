package com.lusiad.backend.config;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.Set;

/** Explicit, fail-closed test profile. No reset/seed/process control is exposed over HTTP. */
public final class RuntimeEnvironment {
    private RuntimeEnvironment() {}
    public record TestConfig(JsonObject manifest, String hash, Path root, Path projects, Path temp) {
        public String runId() { return manifest.get("runId").getAsString(); }
        public JsonObject database() { return manifest.getAsJsonObject("database"); }
    }

    public static String setting(String property, String environment, String fallback) {
        String value = System.getProperty(property);
        if (value == null || value.isBlank()) value = System.getenv(environment);
        return value == null || value.isBlank() ? fallback : value;
    }

    public static boolean testMode() {
        String profile = setting("lusiad.env", "LUSIAD_ENV", "normal");
        if (!profile.equals("normal") && !profile.equals("test")) throw new IllegalArgumentException("Invalid LUSIAD_ENV");
        if (profile.equals("normal") && setting("lusiad.test.config", "LUSIAD_TEST_CONFIG", null) != null) {
            throw new IllegalArgumentException("Test manifest requires LUSIAD_ENV=test; normal fallback refused");
        }
        return profile.equals("test");
    }

    public static TestConfig loadTest() {
        if (!testMode()) return null;
        try {
            String file = setting("lusiad.test.config", "LUSIAD_TEST_CONFIG", "");
            Path path = Path.of(file);
            if (!path.isAbsolute()) throw new IllegalArgumentException("Test config must be absolute");
            byte[] bytes = Files.readAllBytes(path);
            JsonObject raw = JsonParser.parseString(new String(bytes, StandardCharsets.UTF_8)).getAsJsonObject();
            String run = required(raw, "runId");
            if (raw.get("version").getAsInt() != 1 || !run.matches("[a-f0-9]{32}")) throw new IllegalArgumentException("Invalid test manifest");
            Path root = absolute(required(raw, "labRoot")), projects = absolute(required(raw, "projectsRoot")), temp = absolute(required(raw, "tempRoot"));
            if (!root.getFileName().toString().equals(run) || !root.getParent().getFileName().toString().equals(".lab") ||
                !projects.equals(root.resolve("projects")) || !temp.equals(root.resolve("temp")) ||
                !path.normalize().equals(root.resolve("environment.json"))) throw new IllegalArgumentException("Invalid test roots");
            noLinks(root, path);
            noLinks(root, projects);
            noLinks(root, temp);
            if (!Files.isDirectory(projects) || !Files.isDirectory(temp)) throw new IllegalArgumentException("Missing test roots");
            String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
            noLinks(root, root.resolve(".lusiad-test-owner.json"));
            JsonObject owner = JsonParser.parseString(Files.readString(root.resolve(".lusiad-test-owner.json"))).getAsJsonObject();
            if (!run.equals(required(owner, "runId")) || !hash.equals(required(owner, "configHash"))) throw new IllegalArgumentException("Test ownership mismatch");
            int api = testUrl(required(raw, "apiUrl")).getPort(), front = testUrl(required(raw, "frontendUrl")).getPort();
            JsonObject db = raw.getAsJsonObject("database");
            int sql = validPort(db.get("port").getAsInt());
            if (Set.of(3000, 8765, 3306).contains(api) || Set.of(3000, 8765, 3306).contains(front) || sql == 3306 ||
                api == front || api == sql || front == sql || !"127.0.0.1".equals(required(db, "host")) ||
                !required(db, "name").equals("lusiad_e2e_" + run) || !required(db, "user").equals("lusiad_e2e")) {
                throw new IllegalArgumentException("Test services are not isolated");
            }
            required(db, "password"); required(db, "serverUuid"); required(db, "dataDirectory");
            if (!required(raw, "schemaHash").matches("[a-f0-9]{64}")) throw new IllegalArgumentException("Invalid schema fingerprint");
            int timeout = raw.get("requestTimeoutMs").getAsInt();
            JsonObject columns = raw.getAsJsonObject("schemaColumns");
            if (columns == null || columns.size() != 10) throw new IllegalArgumentException("Incomplete test schema");
            if (timeout < 1000 || timeout > 120000) throw new IllegalArgumentException("Invalid test timeout");
            return new TestConfig(raw, hash, root, projects, temp);
        } catch (Exception failure) {
            // Deliberately omit JSON/driver exception details: the manifest contains credentials.
            throw new IllegalArgumentException("Invalid or unowned Lusiad test environment");
        }
    }

    private static Path absolute(String value) {
        Path path = Path.of(value);
        if (!path.isAbsolute()) throw new IllegalArgumentException("Absolute test path required");
        return path.normalize();
    }

    private static String required(JsonObject object, String key) {
        String value = object.get(key).getAsString();
        if (value.isBlank() || value.indexOf('\0') >= 0) throw new IllegalArgumentException("Missing test setting");
        return value;
    }

    private static URI testUrl(String value) {
        URI uri = URI.create(value);
        validPort(uri.getPort());
        if (!"http".equals(uri.getScheme()) || !"127.0.0.1".equals(uri.getHost()) || uri.getUserInfo() != null ||
            uri.getQuery() != null || uri.getFragment() != null || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))) {
            throw new IllegalArgumentException("Test URL must be a loopback origin");
        }
        return uri;
    }

    private static int validPort(int value) {
        if (value < 1 || value > 65535) throw new IllegalArgumentException("Invalid API/database port");
        return value;
    }

    public static int apiPort() {
        TestConfig test = loadTest();
        return test != null ? testUrl(required(test.manifest(), "apiUrl")).getPort()
            : normalApiPort();
    }

    private static int normalApiPort() {
        URI uri = URI.create(OperationalSettings.load().apiUrl());
        return uri.getPort() == -1 ? 80 : uri.getPort();
    }

    public static String apiUrl() { return "http://127.0.0.1:" + apiPort(); }

    public static String frontendUrl(String normalPreference) {
        TestConfig test = loadTest();
        return test == null ? OperationalSettings.load().frontendUrl(normalPreference) : required(test.manifest(), "frontendUrl");
    }

    private static void noLinks(Path root, Path candidate) throws IOException {
        root = root.toAbsolutePath().normalize(); candidate = candidate.toAbsolutePath().normalize();
        if (!candidate.startsWith(root) || !root.toRealPath().equals(root) || Files.isSymbolicLink(root)) {
            throw new IOException("Path outside physical test root");
        }
        Path cursor = root;
        for (Path part : root.relativize(candidate)) {
            cursor = cursor.resolve(part);
            if (Files.exists(cursor, LinkOption.NOFOLLOW_LINKS) &&
                (Files.isSymbolicLink(cursor) || !cursor.toRealPath().equals(cursor.toAbsolutePath().normalize()))) {
                throw new IOException("Test path crosses a link/junction");
            }
        }
    }

    public static void assertPath(String value, boolean temporaryOnly) {
        TestConfig test = loadTest();
        if (test == null) return;
        Path path = absolute(value);
        Path root = path.startsWith(test.temp()) ? test.temp() : !temporaryOnly && path.startsWith(test.projects()) ? test.projects() : null;
        if (root == null) throw new IllegalArgumentException("Access outside disposable test roots refused");
        try { noLinks(root, path); }
        catch (IOException failure) { throw new IllegalArgumentException("Unsafe test path", failure); }
    }

    public static void assertTree(String value, boolean temporaryOnly) {
        if (!testMode()) return;
        assertPath(value, temporaryOnly);
        Path root = Path.of(value);
        if (!Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            paths.forEach(path -> assertPath(path.toString(), temporaryOnly));
        } catch (IOException failure) { throw new IllegalArgumentException("Unsafe test tree", failure); }
    }

    /** Checks an already-open connection; never opens another connection recursively. */
    public static void verifyDatabase(Connection connection) throws SQLException {
        TestConfig test = loadTest();
        if (test == null) return;
        try (var statement = connection.createStatement()) {
            statement.setQueryTimeout(5);
            try (ResultSet result = statement.executeQuery("SELECT DATABASE() AS db, @@server_uuid AS uuid, run_id, config_hash, schema_hash FROM lusiad_test_context WHERE singleton=1")) {
                if (!result.next() || !required(test.database(), "name").equals(result.getString("db")) ||
                    !required(test.database(), "serverUuid").equals(result.getString("uuid")) ||
                    !test.runId().equals(result.getString("run_id")) || !test.hash().equals(result.getString("config_hash")) ||
                    !required(test.manifest(), "schemaHash").equals(result.getString("schema_hash")) || result.next()) {
                    throw new SQLException("Test SQL ownership mismatch");
                }
            }
            Set<String> expected = Set.of("projects", "branches", "commits", "changes", "commit_change_sets", "external_sync_projects", "external_sync_files", "external_sync_bundle_files", "lusiad_sync_operations", "lusiad_history_tags", "lusiad_test_context");
            Set<String> found = new HashSet<>();
            try (ResultSet result = statement.executeQuery("SHOW TABLES")) { while (result.next()) found.add(result.getString(1)); }
            if (!found.equals(expected)) throw new SQLException("Incompatible test schema");
            var columns = new java.util.HashMap<String, java.util.List<String>>();
            try (ResultSet result = statement.executeQuery("SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION")) {
                while (result.next()) columns.computeIfAbsent(result.getString(1), ignored -> new java.util.ArrayList<>()).add(result.getString(2));
            }
            for (String table : expected) {
                var names = test.manifest().getAsJsonObject("schemaColumns").getAsJsonArray(table);
                var expectedNames = new java.util.ArrayList<String>();
                if (names == null) throw new SQLException("Incomplete schema contract");
                names.forEach(name -> expectedNames.add(name.getAsString()));
                if (!expectedNames.equals(columns.get(table))) throw new SQLException("Incompatible test columns");
            }
            try (ResultSet result = statement.executeQuery("SELECT path, temp_path FROM projects")) {
                while (result.next()) {
                    String project = result.getString("path"), temp = result.getString("temp_path");
                    Path projectPath = absolute(project);
                    if (!projectPath.startsWith(test.projects()) || projectPath.equals(test.projects())) throw new SQLException("Unowned test project");
                    assertPath(project, false);
                    if (temp != null && !temp.isBlank()) {
                        if (absolute(temp).equals(test.temp())) throw new SQLException("Invalid test project temporary root");
                        assertPath(temp, true);
                    }
                }
            }
        }
    }

    public static JsonObject context() {
        TestConfig test = loadTest();
        JsonObject value = new JsonObject();
        if (test == null) return value;
        value.addProperty("protocol", 1); value.addProperty("profile", "test"); value.addProperty("runId", test.runId());
        value.addProperty("configHash", test.hash()); value.addProperty("schemaHash", required(test.manifest(), "schemaHash"));
        for (String name : new String[]{"labRoot", "projectsRoot", "tempRoot", "apiUrl", "frontendUrl"}) value.addProperty(name, required(test.manifest(), name));
        JsonObject db = new JsonObject();
        for (String name : new String[]{"host", "name", "serverUuid"}) db.addProperty(name, required(test.database(), name));
        db.addProperty("port", test.database().get("port").getAsInt()); value.add("database", db);
        return value;
    }

    /** Called before existing handlers, leaving their parsing/contracts unchanged. */
    public static boolean authorize(HttpExchange exchange) throws IOException {
        try {
            TestConfig test = loadTest();
            String run = exchange.getRequestHeaders().getFirst("X-Lusiad-Test-Run");
            String hash = exchange.getRequestHeaders().getFirst("X-Lusiad-Test-Config");
            if (test == null) {
                if (run != null || hash != null) { send(exchange, 403, "{\"error\":\"test request on normal API\"}"); return false; }
                return true;
            }
            String origin = exchange.getRequestHeaders().getFirst("Origin");
            if (origin != null && !origin.equals(required(test.manifest(), "frontendUrl"))) { send(exchange, 403, "{\"error\":\"test origin mismatch\"}"); return false; }
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) return true;
            if (!test.runId().equals(run) || !test.hash().equals(hash)) { send(exchange, 403, "{\"error\":\"test context headers required\"}"); return false; }
            return true;
        } catch (RuntimeException failure) { send(exchange, 503, "{\"error\":\"invalid test environment\"}"); return false; }
    }

    public static void send(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes); exchange.close();
    }
}
