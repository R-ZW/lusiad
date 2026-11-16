package com.lusiad.backend.service.project;

import com.google.gson.*;
import com.lusiad.backend.config.OperationalSettings;
import com.lusiad.backend.service.diagnostics.JavaAnalysisContext;
import java.nio.channels.FileChannel;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.Objects;

/** Moves only this project's Java-context entry in P15.2's existing private configuration. */
final class ProjectJavaSettings {
    private static final Gson JSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
    private ProjectJavaSettings() {}
    static JsonObject capture(Path before, Path after) throws Exception {
        return capture(before,after,OperationalSettings.load().configFile);
    }
    static JsonObject capture(Path before,Path after,Path configuration) throws Exception {
        JsonObject result = new JsonObject();
        String from = ProjectFiles.key(ProjectFiles.physical(before));
        String to = after == null ? null : ProjectFiles.key(ProjectFiles.physical(after));
        var shared = JavaAnalysisContext.shared(configuration);
        var contexts = shared.has("javaProjects") ? shared.getAsJsonObject("javaProjects") : new JsonObject();
        JsonElement original = contexts.has(from) ? contexts.get(from).deepCopy() : JsonNull.INSTANCE;
        JsonElement previous = to != null && contexts.has(to) ? contexts.get(to).deepCopy() : JsonNull.INSTANCE;
        JsonElement desired = original.deepCopy();
        if (!desired.isJsonNull() && after != null) {
            JsonObject settings = desired.getAsJsonObject();
            for (String field : new String[]{"jdkHome", "sourceRoots", "testRoots", "classpath", "modulePath"}) {
                JsonElement value = settings.get(field);
                if (value == null) continue;
                if (value.isJsonArray()) {
                    JsonArray values = new JsonArray();
                    for (JsonElement item : value.getAsJsonArray()) values.add(rebase(item.getAsString(), from, after));
                    settings.add(field, values);
                } else settings.addProperty(field, rebase(value.getAsString(), from, after));
            }
        }
        if (to != null && !previous.isJsonNull() && !Objects.equals(previous, desired))
            throw new ProjectManagementService.Failure("project_context_conflict");
        result.addProperty("from", from); if (to != null) result.addProperty("to", to);
        result.add("before", original); result.add("previous", previous); result.add("after", desired);
        return result;
    }
    private static String rebase(String value, String from, Path after) {
        Path path;
        try { path = Path.of(value); } catch (Exception invalid) { return value; }
        if (!path.isAbsolute()) return value;
        String key = ProjectFiles.key(path);
        return key.equals(from) ? after.toString() : key.startsWith(from + "/")
            ? after.resolve(path.toAbsolutePath().normalize().toString().replace('\\', '/').substring(from.length() + 1)).toString() : value;
    }
    static void apply(JsonObject delta, boolean forward) throws Exception {
        apply(delta,forward,OperationalSettings.load().configFile);
    }
    static void apply(JsonObject delta,boolean forward,Path file) throws Exception {
        if (delta == null || delta.get("before").isJsonNull()) return;
        Files.createDirectories(file.getParent());
        Path lock = file.resolveSibling(file.getFileName() + ".lock");
        java.nio.channels.FileChannel descriptor;
        try { descriptor = FileChannel.open(lock, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE); }
        catch (FileAlreadyExistsException busy) { throw new ProjectManagementService.Failure("project_busy"); }
        try (descriptor) {
            if (Files.isSymbolicLink(file)) throw new ProjectManagementService.Failure("project_context_conflict");
            JsonObject shared = JavaAnalysisContext.shared(file);
            JsonObject contexts = shared.has("javaProjects") ? shared.getAsJsonObject("javaProjects") : new JsonObject();
            String from = delta.get("from").getAsString(), to = delta.has("to") ? delta.get("to").getAsString() : null;
            JsonElement old = contexts.has(from) ? contexts.get(from) : JsonNull.INSTANCE;
            JsonElement next = to != null && contexts.has(to) ? contexts.get(to) : JsonNull.INSTANCE;
            JsonElement wantOld = forward ? JsonNull.INSTANCE : delta.get("before");
            JsonElement wantNew = forward ? delta.get("after") : delta.get("previous");
            if (Objects.equals(old, wantOld) && (to == null || Objects.equals(next, wantNew))) return;
            if (!Objects.equals(old, forward ? delta.get("before") : JsonNull.INSTANCE)
                    || to != null && !Objects.equals(next, forward ? delta.get("previous") : delta.get("after")))
                throw new ProjectManagementService.Failure("project_context_conflict");
            if (wantOld.isJsonNull()) contexts.remove(from); else contexts.add(from, wantOld.deepCopy());
            if (to != null) { if (wantNew.isJsonNull()) contexts.remove(to); else contexts.add(to, wantNew.deepCopy()); }
            shared.add("javaProjects", contexts);
            Path temporary = Files.createTempFile(file.getParent(), ".lusiad-project-settings-", ".json");
            try {
                Files.writeString(temporary, JSON.toJson(shared) + "\n", StandardCharsets.UTF_8);
                if (Files.exists(file)) {
                    var acl = Files.getFileAttributeView(file, java.nio.file.attribute.AclFileAttributeView.class);
                    if (acl != null) Files.getFileAttributeView(temporary, java.nio.file.attribute.AclFileAttributeView.class).setAcl(acl.getAcl());
                    var posix = Files.getFileAttributeView(file, java.nio.file.attribute.PosixFileAttributeView.class);
                    if (posix != null) Files.setPosixFilePermissions(temporary, posix.readAttributes().permissions());
                } else if (Files.getFileAttributeView(temporary, java.nio.file.attribute.PosixFileAttributeView.class) != null)
                    Files.setPosixFilePermissions(temporary, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
                Files.move(temporary, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } finally { Files.deleteIfExists(temporary); }
        } finally { Files.deleteIfExists(lock); }
    }
}
