package com.lusiad.backend.service.project;

import com.lusiad.backend.config.RuntimeEnvironment;
import com.lusiad.backend.service.fs.ContainedPaths;
import java.io.InputStream;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.util.*;

/** Physical deletion is staged beside the exact authorized root, never through a shell. */
public final class ProjectFiles {
    private ProjectFiles() {}
    public record Tree(String revision, long files, long bytes) {}
    public static String key(Path path) {
        String value = path.toAbsolutePath().normalize().toString().replace('\\', '/');
        return System.getProperty("os.name").startsWith("Windows") ? value.toLowerCase(Locale.ROOT) : value;
    }
    public static Path root(String value) throws Exception {
        Path path = Path.of(ContainedPaths.clean(value));
        if (!path.isAbsolute()) throw new ProjectManagementService.Failure("project_invalid_path");
        RuntimeEnvironment.assertPath(path.toString(), false);
        return path.normalize();
    }
    public static Path physical(Path path) throws Exception {
        if (Files.exists(path, LinkOption.NOFOLLOW_LINKS)) return path.toRealPath();
        Path parent = path;
        while (parent != null && !Files.exists(parent, LinkOption.NOFOLLOW_LINKS)) parent = parent.getParent();
        if (parent == null) throw new ProjectManagementService.Failure("project_invalid_path");
        return parent.toRealPath().resolve(parent.relativize(path)).normalize();
    }
    public static boolean overlap(Path a, Path b) { return a.startsWith(b) || b.startsWith(a); }
    public static Path trash(Path root, String id) {
        UUID.fromString(id);
        if (root.getParent() == null) throw new ProjectManagementService.Failure("project_protected_path");
        return root.resolveSibling(".lusiad-delete-" + id);
    }
    public static Tree inspect(Path root) throws Exception {
        if (!Files.isDirectory(root, LinkOption.NOFOLLOW_LINKS) || !key(root).equals(key(root.toRealPath())))
            throw new ProjectManagementService.Failure("project_linked_path");
        MessageDigest hash = MessageDigest.getInstance("SHA-256"); long[] totals = {0, 0};
        long deadline = System.nanoTime() + 30_000_000_000L;
        List<Path> entries = new ArrayList<>();
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                if (System.nanoTime() > deadline || entries.size() >= 200_000) throw new ProjectManagementService.Failure("project_tree_limit");
                ContainedPaths.resolve(root.toString(), dir.toString(), true); entries.add(dir); return FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                if (System.nanoTime() > deadline || entries.size() >= 200_000) throw new ProjectManagementService.Failure("project_tree_limit");
                ContainedPaths.resolve(root.toString(), file.toString(), false);
                if (!attrs.isRegularFile()) throw new ProjectManagementService.Failure("project_linked_path");
                entries.add(file); return FileVisitResult.CONTINUE;
            }
        });
        entries.sort(Comparator.comparing(path -> root.relativize(path).toString()));
        byte[] buffer = new byte[64 * 1024];
        for (Path path : entries) {
            if (System.nanoTime() > deadline || entries.size() > 200_000) throw new ProjectManagementService.Failure("project_tree_limit");
            byte[] relative=root.relativize(path).toString().replace('\\','/').getBytes(java.nio.charset.StandardCharsets.UTF_8);
            hash.update(java.nio.ByteBuffer.allocate(4).putInt(relative.length).array());hash.update(relative);
            if (Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) {
                var before=Files.readAttributes(path,BasicFileAttributes.class,LinkOption.NOFOLLOW_LINKS);
                totals[0]++; hash.update((byte) 1);hash.update(java.nio.ByteBuffer.allocate(8).putLong(before.size()).array());
                long read=0;
                try (InputStream input = Files.newInputStream(path, LinkOption.NOFOLLOW_LINKS)) {
                    for (int size; (size = input.read(buffer)) != -1;) {
                        if (System.nanoTime() > deadline) throw new ProjectManagementService.Failure("project_tree_limit");
                        totals[1] += size; read+=size;hash.update(buffer, 0, size);
                    }
                }
                var after=Files.readAttributes(path,BasicFileAttributes.class,LinkOption.NOFOLLOW_LINKS);
                if(read!=before.size() || before.size()!=after.size() || !before.lastModifiedTime().equals(after.lastModifiedTime()) || !Objects.equals(before.fileKey(),after.fileKey()))
                    throw new ProjectManagementService.Failure("project_stale");
            } else hash.update((byte) 2);
        }
        return new Tree(HexFormat.of().formatHex(hash.digest()), totals[0], totals[1]);
    }
    public static void purge(Path original, Path staged, String operationId) throws Exception {
        if (!trash(original, operationId).equals(staged)) throw new ProjectManagementService.Failure("project_protected_path");
        if (!Files.exists(staged, LinkOption.NOFOLLOW_LINKS)) return;
        // Reauthorize at recovery time; never follow a link substituted after publication.
        inspect(staged);
        long deadline=System.nanoTime()+30_000_000_000L;
        Files.walkFileTree(staged, new SimpleFileVisitor<>() {
            private void checkpoint(){if(System.nanoTime()>deadline)throw new ProjectManagementService.Failure("project_cleanup_pending");}
            @Override public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                checkpoint();
                ContainedPaths.resolve(staged.toString(), dir.toString(), true); return FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws java.io.IOException {
                checkpoint();
                removeStagedEntry(staged,file,false); return FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult postVisitDirectory(Path dir, java.io.IOException error) throws java.io.IOException {
                checkpoint();
                if (error != null) throw error;
                removeStagedEntry(staged,dir,true); return FileVisitResult.CONTINUE;
            }
        });
    }
    private static void removeStagedEntry(Path staged,Path entry,boolean allowRoot) throws java.io.IOException {
        ContainedPaths.resolve(staged.toString(),entry.toString(),allowRoot);
        try { Files.delete(entry); }
        catch(AccessDeniedException denied) {
            // Git object files are normally DOS read-only. Only the already-published deletion
            // area may have this attribute cleared; ACLs and the live source are never changed.
            if(!System.getProperty("os.name").startsWith("Windows"))throw denied;
            var dos=Files.getFileAttributeView(entry,java.nio.file.attribute.DosFileAttributeView.class,LinkOption.NOFOLLOW_LINKS);
            if(dos==null || !dos.readAttributes().isReadOnly())throw denied;
            var before=Files.readAttributes(entry,BasicFileAttributes.class,LinkOption.NOFOLLOW_LINKS);
            if(!before.isRegularFile() && !before.isDirectory())throw denied;
            ContainedPaths.resolve(staged.toString(),entry.toString(),allowRoot);
            try { dos.setReadOnly(false);Files.delete(entry); }
            catch(java.io.IOException failure) {
                try {
                    ContainedPaths.resolve(staged.toString(),entry.toString(),allowRoot);
                    if(Files.exists(entry,LinkOption.NOFOLLOW_LINKS) && Objects.equals(before.fileKey(),Files.readAttributes(entry,BasicFileAttributes.class,LinkOption.NOFOLLOW_LINKS).fileKey()))
                        dos.setReadOnly(true);
                } catch(Exception restore){failure.addSuppressed(restore);}
                throw failure;
            }
        }
    }
}
