package com.lusiad.backend.config;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;

/** Shared JSON < exact local dotenv < process environment < JVM properties. */
public final class OperationalSettings {
    private final Map<String, String> values;
    private final java.util.Set<String> overrides;
    public final Path configFile;

    private OperationalSettings(Map<String, String> values, Path configFile, java.util.Set<String> overrides) {
        this.values = Map.copyOf(values);
        this.configFile = configFile;
        this.overrides=java.util.Set.copyOf(overrides);
    }

    public static OperationalSettings load() {
        return read(System.getenv(), System.getProperties(), Path.of(System.getProperty("user.dir")),
                Path.of(System.getProperty("user.home")));
    }

    public static OperationalSettings read(Map<String, String> env, Properties props, Path cwd, Path home) {
        Map<String, String> local = new HashMap<>();
        String envFile = props.getProperty("lusiad.env.file", env.get("LUSIAD_ENV_FILE"));
        if (envFile != null) dotenv(absolute(envFile, "LUSIAD_ENV_FILE"), local, true);
        else {
            dotenv(cwd.resolve(".env"), local, false);
            dotenv(cwd.resolve(".env.local"), local, false);
        }
        local.putAll(env);
        for (String key : props.stringPropertyNames()) {
            if (key.startsWith("lusiad.")) local.put("LUSIAD_" + key.substring(7).replace('.', '_').toUpperCase(java.util.Locale.ROOT), props.getProperty(key));
        }
        Path file = absolute(local.getOrDefault("LUSIAD_CONFIG_FILE", home.resolve(".lusiad/config.json").toString()), "LUSIAD_CONFIG_FILE");
        Map<String, String> values = new HashMap<>();
        if (Files.exists(file)) {
            try {
                JsonObject json = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject();
                if (json.get("version").getAsInt() != 1) throw new IllegalArgumentException();
                copy(json, "apiUrl", "LUSIAD_API_URL", values);
                copy(json, "frontendUrl", "LUSIAD_FRONTEND_URL", values);
                copy(json, "apiToken", "LUSIAD_API_TOKEN", values);
                copy(json, "requestTimeoutMs", "LUSIAD_API_TIMEOUT_MS", values);
                if (json.has("database")) {
                    JsonObject db = json.getAsJsonObject("database");
                    for (String key : new String[]{"host", "port", "name", "user", "password"}) copy(db, key, "LUSIAD_DB_" + key.toUpperCase(java.util.Locale.ROOT), values);
                    copy(db, "connectTimeoutMs", "LUSIAD_DB_CONNECT_TIMEOUT_MS", values);
                    copy(db, "socketTimeoutMs", "LUSIAD_DB_SOCKET_TIMEOUT_MS", values);
                    copy(db, "tls", "LUSIAD_DB_TLS", values);
                }
            } catch (Exception failure) { throw new IllegalArgumentException("Invalid Lusiad configuration file: " + file); }
        }
        // A port-only override must supersede the shared URL, just like the web server.
        if (local.containsKey("LUSIAD_API_PORT") && !local.containsKey("LUSIAD_API_URL")) values.remove("LUSIAD_API_URL");
        values.putAll(local);
        return new OperationalSettings(values, file, local.keySet());
    }

    private static void copy(JsonObject source, String key, String target, Map<String, String> values) {
        if (source.has(key)) {
            var value = source.get(key);
            if (!(key.equals("port") || key.endsWith("TimeoutMs") || key.equals("tls")) && (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString())) throw new IllegalArgumentException("Invalid " + target);
            values.put(target, value.getAsString());
        }
    }

    private static void dotenv(Path file, Map<String, String> values, boolean required) {
        if (!Files.exists(file) && !required) return;
        try {
            for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                String text = line.trim();
                if (text.startsWith("export ")) text = text.substring(7).trim();
                if (text.isEmpty() || text.startsWith("#")) continue;
                int index = text.indexOf('=');
                if (index <= 0) continue;
                String key = text.substring(0, index).trim(), value = text.substring(index + 1).trim();
                if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.substring(1, value.length() - 1);
                else value = value.replaceFirst("\\s+#.*$", "").stripTrailing();
                if (key.startsWith("LUSIAD_")) values.put(key, value);
            }
        } catch (Exception failure) { throw new IllegalArgumentException("Cannot read Lusiad environment file: " + file); }
    }

    public String value(String key, String fallback) {
        String value = values.getOrDefault(key, fallback);
        if (value != null && (value.indexOf('\0') >= 0 || value.indexOf('\n') >= 0 || value.indexOf('\r') >= 0)) throw new IllegalArgumentException("Invalid " + key);
        return value;
    }

    public int integer(String key, int fallback, int min, int max) {
        String raw = value(key, Integer.toString(fallback));
        try {
            if (!raw.matches("\\d+")) throw new IllegalArgumentException();
            int number = Integer.parseInt(raw);
            if (number < min || number > max) throw new IllegalArgumentException();
            return number;
        } catch (IllegalArgumentException failure) { throw new IllegalArgumentException("Invalid " + key); }
    }

    public String apiUrl() {
        String url = value("LUSIAD_API_URL", "http://127.0.0.1:" + integer("LUSIAD_API_PORT", 8765, 1, 65535));
        URI uri = origin(url, "LUSIAD_API_URL");
        if (!"http".equals(uri.getScheme()) || !("127.0.0.1".equals(uri.getHost()) || "localhost".equals(uri.getHost()))) throw new IllegalArgumentException("LUSIAD_API_URL must use local HTTP");
        int port = uri.getPort() == -1 ? 80 : uri.getPort();
        if (values.containsKey("LUSIAD_API_PORT") && port != integer("LUSIAD_API_PORT", 8765, 1, 65535)) throw new IllegalArgumentException("LUSIAD_API_URL and LUSIAD_API_PORT disagree");
        return uri.toString().replaceAll("/$", "");
    }

    public boolean managesFrontendUrl() { return values.containsKey("LUSIAD_FRONTEND_URL"); }
    public boolean overridden(String key) { return overrides.contains(key); }

    /** API policy uses the shared origin, not an IDE launch-link preference containing a project path. */
    public String clientOrigin() {
        return origin(value("LUSIAD_FRONTEND_URL", "http://localhost:3000"), "LUSIAD_FRONTEND_URL")
                .toString().replaceAll("/$", "");
    }

    public boolean bool(String key, boolean fallback) {
        String value = value(key, Boolean.toString(fallback));
        if (!(value.equals("true") || value.equals("false"))) throw new IllegalArgumentException("Invalid " + key + ": use true or false");
        return Boolean.parseBoolean(value);
    }

    public String frontendUrl(String preference) {
        if (!managesFrontendUrl()) return preference; // Existing launch links may include a project path.
        return origin(value("LUSIAD_FRONTEND_URL", preference), "LUSIAD_FRONTEND_URL").toString().replaceAll("/$", "");
    }

    public static URI origin(String value, String key) {
        try {
            URI uri = URI.create(value);
            if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null || !(uri.getPath().isEmpty() || uri.getPath().equals("/")) || uri.getPort() == 0 || uri.getPort() > 65535) throw new IllegalArgumentException();
            return uri;
        } catch (Exception failure) { throw new IllegalArgumentException("Invalid " + key); }
    }

    private static Path absolute(String value, String key) {
        Path path = Path.of(value);
        if (!path.isAbsolute()) throw new IllegalArgumentException(key + " must be absolute");
        return path.normalize();
    }
}
