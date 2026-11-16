package com.lusiad.backend.config;

import com.google.gson.JsonObject;
import junit.framework.TestCase;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;

public class RuntimeEnvironmentTest extends TestCase {
    private Path parent, root, config;
    private JsonObject manifest;
    private String oldProfile, oldConfig;

    @Override protected void setUp() throws Exception {
        oldProfile = System.getProperty("lusiad.env"); oldConfig = System.getProperty("lusiad.test.config");
        String run = UUID.randomUUID().toString().replace("-", "");
        parent = Files.createTempDirectory("lusiad-config-"); root = parent.resolve(".lab").resolve(run);
        Files.createDirectories(root.resolve("projects")); Files.createDirectories(root.resolve("temp"));
        config = root.resolve("environment.json");
        manifest = new JsonObject();
        JsonObject columns = new JsonObject();
        for (int i=0;i<10;i++) { var names = new com.google.gson.JsonArray(); names.add("id"); columns.add("table_" + (char)(97+i), names); }
        manifest.add("schemaColumns", columns); manifest.addProperty("version", 1); manifest.addProperty("runId", run);
        manifest.addProperty("labRoot", root.toString()); manifest.addProperty("projectsRoot", root.resolve("projects").toString()); manifest.addProperty("tempRoot", root.resolve("temp").toString());
        manifest.addProperty("apiUrl", "http://127.0.0.1:18765"); manifest.addProperty("frontendUrl", "http://127.0.0.1:13000");
        manifest.addProperty("schemaHash", "a".repeat(64)); manifest.addProperty("requestTimeoutMs", 30000);
        JsonObject db = new JsonObject(); db.addProperty("host", "127.0.0.1"); db.addProperty("port", 13307);
        db.addProperty("name", "lusiad_e2e_" + run); db.addProperty("user", "lusiad_e2e"); db.addProperty("password", UUID.randomUUID().toString());
        db.addProperty("serverUuid", UUID.randomUUID().toString()); db.addProperty("dataDirectory", root.resolve("mysql/data").toString()); manifest.add("database", db);
        save(); System.setProperty("lusiad.env", "test"); System.setProperty("lusiad.test.config", config.toString());
    }

    private void save() throws Exception {
        Files.writeString(config, manifest.toString());
        String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(config)));
        JsonObject owner = new JsonObject(); owner.addProperty("runId", manifest.get("runId").getAsString()); owner.addProperty("configHash", hash);
        Files.writeString(root.resolve(".lusiad-test-owner.json"), owner.toString());
    }

    @Override protected void tearDown() throws Exception {
        restore("lusiad.env", oldProfile); restore("lusiad.test.config", oldConfig);
        try (var paths = Files.walk(parent)) { for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) Files.delete(path); }
    }
    private static void restore(String key, String value) { if (value == null) System.clearProperty(key); else System.setProperty(key, value); }

    public void testManifestOwnsPortAndSqlConfigWithoutDotenvFallback() {
        assertEquals(18765, RuntimeEnvironment.apiPort());
        var sql = com.lusiad.backend.repository.sql.SqlConnectionConfig.load();
        assertEquals(manifest.getAsJsonObject("database").get("name").getAsString(), sql.database);
        assertEquals("13307", sql.port);
        assertFalse(RuntimeEnvironment.context().toString().contains("password"));
    }

    public void testChangedManifestAndNormalFallbackAreRefused() throws Exception {
        Files.writeString(config, manifest.toString() + " ");
        try { RuntimeEnvironment.loadTest(); fail("Changed manifest accepted"); } catch (IllegalArgumentException expected) {}
        System.setProperty("lusiad.env", "normal");
        try { RuntimeEnvironment.loadTest(); fail("Normal fallback accepted test config"); } catch (IllegalArgumentException expected) {}
    }

    public void testOutsidePathsAndProductionPortAreRefused() throws Exception {
        try { RuntimeEnvironment.assertPath(parent.resolve("work.java").toString(), false); fail("Unowned path accepted"); } catch (IllegalArgumentException expected) {}
        manifest.getAsJsonObject("database").addProperty("port", 3306); save();
        try { RuntimeEnvironment.loadTest(); fail("Production port accepted"); } catch (IllegalArgumentException expected) {}
    }
}
