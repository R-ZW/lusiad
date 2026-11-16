package com.lusiad.backend.service.fs;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.UUID;

/** A snapshot is prepared completely before publication; cleanup cannot delete an arbitrary tree. */
public final class SnapshotFiles {
    private SnapshotFiles() {}
    @FunctionalInterface interface Move { void run(Path source, Path target) throws IOException; }

    private static Path entry(String root, String value) {
        Path base = Path.of(root).toAbsolutePath().normalize();
        if (base.getParent() == null) throw new IllegalArgumentException("temporary root cannot be a filesystem root");
        String relative = ContainedPaths.relative(root, value, false);
        if (!relative.matches("archive|working-copy|working-copy-prev|\\.lusiad-(?:stage|backup)-[a-f0-9-]{36}"))
            throw new IllegalArgumentException("not an authorized temporary entry");
        return Path.of(ContainedPaths.resolve(root, value, false));
    }

    public static void delete(String root, String value) throws IOException {
        Path path = entry(root, value);
        ContainedPaths.tree(path.toString());
        if (!Files.exists(path)) return;
        Files.walkFileTree(path, new SimpleFileVisitor<>() {
            @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                ContainedPaths.resolve(root, file.toString(), false);
                Files.delete(file); return FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult postVisitDirectory(Path dir, IOException error) throws IOException {
                if (error != null) throw error;
                ContainedPaths.resolve(root, dir.toString(), false);
                Files.delete(dir); return FileVisitResult.CONTINUE;
            }
        });
    }

    public static void reset(String root, String source, String destination) throws IOException {
        reset(root, source, destination, (from, to) -> Files.move(from, to));
    }

    static void reset(String root, String source, String destination, Move move) throws IOException {
        Path from = entry(root, source), to = entry(root, destination);
        if (from.equals(to)) return;
        if (!Files.isDirectory(from)) throw new IOException("snapshot source is not a directory");
        ContainedPaths.tree(from.toString());
        ContainedPaths.tree(to.toString());
        Path stage = entry(root, ".lusiad-stage-" + UUID.randomUUID());
        Path backup = entry(root, ".lusiad-backup-" + UUID.randomUUID());
        boolean saved = false;
        try {
            Files.createDirectory(stage);
            Files.walkFileTree(from, new SimpleFileVisitor<>() {
                @Override public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                    ContainedPaths.resolve(root, dir.toString(), true);
                    Files.createDirectories(stage.resolve(from.relativize(dir)));
                    return FileVisitResult.CONTINUE;
                }
                @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    ContainedPaths.resolve(root, file.toString(), false);
                    Files.copy(file, stage.resolve(from.relativize(file)), StandardCopyOption.COPY_ATTRIBUTES);
                    return FileVisitResult.CONTINUE;
                }
            });
            if (Files.exists(to)) { move.run(to, backup); saved = true; }
            try { move.run(stage, to); }
            catch (IOException | RuntimeException error) {
                if (saved) {
                    try { move.run(backup, to); saved = false; }
                    catch (IOException | RuntimeException recovery) {
                        throw new IOException("snapshot publication failed; previous snapshot retained at " + backup, recovery);
                    }
                }
                throw error;
            }
            if (saved) { delete(root, backup.toString()); saved = false; }
        } finally {
            // Never remove a recovery backup from this block.
            delete(root, stage.toString());
        }
    }
}
