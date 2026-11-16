package com.lusiad.backend.service.diagnostics;

import com.google.gson.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.UUID;
import com.lusiad.backend.service.psi.EditCoordinator;

/** One section of P15.2's existing private JSON; diagnostics themselves are never persisted. */
public final class JavaProjectSettings {
    private static final Gson JSON = new GsonBuilder().setPrettyPrinting().create();
    private JavaProjectSettings() {}
    public static String revision(Path file) throws IOException {
        return Files.exists(file) ? EditCoordinator.hash(Files.readString(file, StandardCharsets.UTF_8)) : "missing";
    }
    public static JsonObject view(Path root, Path file) throws IOException {
        var value = new JsonObject();
        value.addProperty("status", "ok"); value.addProperty("version", 1);
        value.addProperty("configurationRevision", revision(file));
        value.add("settings", JSON.toJsonTree(JavaAnalysisContext.settings(root, file)));
        value.addProperty("runtimeHome", System.getProperty("java.home"));
        value.addProperty("runtimeVersion", Runtime.version().toString());
        var compiler = RuntimeJavaCompiler.get();
        value.addProperty("available", compiler != null);
        var releases = new JsonArray();
        if (compiler != null) compiler.getSourceVersions().stream().map(v -> v.name().replace("RELEASE_", ""))
                .filter(v -> v.matches("[0-9]+") && Integer.parseInt(v) >= 7).forEach(v -> releases.add(Integer.parseInt(v)));
        value.add("supportedReleases", releases);
        return value;
    }
    public static void save(Path root, Path file, String expectedRevision, JsonObject settings) throws IOException {
        var parsed = JavaAnalysisContext.parseSettings(settings);
        if (!Path.of(parsed.jdkHome()).isAbsolute() || parsed.release() < 7 || parsed.sourceRoots().isEmpty())
            throw new IllegalArgumentException("An absolute JDK home, supported release and source roots are required");
        for (String path : parsed.classpath()) if (!Path.of(path).isAbsolute()) throw new IllegalArgumentException("Classpath entries must be absolute");
        for (String path : parsed.modulePath()) if (!Path.of(path).isAbsolute()) throw new IllegalArgumentException("Module-path entries must be absolute");
        for (String path : parsed.sourceRoots()) com.lusiad.backend.service.fs.ContainedPaths.resolve(root.toString(), path.equals(".") ? "" : path, true);
        for (String path : parsed.testRoots()) com.lusiad.backend.service.fs.ContainedPaths.resolve(root.toString(), path.equals(".") ? "" : path, true);
        Files.createDirectories(file.getParent());
        Path lock = Path.of(file + ".lock"), pending = file.resolveSibling(file.getFileName() + "." + UUID.randomUUID() + ".tmp");
        java.nio.channels.SeekableByteChannel descriptor;
        try { descriptor = Files.newByteChannel(lock, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE); }
        catch (FileAlreadyExistsException busy) { throw new JavaAnalysisContext.Failure("java_configuration_conflict", "Configuration is being edited; retry"); }
        try (descriptor) {
            try {
                if (Files.isSymbolicLink(file)) throw new IOException("Linked configuration files are not writable");
                if (!revision(file).equals(expectedRevision)) throw new JavaAnalysisContext.Failure("java_configuration_conflict", "Configuration changed; reload before saving");
                var shared = JavaAnalysisContext.shared(file);
                var projects = shared.has("javaProjects") ? shared.getAsJsonObject("javaProjects") : new JsonObject();
                projects.add(JavaAnalysisContext.key(root), JSON.toJsonTree(parsed)); shared.add("javaProjects", projects);
                Files.writeString(pending, JSON.toJson(shared) + "\n", StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
                if (Files.exists(file)) {
                    var permissions = Files.getFileAttributeView(file, java.nio.file.attribute.PosixFileAttributeView.class);
                    if (permissions != null) Files.setPosixFilePermissions(pending, Files.getPosixFilePermissions(file));
                    var acl = Files.getFileAttributeView(file, java.nio.file.attribute.AclFileAttributeView.class);
                    if (acl != null) Files.getFileAttributeView(pending, java.nio.file.attribute.AclFileAttributeView.class).setAcl(acl.getAcl());
                } else if (Files.getFileAttributeView(pending, java.nio.file.attribute.PosixFileAttributeView.class) != null)
                    Files.setPosixFilePermissions(pending, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
                if (!revision(file).equals(expectedRevision)) throw new JavaAnalysisContext.Failure("java_configuration_conflict", "Configuration changed; reload before saving");
                Files.move(pending, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } finally { Files.deleteIfExists(pending); }
        } finally { Files.deleteIfExists(lock); }
    }
}
