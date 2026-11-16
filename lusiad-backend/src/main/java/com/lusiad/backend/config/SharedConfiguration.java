package com.lusiad.backend.config;

import com.google.gson.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;

/** One shared file and the same .lock used by Java/project and frontend settings. */
public final class SharedConfiguration {
    private static final Gson JSON = new GsonBuilder().setPrettyPrinting().create();
    public static final Set<String> GROUPS = Set.of("file","types","methods","fields","variables","conditionals","loops","switch","exceptions","calls","returns","jumps","comments","blocks");
    private SharedConfiguration() {}
    public static Path file() { return OperationalSettings.load().configFile; }
    public static JsonObject read(Path file) throws IOException {
        if (!Files.exists(file)) { var value = new JsonObject(); value.addProperty("version",1); return value; }
        if (Files.size(file) > 4 * 1024 * 1024) throw new IOException("Configuration exceeds 4 MiB");
        try {
            var value = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8).replaceFirst("^\\uFEFF", "")).getAsJsonObject();
            if (value.get("version").getAsInt() != 1) throw new IllegalArgumentException();
            return value;
        } catch (RuntimeException failure) { throw new IOException("Invalid configuration JSON", failure); }
    }
    public static String revision(Path file) throws Exception {
        if(Files.exists(file)&&Files.size(file)>4*1024*1024)throw new IOException("Configuration exceeds 4 MiB");
        return Files.exists(file) ? HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(file))) : "missing";
    }
    public static JsonObject ui() throws Exception {
        var root = read(file());
        var value = root.has("ui") ? root.getAsJsonObject("ui").deepCopy() : new JsonObject();
        validateUi(value); return value;
    }
    public static void validateUi(JsonObject value) {
        for (var entry : value.entrySet()) {
            String key = entry.getKey(); var v = entry.getValue();
            if (key.equals("palette")) {
                var p = v.getAsJsonObject();
                if (!p.has("version") || !p.get("version").isJsonPrimitive() || !p.get("version").getAsJsonPrimitive().isNumber() || p.get("version").getAsBigDecimal().compareTo(java.math.BigDecimal.ONE)!=0 || !p.has("preset") || !p.get("preset").isJsonPrimitive() || !p.get("preset").getAsJsonPrimitive().isString() || !Set.of("classic","soft","monochrome","custom").contains(p.get("preset").getAsString()) || !p.has("custom") || !p.get("custom").isJsonObject()) throw new IllegalArgumentException("Invalid palette");
                for (var color : p.getAsJsonObject("custom").entrySet())
                    if (!GROUPS.contains(color.getKey()) || !color.getValue().isJsonPrimitive() || !color.getValue().getAsJsonPrimitive().isString() || !color.getValue().getAsString().matches("#[a-fA-F0-9]{6}")) throw new IllegalArgumentException("Invalid color");
            } else {
                if (!v.isJsonPrimitive() || !v.getAsJsonPrimitive().isString()) throw new IllegalArgumentException("Invalid preference");
                var allowed = switch (key) {
                    case "language" -> Set.of("pt-BR","en");
                    case "changeTextLanguage" -> Set.of("interface","pt-BR","en");
                    case "theme" -> Set.of("light","dark","system");
                    default -> throw new IllegalArgumentException("Unknown preference");
                };
                if (!allowed.contains(v.getAsString())) throw new IllegalArgumentException("Invalid preference");
            }
        }
    }
    public static void saveUi(JsonObject patch) throws Exception {
        validateUi(patch);
        update(file(), null, root -> {
            var ui = root.has("ui") ? root.getAsJsonObject("ui") : new JsonObject();
            for (var item : patch.entrySet()) ui.add(item.getKey(), item.getValue().deepCopy());
            root.add("ui", ui);
        });
    }
    public static void update(Path file, String expected, Consumer<JsonObject> change) throws Exception {
        if (RuntimeEnvironment.testMode()) throw new IOException("Configuration is managed by the test profile");
        Files.createDirectories(file.getParent());
        Path lock = Path.of(file+".lock"), pending = Path.of(file+"."+UUID.randomUUID()+".tmp");
        // Never delete a lock owned by another writer.
        var descriptor = Files.newByteChannel(lock, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
        try (descriptor) {
            try {
                if (Files.isSymbolicLink(file)) throw new IOException("Linked configuration is read-only");
                if (expected != null && !expected.equals(revision(file))) throw new IOException("Configuration changed; reload before saving");
                var value = read(file); change.accept(value);
                Files.writeString(pending, JSON.toJson(value)+"\n", StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
                if (Files.exists(file)) {
                    if (Files.getFileAttributeView(file, java.nio.file.attribute.PosixFileAttributeView.class)!=null) Files.setPosixFilePermissions(pending,Files.getPosixFilePermissions(file));
                    var acl=Files.getFileAttributeView(file,java.nio.file.attribute.AclFileAttributeView.class);
                    if(acl!=null)Files.getFileAttributeView(pending,java.nio.file.attribute.AclFileAttributeView.class).setAcl(acl.getAcl());
                } else if (Files.getFileAttributeView(pending,java.nio.file.attribute.PosixFileAttributeView.class)!=null) Files.setPosixFilePermissions(pending,java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
                if (expected != null && !expected.equals(revision(file))) throw new IOException("Configuration changed; reload before saving");
                Files.move(pending,file,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
            } finally { Files.deleteIfExists(pending); }
        } finally { Files.deleteIfExists(lock); }
    }
}
