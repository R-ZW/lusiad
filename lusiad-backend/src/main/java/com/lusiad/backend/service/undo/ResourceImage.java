package com.lusiad.backend.service.undo;

import com.google.gson.*;
import com.lusiad.backend.service.fs.ContainedPaths;
import com.lusiad.backend.service.psi.EditCoordinator;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;

/** Exact, bounded images of named resources, including absence and empty directories. No IDE/SQL. */
public record ResourceImage(List<String> roots, SortedMap<String, ResourceImage.Entry> entries) {
    public static final long MAX_BYTES = 64L * 1024 * 1024;
    public static final int MAX_ENTRIES = 20000;
    public static final Gson JSON = new GsonBuilder().serializeNulls().create();
    public record Entry(String kind, String content) {
        public Entry {
            if (!("directory".equals(kind) && content == null || "file".equals(kind) && content != null)) throw new IllegalArgumentException("Invalid resource kind");
            if (content != null) {
                if (content.length() > (MAX_BYTES + 2) / 3 * 4) throw capacity();
                byte[] value = Base64.getDecoder().decode(content);
                if (!Base64.getEncoder().encodeToString(value).equals(content)) throw new IllegalArgumentException("Invalid encoded resource");
            }
        }
        public static Entry directory() { return new Entry("directory", null); }
        public static Entry file(byte[] value) { return new Entry("file", Base64.getEncoder().encodeToString(value)); }
        public byte[] bytes() { return content == null ? new byte[0] : Base64.getDecoder().decode(content); }
    }
    public ResourceImage {
        roots = List.copyOf(roots); entries = Collections.unmodifiableSortedMap(new TreeMap<>(entries));
        if (roots.isEmpty() || new HashSet<>(roots).size() != roots.size()) throw new IllegalArgumentException("Invalid resource roots");
        for (String path : roots) validateName(path);
        for (var item : entries.entrySet()) {
            validateName(item.getKey());
            if (roots.stream().noneMatch(root -> within(item.getKey(), root))) throw new IllegalArgumentException("Resource outside image");
            Entry entry = item.getValue();
            if (entry == null || !(entry.kind.equals("file") && entry.content != null || entry.kind.equals("directory") && entry.content == null))
                throw new IllegalArgumentException("Invalid resource entry");
        }
        if (entries.size() > MAX_ENTRIES || size(entries) > MAX_BYTES) throw capacity();
    }
    private static void validateName(String path) {
        if (path == null || path.isEmpty() || path.startsWith("/") || path.indexOf('\\') >= 0) throw new IllegalArgumentException("Relative resource path required");
        for (String name : path.split("/", -1)) {
            ContainedPaths.name(name);
            if (name.equalsIgnoreCase(".git")) throw new IllegalArgumentException("Git metadata is not editable content");
        }
    }
    public static boolean within(String path, String root) { return path.equals(root) || path.startsWith(root + "/"); }
    public static EditCoordinator.Failure capacity() { return new EditCoordinator.Failure("undo_capacity", "This action exceeds the reversible resource limit (64 MiB / 20000 entries)", null, null); }
    private static long size(Map<String, Entry> entries) { long total = 0; for (Entry entry : entries.values()) if (entry.content != null) {
        String content = entry.content;
        if (content.length() % 4 != 0) throw new IllegalArgumentException("Invalid encoded resource");
        long size = (long) content.length() / 4 * 3;
        if (content.endsWith("==")) size -= 2; else if (content.endsWith("=")) size--;
        total += size;
    } return total; }
    public long size() { return size(entries); }
    public String encode() { return JSON.toJson(this); }
    public String revision() { return EditCoordinator.hash(encode()); }
    public JsonObject json() { return JSON.toJsonTree(this).getAsJsonObject(); }
    public static ResourceImage decode(String value) {
        try {
            JsonObject object = JsonParser.parseString(value).getAsJsonObject();
            List<String> roots = new ArrayList<>(); object.getAsJsonArray("roots").forEach(item -> roots.add(item.getAsString()));
            SortedMap<String, Entry> entries = new TreeMap<>();
            for (var item : object.getAsJsonObject("entries").entrySet()) entries.put(item.getKey(), JSON.fromJson(item.getValue(), Entry.class));
            return new ResourceImage(roots, entries);
        } catch (EditCoordinator.Failure typed) { throw typed; }
        catch (RuntimeException invalid) { throw new IllegalArgumentException("Invalid resource image", invalid); }
    }
    public static ResourceImage file(String path, byte[] bytes) { return new ResourceImage(List.of(path), new TreeMap<>(Map.of(path, Entry.file(bytes)))); }
    public static ResourceImage capture(String root, List<String> paths) throws Exception {
        SortedMap<String, Entry> entries = new TreeMap<>(); long[] bytes = {0};
        for (String path : paths) {
            validateName(path);
            Path target = Path.of(ContainedPaths.resolve(root, path, false));
            if (!Files.exists(target, LinkOption.NOFOLLOW_LINKS)) continue;
            Files.walkFileTree(target, new SimpleFileVisitor<>() {
                private String relative(Path file) { return ContainedPaths.relative(root, ContainedPaths.resolve(root, file.toString(), false), false); }
                @Override public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                    entries.put(relative(dir), Entry.directory()); check(); return FileVisitResult.CONTINUE;
                }
                @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws java.io.IOException {
                    String name = relative(file);
                    if (!attrs.isRegularFile()) throw new java.io.IOException("Only regular resources can be captured");
                    bytes[0] += attrs.size(); if (bytes[0] > MAX_BYTES) throw capacity();
                    entries.put(name, Entry.file(Files.readAllBytes(file))); check(); return FileVisitResult.CONTINUE;
                }
                private void check() { if (entries.size() > MAX_ENTRIES) throw capacity(); }
            });
        }
        return new ResourceImage(paths, entries);
    }
    public void requireCurrent(String root) throws Exception {
        if (!equals(capture(root, roots))) throw new EditCoordinator.Failure("revision_conflict", "Resources changed; synchronize or reload before continuing", null, null);
    }
    /** Git may materialize LF where the original working tree used CRLF; only this proven text equivalence is accepted in previews. */
    public static void applyHistorical(String root, ResourceImage before, ResourceImage after) throws Exception {
        ResourceImage actual = capture(root, before.roots);
        if (!actual.entries.keySet().equals(before.entries.keySet())) throw new IllegalArgumentException("Historical resource paths differ from the recorded state");
        for (String name : before.entries.keySet()) {
            Entry expected = before.entries.get(name), current = actual.entries.get(name);
            if (expected.equals(current)) continue;
            if (!expected.kind.equals("file") || !current.kind.equals("file")) throw new IllegalArgumentException("Historical resource kind mismatch");
            String a = new String(current.bytes(), java.nio.charset.StandardCharsets.UTF_8), b = new String(expected.bytes(), java.nio.charset.StandardCharsets.UTF_8);
            if (a.indexOf('\0') >= 0 || b.indexOf('\0') >= 0 || !Arrays.equals(a.getBytes(java.nio.charset.StandardCharsets.UTF_8), current.bytes())
                || !Arrays.equals(b.getBytes(java.nio.charset.StandardCharsets.UTF_8), expected.bytes()) || !a.replace("\r\n", "\n").equals(b.replace("\r\n", "\n")))
                throw new IllegalArgumentException("Historical resource preimage mismatch");
        }
        apply(root, actual, after);
    }
    /** Parent creation is explicit in images. Never recursively remove an unrecorded descendant. */
    public static void apply(String root, ResourceImage before, ResourceImage after) throws Exception {
        apply(root, before, after, ResourceImage::write);
    }
    /** Recover an interrupted multi-resource publication only when every byte is an old or new image byte. */
    public static void recoverBefore(String root, ResourceImage before, ResourceImage after) throws Exception {
        if (!before.roots.equals(after.roots)) throw new IllegalArgumentException("Different image roots");
        ResourceImage partial = capture(root, before.roots);
        for (var item : partial.entries.entrySet()) {
            if (!Objects.equals(item.getValue(), before.entries.get(item.getKey()))
                    && !Objects.equals(item.getValue(), after.entries.get(item.getKey())))
                throw new IllegalStateException("External write during pending rewind recovery");
        }
        write(root, partial, before);
        before.requireCurrent(root);
    }
    @FunctionalInterface interface Write { void run(String root, ResourceImage before, ResourceImage after) throws Exception; }
    static void apply(String root, ResourceImage before, ResourceImage after, Write writer) throws Exception {
        if (!before.roots.equals(after.roots)) throw new IllegalArgumentException("Different image roots");
        before.requireCurrent(root);
        try { writer.run(root, before, after); after.requireCurrent(root); }
        catch (Exception failure) {
            // Restore only if the intermediate tree contains no unexpected paths/bytes.
            try {
                ResourceImage partial = capture(root, before.roots);
                for (var item : partial.entries.entrySet()) {
                    if (!Objects.equals(item.getValue(), before.entries.get(item.getKey())) && !Objects.equals(item.getValue(), after.entries.get(item.getKey()))) throw new IllegalStateException("External write during recovery");
                }
                write(root, partial, before); before.requireCurrent(root);
            } catch (Exception recovery) { failure.addSuppressed(recovery); }
            throw failure;
        }
    }
    private static void write(String root, ResourceImage before, ResourceImage after) throws Exception {
        List<String> remove = before.entries.keySet().stream().filter(name -> !Objects.equals(before.entries.get(name), after.entries.get(name))
                && (after.entries.get(name) == null || !before.entries.get(name).kind.equals(after.entries.get(name).kind)))
                .sorted(Comparator.<String>comparingInt(String::length).reversed()).toList();
        for (String name : remove) Files.delete(Path.of(ContainedPaths.resolve(root, name, false)));
        for (var item : after.entries.entrySet().stream().sorted(Comparator.comparingInt(item -> item.getKey().length())).toList()) {
            String name = item.getKey(); Entry entry = item.getValue();
            if (Objects.equals(entry, before.entries.get(name))) continue;
            Path file = Path.of(ContainedPaths.resolve(root, name, false));
            if (entry.kind.equals("directory")) Files.createDirectory(file);
            else publish(file, entry.bytes(), Files::write);
        }
    }
    @FunctionalInterface interface FileWrite { void run(Path file, byte[] bytes) throws java.io.IOException; }
    /** A failed/partial stage write never truncates an existing destination. No unsafe fallback. */
    static void publish(Path destination, byte[] bytes, FileWrite writer) throws java.io.IOException {
        Path stage = Files.createTempFile(destination.getParent(), ".lusiad-write-", ".tmp");
        try {
            writer.run(stage, bytes);
            Files.move(stage, destination, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } finally { Files.deleteIfExists(stage); }
    }
    public static JsonObject pair(ResourceImage before, ResourceImage after) {
        JsonObject result = new JsonObject(); result.add("before", before.json()); result.add("after", after.json()); return result;
    }
}
