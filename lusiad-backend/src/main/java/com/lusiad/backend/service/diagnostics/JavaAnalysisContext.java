package com.lusiad.backend.service.diagnostics;

import com.google.gson.*;
import com.lusiad.backend.config.OperationalSettings;
import com.lusiad.backend.service.fs.ContainedPaths;
import com.lusiad.backend.service.psi.EditCoordinator;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.jar.JarFile;

/** Immutable, project-owned compiler input. Never reads IDE roots or the plugin classpath. */
public final class JavaAnalysisContext {
    private static final Set<String> IGNORED = Set.of(".git", ".idea", ".next", ".vscode", "node_modules", "build", "dist", "out", "target");
    public record Settings(String jdkHome, int release, List<String> sourceRoots, List<String> testRoots,
                           List<String> classpath, List<String> modulePath) {}
    public record Source(String file, String content, String revision, boolean test) {}
    public record Snapshot(String revision, Settings settings, SortedMap<String, Source> sources,
                           List<Path> classpath, List<Path> modulePath) {}
    public static final class Failure extends RuntimeException {
        public final String code;
        public Failure(String code, String message) { super(message); this.code = code; }
    }
    private JavaAnalysisContext() {}

    public static String key(Path root) throws IOException {
        String value = root.toRealPath().toString().replace('\\', '/');
        return System.getProperty("os.name").startsWith("Windows") ? value.toLowerCase(Locale.ROOT) : value;
    }

