package com.lusiad.backend.config;

import com.lusiad.backend.repository.sql.SqlConnectionConfig;
import junit.framework.TestCase;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Properties;

public class OperationalSettingsTest extends TestCase {
    private Path root, file, cwd;
    @Override protected void setUp() throws Exception {
        root = Files.createTempDirectory("lusiad-operational-");
        cwd = Files.createDirectories(root.resolve("work")); file = root.resolve("config.json");
    }
    @Override protected void tearDown() throws Exception {
        try (var paths = Files.walk(root)) { for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) Files.delete(path); }
    }
    private OperationalSettings read(Map<String, String> env, Properties props) {
        var values = new java.util.HashMap<>(env); values.put("LUSIAD_CONFIG_FILE", file.toString());
        return OperationalSettings.read(values, props, cwd, root);
    }

    public void testSharedLocalEnvironmentAndJvmPrecedenceWithEmptyPassword() throws Exception {
        Files.writeString(file, "{\"version\":1,\"apiUrl\":\"http://127.0.0.1:19000\",\"database\":{\"user\":\"shared\",\"password\":\"secret\",\"port\":3307}}");
        assertEquals("shared", SqlConnectionConfig.from(read(Map.of(), new Properties())).user);
        Files.writeString(cwd.resolve(".env"), "LUSIAD_DB_USER=local\n");
        assertEquals("local", SqlConnectionConfig.from(read(Map.of(), new Properties())).user);
        var props = new Properties(); props.setProperty("lusiad.db.user", "jvm");
        var config = SqlConnectionConfig.from(read(Map.of("LUSIAD_DB_USER", "process", "LUSIAD_DB_PASSWORD", ""), props));
        assertEquals("jvm", config.user); assertEquals("", config.password); assertEquals("3307", config.port);
        assertEquals("http://127.0.0.1:19001", read(Map.of("LUSIAD_API_PORT", "19001"), props).apiUrl());
        assertTrue(SqlConnectionConfig.from(read(Map.of("LUSIAD_DB_TLS", "true", "LUSIAD_DB_HOST", "localhost"), props)).tls);
        assertFalse(config.tls);
    }

    public void testNoAncestorDotenvOrPersonalCredentials() throws Exception {
        Files.writeString(root.resolve(".env"), "LUSIAD_DB_USER=ancestor\n");
        var settings = read(Map.of(), new Properties());
        assertEquals("http://127.0.0.1:8765", settings.apiUrl());
        try { SqlConnectionConfig.from(settings); fail("Missing account accepted"); } catch (IllegalArgumentException expected) {}
    }

    public void testInvalidFilePortsAndCredentialsDoNotLeak() throws Exception {
        Files.writeString(file, "{\"password\":\"never-print-this\"");
        try { read(Map.of(), new Properties()); fail(); } catch (IllegalArgumentException expected) { assertFalse(expected.getMessage().contains("never-print-this")); }
        Files.delete(file);
        for (String port : new String[]{"0", "65536", "3.5", ""}) {
            try { SqlConnectionConfig.from(read(Map.of("LUSIAD_DB_USER", "fixture", "LUSIAD_DB_PORT", port), new Properties())); fail(port); } catch (IllegalArgumentException expected) {}
        }
        try { read(Map.of("LUSIAD_API_URL", "http://localhost:19000", "LUSIAD_API_PORT", "19001"), new Properties()).apiUrl(); fail(); } catch (IllegalArgumentException expected) {}
        try { read(Map.of("LUSIAD_API_URL", "http://example.com:8765"), new Properties()).apiUrl(); fail(); } catch (IllegalArgumentException expected) {}
    }
}
