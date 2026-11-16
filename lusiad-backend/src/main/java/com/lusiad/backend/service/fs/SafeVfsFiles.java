package com.lusiad.backend.service.fs;

import com.intellij.openapi.vfs.VirtualFile;
import java.io.IOException;
import java.util.UUID;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;

/** Used inside the IDE write command. Keeps the overwritten file until the move succeeds. */
final class SafeVfsFiles {
    private SafeVfsFiles() {}
    @FunctionalInterface interface Move { void run(VirtualFile file, VirtualFile destination) throws IOException; }
    @FunctionalInterface interface Write { void run(VirtualFile file, byte[] content) throws IOException; }
    @FunctionalInterface interface Delete { void run(VirtualFile file) throws IOException; }

    static String delete(VirtualFile file) throws IOException {
        return delete(file, entry -> entry.delete(SafeVfsFiles.class));
    }

    /** Copy first: an I/O error halfway through recursive deletion must not destroy the only copy. */
    static String delete(VirtualFile file, Delete operation) throws IOException {
        Path original = Path.of(file.getPath());
        VirtualFile backup = file.copy(SafeVfsFiles.class, file.getParent(), ".lusiad-backup-" + UUID.randomUUID());
        try { operation.run(file); }
        catch (IOException | RuntimeException failure) {
            try {
                Path source = Path.of(backup.getPath());
                Files.walkFileTree(source, new SimpleFileVisitor<>() {
                    @Override public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                        Files.createDirectories(original.resolve(source.relativize(dir)));
                        return FileVisitResult.CONTINUE;
                    }
                    @Override public FileVisitResult visitFile(Path item, BasicFileAttributes attrs) throws IOException {
                        Files.copy(item, original.resolve(source.relativize(item)), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.COPY_ATTRIBUTES);
                        return FileVisitResult.CONTINUE;
                    }
                });
                backup.delete(SafeVfsFiles.class);
            } catch (IOException | RuntimeException recovery) {
                throw new IOException("delete failed; recovery copy retained at " + backup.getPath(), recovery);
            }
            throw failure;
        }
        try { backup.delete(SafeVfsFiles.class); return null; }
        catch (IOException cleanup) { return backup.getPath(); }
    }

    static VirtualFile create(VirtualFile parent, String name, byte[] content) throws IOException {
        return create(parent, name, content, VirtualFile::setBinaryContent);
    }

    static VirtualFile create(VirtualFile parent, String name, byte[] content, Write write) throws IOException {
        if (parent.findChild(name) != null) throw new IOException("file already exists: " + name);
        VirtualFile file = parent.createChildData(SafeVfsFiles.class, name);
        try { if (content.length != 0) write.run(file, content); }
        catch (IOException | RuntimeException error) {
            try { file.delete(SafeVfsFiles.class); }
            catch (IOException cleanup) { throw new IOException("creation failed; partial file retained at " + file.getPath(), cleanup); }
            throw error;
        }
        return file;
    }

    static String replaceMove(VirtualFile source, VirtualFile destination, boolean overwrite) throws IOException {
        return replaceMove(source, destination, overwrite, (file, dir) -> file.move(SafeVfsFiles.class, dir));
    }

    /** Returns a retained backup path only if post-success cleanup failed. */
    static String replaceMove(VirtualFile source, VirtualFile destination, boolean overwrite, Move move) throws IOException {
        VirtualFile originalParent = source.getParent();
        if (destination.equals(originalParent)) return null;
        VirtualFile existing = destination.findChild(source.getName());
        if (existing != null && existing.isDirectory()) throw new IOException("destination is a directory");
        if (existing != null && !overwrite) throw new IOException("file already exists in destination");
        String name = source.getName();
        String backupName = ".lusiad-backup-" + UUID.randomUUID();
        if (existing != null) existing.rename(SafeVfsFiles.class, backupName);
        try {
            move.run(source, destination);
        } catch (IOException | RuntimeException failure) {
            try {
                if (!source.getParent().equals(originalParent)) source.move(SafeVfsFiles.class, originalParent);
                if (existing != null) existing.rename(SafeVfsFiles.class, name);
            } catch (IOException | RuntimeException recovery) {
                throw new IOException("move failed; recovery required at " + destination.getPath() + "/" + backupName,
                        recovery);
            }
            throw failure;
        }
        if (existing != null) {
            try { existing.delete(SafeVfsFiles.class); }
            catch (IOException cleanup) { return existing.getPath(); }
        }
        return null;
    }
}