    public static JsonObject shared(Path file) throws IOException {
        if (!Files.exists(file)) { var empty = new JsonObject(); empty.addProperty("version", 1); return empty; }
        var json = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8).replaceFirst("^\\uFEFF", "")).getAsJsonObject();
        if (json.get("version").getAsInt() != 1) throw new Failure("java_context_unavailable", "Invalid shared configuration version");
        return json;
    }

    public static Settings settings(Path root, Path configFile) throws IOException {
        JsonObject shared = shared(configFile);
        JsonObject object = shared.has("javaProjects") ? shared.getAsJsonObject("javaProjects").getAsJsonObject(key(root)) : null;
        if (object == null) return new Settings(System.getProperty("java.home"), Runtime.version().feature(), List.of("."),
                Files.isDirectory(root.resolve("src/test/java")) ? List.of("src/test/java") : List.of(), List.of(), List.of());
        try {
            return parseSettings(object);
        } catch (RuntimeException invalid) { throw new Failure("java_context_unavailable", "Invalid Java project settings: " + invalid.getMessage()); }
    }

    public static Settings parseSettings(JsonObject object) {
        var release = object.get("release");
        if (release == null || !release.isJsonPrimitive() || !release.getAsJsonPrimitive().isNumber()
                || !release.getAsString().matches("[1-9][0-9]*")) throw new IllegalArgumentException("release must be an integer");
        var home = object.get("jdkHome");
        if (home == null || !home.isJsonPrimitive() || !home.getAsJsonPrimitive().isString()) throw new IllegalArgumentException("jdkHome must be a string");
        return new Settings(home.getAsString(), release.getAsInt(), strings(object, "sourceRoots"), strings(object, "testRoots"), strings(object, "classpath"), strings(object, "modulePath"));
    }

    private static List<String> strings(JsonObject object, String name) {
        if (!object.has(name) || !object.get(name).isJsonArray()) throw new IllegalArgumentException(name + " must be an array");
        List<String> result = new ArrayList<>();
        for (var value : object.getAsJsonArray(name)) {
            if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString() || value.getAsString().isBlank()) throw new IllegalArgumentException("Invalid " + name);
            result.add(value.getAsString());
        }
        if (new HashSet<>(result).size() != result.size()) throw new IllegalArgumentException("Repeated " + name);
        return List.copyOf(result);
    }

    public static Snapshot capture(String root, String temporary, Path configFile, Runnable checkpoint) {
        try {
            checkpoint.run();
            ContainedPaths.separate(root, temporary);
            Path base = Path.of(root);
            Settings settings = settings(base, configFile);
            validateJdk(settings);
            var digest = MessageDigest.getInstance("SHA-256");
            update(digest, key(base)); update(digest, new Gson().toJson(settings));
            update(digest, Runtime.version().toString());
            for (String part : List.of("release", "lib/modules", "lib/ct.sym")) {
                Path artifact = Path.of(settings.jdkHome()).resolve(part);
                if (Files.exists(artifact)) { var attributes = Files.readAttributes(artifact, java.nio.file.attribute.BasicFileAttributes.class);
                    update(digest, artifact.toRealPath() + ":" + attributes.size() + ":" + attributes.lastModifiedTime() + ":" + attributes.fileKey()); }
            }
            List<Path> cp = dependencies(settings.classpath(), digest, checkpoint), mp = dependencies(settings.modulePath(), digest, checkpoint);
            if (settings.sourceRoots().isEmpty()) throw new Failure("java_context_incomplete", "At least one production source root is required");
            Map<Path, Boolean> roots = new LinkedHashMap<>();
            for (boolean test : List.of(false, true)) for (String item : test ? settings.testRoots() : settings.sourceRoots()) {
                Path path = Path.of(ContainedPaths.resolve(root, item.equals(".") ? "" : item, true));
                if (!Files.isDirectory(path) || roots.put(path, test) != null) throw new Failure("java_context_incomplete", "Missing or repeated source root: " + item);
                String relative = ContainedPaths.relative(root, path.toString(), true);
                for (String part : relative.split("/")) if (ignored(part)) throw new Failure("java_context_incomplete", "Ignored directory cannot be a source root: " + item);
            }
            SortedMap<String, Source> sources = new TreeMap<>();
            long[] capturedCharacters = {0};
            for (Path sourceRoot : roots.keySet()) scan(base, sourceRoot, roots, sources, capturedCharacters, checkpoint);
            for (Source source : sources.values()) { update(digest, source.file()); update(digest, source.revision()); update(digest, Boolean.toString(source.test())); }
            long modules = sources.keySet().stream().filter(p -> p.equals("module-info.java") || p.endsWith("/module-info.java")).count();
            if (modules > 1 || modules == 1 && sources.values().stream().anyMatch(Source::test))
                throw new Failure("java_context_incomplete", "Multiple source modules / modular test roots require build-tool integration, outside this analyzer");
            return new Snapshot(HexFormat.of().formatHex(digest.digest()), settings, Collections.unmodifiableSortedMap(sources), cp, mp);
        } catch (Failure failure) { throw failure; }
        catch (IOException | java.security.NoSuchAlgorithmException | IllegalArgumentException error) {
            throw new Failure("java_context_incomplete", "Cannot capture Java context: " + error.getMessage());
        }
    }

    private static boolean ignored(String name) { return name.startsWith(".") || IGNORED.contains(name); }
    private static void scan(Path base, Path dir, Map<Path, Boolean> roots, SortedMap<String, Source> sources, long[] capturedCharacters, Runnable checkpoint) throws IOException {
        checkpoint.run();
        ContainedPaths.resolve(base.toString(), dir.toString(), true);
        try (var entries = Files.list(dir)) {
            for (Path path : entries.sorted().toList()) {
                checkpoint.run();
                if (ignored(path.getFileName().toString())) continue;
                ContainedPaths.resolve(base.toString(), path.toString(), false);
                if (Files.isDirectory(path, LinkOption.NOFOLLOW_LINKS)) { scan(base, path, roots, sources, capturedCharacters, checkpoint); continue; }
                if (!path.toString().toLowerCase(Locale.ROOT).endsWith(".java")) continue;
                String relative = base.relativize(path).toString().replace('\\', '/');
                if (sources.containsKey(relative)) continue;
                Path owner = roots.keySet().stream().filter(path::startsWith).max(Comparator.comparingInt(Path::getNameCount)).orElseThrow();
                if (Files.size(path) > 32 * 1024 * 1024) throw new Failure("java_context_incomplete", "Java source is too large for in-memory analysis: " + relative);
                byte[] bytes = Files.readAllBytes(path);
                String content = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                        .decode(ByteBuffer.wrap(bytes)).toString().replace("\r\n", "\n").replace('\r', '\n');
                sources.put(relative, new Source(relative, content, EditCoordinator.hash(content), roots.get(owner)));
                capturedCharacters[0] += content.length();
                if (sources.size() > 10000 || capturedCharacters[0] > 32 * 1024 * 1024)
                    throw new Failure("java_context_incomplete", "Source capture exceeds the in-memory analysis limit (10,000 files / 32M UTF-16 characters)");
            }
        }
    }

    public static void validateJdk(Settings settings) throws IOException {
        Path home = Path.of(ContainedPaths.clean(settings.jdkHome()));
        if (!home.isAbsolute() || !Files.isDirectory(home) || !Files.isRegularFile(home.resolve("lib/modules")))
            throw new Failure("java_context_incomplete", "Declared JDK is missing or invalid");
        if (!home.toRealPath().equals(Path.of(System.getProperty("java.home")).toRealPath()))
            throw new Failure("java_context_incomplete", "This engine uses the Run JDK only; select its JDK home or restart the Run with the required JDK");
        var compiler = RuntimeJavaCompiler.get();
        if (compiler == null) throw new Failure("java_compiler_unavailable", "The Run runtime does not provide jdk.compiler");
        var version = "RELEASE_" + settings.release();
        if (!compiler.getSourceVersions().stream().anyMatch(v -> v.name().equals(version)))
            throw new Failure("java_context_incomplete", "Java release is unsupported by the Run compiler: " + settings.release());
    }

    private static List<Path> dependencies(List<String> declared, MessageDigest digest, Runnable checkpoint) throws IOException {
        List<Path> result = new ArrayList<>();
        for (String value : declared) {
            checkpoint.run();
            Path path = Path.of(ContainedPaths.clean(value));
            if (!path.isAbsolute() || !Files.exists(path)) throw new Failure("java_context_incomplete", "Declared dependency is missing: " + value);
            result.add(path.toRealPath()); // The explicit dependency root is trusted; descendants are not.
        }
        Set<Path> authorized = Set.copyOf(result);
        for (Path path : result) {
            checkpoint.run();
            if (Files.isDirectory(path)) {
                ContainedPaths.tree(path.toString());
                try (var stream = Files.walk(path)) {
                    for (Path item : stream.filter(Files::isRegularFile).sorted().toList()) {
                        checkpoint.run(); update(digest, item.toString()); hashFile(digest, item, checkpoint);
                    }
                }
            } else {
                if (!path.toString().toLowerCase(Locale.ROOT).endsWith(".jar")) throw new Failure("java_context_incomplete", "Dependencies must be JARs or class directories");
                try (var jar = new JarFile(path.toFile())) {
                    var manifest = jar.getManifest();
                    String entries = manifest == null ? null : manifest.getMainAttributes().getValue("Class-Path");
                    if (entries != null) for (String entry : entries.trim().split("\\s+")) {
                        if (entry.isBlank()) continue;
                        java.net.URI reference = path.toUri().resolve(entry);
                        if (!reference.getScheme().equals("file") || !authorized.contains(Path.of(reference).normalize()))
                            throw new Failure("java_context_incomplete", "JAR manifest references an undeclared dependency; declare it explicitly in the same path: " + path.getFileName() + " -> " + entry);
                    }
                }
                update(digest, path.toString()); hashFile(digest, path, checkpoint);
            }
        }
        return List.copyOf(result);
    }
    private static void hashFile(MessageDigest digest, Path path, Runnable checkpoint) throws IOException {
        MessageDigest fileHash;
        try { fileHash = MessageDigest.getInstance("SHA-256"); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
        try (var input = Files.newInputStream(path)) { byte[] bytes = new byte[64 * 1024]; int count;
            while ((count = input.read(bytes)) != -1) { checkpoint.run(); fileHash.update(bytes, 0, count); }
        }
        digest.update(fileHash.digest()); // Fixed-length content identity, independent of the next manifest entry's boundary.
    }
    private static void update(MessageDigest digest, String value) { digest.update(value.getBytes(StandardCharsets.UTF_8)); digest.update((byte) 0); }

    public static Snapshot capture(String root, String temporary, Runnable checkpoint) {
        return capture(root, temporary, OperationalSettings.load().configFile, checkpoint);
    }
}
