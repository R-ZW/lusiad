package com.lusiad.backend.service.psi;

import java.nio.channels.*;
import java.nio.file.*;
import java.util.Locale;

/** Survives loss of the SQL connection; automatically released if the IDE process exits. */
public final class ProjectEditLock implements AutoCloseable {
    private final FileChannel channel;
    private final FileLock lock;
    private ProjectEditLock(FileChannel channel, FileLock lock) { this.channel = channel; this.lock = lock; }

    public static ProjectEditLock acquire(String root) throws Exception {
        String canonical = Path.of(root).toRealPath().toString();
        if (System.getProperty("os.name").toLowerCase(Locale.ROOT).startsWith("windows")) canonical = canonical.toLowerCase(Locale.ROOT);
        Path directory = Path.of(System.getProperty("java.io.tmpdir"), "lusiad-edit-locks");
        Files.createDirectories(directory);
        if (Files.isSymbolicLink(directory)) throw new IllegalStateException("Edit lock directory cannot be a link");
        Path file = directory.resolve(EditCoordinator.hash(canonical) + ".lock");
        FileChannel channel = FileChannel.open(file, StandardOpenOption.CREATE, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS);
        try {
            FileLock lock = channel.tryLock();
            if (lock == null) throw new OverlappingFileLockException();
            return new ProjectEditLock(channel, lock);
        } catch (Exception failure) {
            channel.close();
            throw new EditCoordinator.Failure("operation_busy", "Another edit or recovery is active for this project; retry after it finishes", null, failure);
        }
    }

    public void close() throws Exception {
        try { lock.release(); } finally { channel.close(); }
        // Never unlink a lock file: another process may already be waiting on its inode.
    }
}
