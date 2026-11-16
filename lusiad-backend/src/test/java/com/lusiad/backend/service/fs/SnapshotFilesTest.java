package com.lusiad.backend.service.fs;

import junit.framework.TestCase;
import java.io.IOException;
import java.nio.file.*;
import java.util.concurrent.atomic.AtomicBoolean;

public class SnapshotFilesTest extends TestCase {
    public void testStagingFailureRollbackSuccessAndCleanupBoundaries() throws Exception {
        Path fixture = Files.createTempDirectory("lusiad-snapshot-fs-");
        try {
            Path root = Files.createDirectory(fixture.resolve("temp"));
            Path source = Files.createDirectory(root.resolve("archive")), target = Files.createDirectory(root.resolve("working-copy"));
            Files.writeString(source.resolve("X.java"), "new Ω\r\n"); Files.writeString(target.resolve("X.java"), "previous\r\n");
            Path outside = Files.writeString(fixture.resolve("outside"), "keep");
            AtomicBoolean failed = new AtomicBoolean();
            try {
                SnapshotFiles.reset(root.toString(), source.toString(), target.toString(), (from, to) -> {
                    if (from.getFileName().toString().startsWith(".lusiad-stage-") && !failed.getAndSet(true)) throw new IOException("publication failure");
                    Files.move(from, to);
                }); fail("failure hidden");
            } catch (IOException expected) { assertEquals("publication failure", expected.getMessage()); }
            assertEquals("previous\r\n", Files.readString(target.resolve("X.java")));
            SnapshotFiles.reset(root.toString(), source.toString(), target.toString());
            assertEquals("new Ω\r\n", Files.readString(target.resolve("X.java")));
            for (String unsafe : new String[]{root.toString(), "..", outside.toString(), "another-project", "archive/../working-copy"}) {
                try { SnapshotFiles.delete(root.toString(), unsafe); fail("unsafe cleanup accepted"); }
                catch (IllegalArgumentException expected) { assertNotNull(expected.getMessage()); }
            }
            assertEquals("keep", Files.readString(outside));
            SnapshotFiles.delete(root.toString(), "working-copy");
            assertTrue(Files.exists(source.resolve("X.java"))); assertFalse(Files.exists(target));
        } finally {
            try (var paths = Files.walk(fixture)) {
                for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) Files.delete(path);
            }
        }
    }
}
