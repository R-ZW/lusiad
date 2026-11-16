package com.lusiad.backend.config;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.*;
import java.security.SecureRandom;
import java.util.Base64;

/** A server-to-server local credential in the existing private operational file. Never an account. */
public final class LocalApiToken {
    private LocalApiToken() {}

    public static String validate(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{32,128}")) {
            throw new IllegalArgumentException("Invalid LUSIAD_API_TOKEN (32-128 URL-safe characters required)");
        }
        return token;
    }

    public static String ensure(OperationalSettings settings) throws IOException {
        String configured = settings.value("LUSIAD_API_TOKEN", null);
        if (configured != null) return validate(configured);
        Path file = settings.configFile;
        Files.createDirectories(file.getParent());
        Path lock = file.resolveSibling(file.getFileName() + ".lock");
        Path pending = null;
        // Same exclusive lock as the frontend's settings writer; no concurrent overwrite of secrets/options.
        Files.createFile(lock);
        try {
            if (Files.isSymbolicLink(file)) throw new IOException("Shared configuration must not be a symbolic link");
            JsonObject values = Files.exists(file)
                    ? JsonParser.parseString(Files.readString(file)).getAsJsonObject() : new JsonObject();
            if (values.has("version") && values.get("version").getAsInt() != 1) throw new IOException("Invalid shared configuration version");
            if (values.has("apiToken")) {
                if (!values.get("apiToken").isJsonPrimitive() || !values.get("apiToken").getAsJsonPrimitive().isString()) {
                    throw new IOException("Invalid shared API token");
                }
                return validate(values.get("apiToken").getAsString());
            }
            byte[] bytes = new byte[32];
            new SecureRandom().nextBytes(bytes);
            String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            values.addProperty("version", 1);
            values.addProperty("apiToken", token);
            pending = Files.createTempFile(file.getParent(), ".lusiad-config-", ".tmp");
            Files.writeString(pending, new GsonBuilder().serializeNulls().setPrettyPrinting().create().toJson(values) + "\n");
            try { Files.move(pending, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
            catch (AtomicMoveNotSupportedException unsupported) { Files.move(pending, file, StandardCopyOption.REPLACE_EXISTING); }
            return token;
        } catch (RuntimeException invalid) {
            throw new IOException("Cannot initialize local API credential; check shared configuration", invalid);
        } finally {
            if (pending != null) Files.deleteIfExists(pending);
            Files.deleteIfExists(lock);
        }
    }
}
