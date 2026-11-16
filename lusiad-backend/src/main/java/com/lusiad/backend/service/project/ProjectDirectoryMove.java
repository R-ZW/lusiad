package com.lusiad.backend.service.project;

import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;

/** Same-filesystem directory rename. Never merge, replace, copy/delete, or guess after a failure. */
final class ProjectDirectoryMove {
    private ProjectDirectoryMove() {}

    static Path destination(Path source, Path parent) throws Exception {
        if (!Files.isDirectory(parent) || Files.isSymbolicLink(parent)) fail("project_invalid_path");
        parent = parent.toRealPath();
        if (source.getFileName() == null) fail("project_protected_path");
        Path target = parent.resolve(source.getFileName());
        if (ProjectFiles.key(source).equals(ProjectFiles.key(target))) fail("project_move_same_path");
        if (ProjectFiles.overlap(source, target)) fail("project_protected_path");
        if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) fail("project_move_destination_exists");
        if (!Files.getFileStore(source).equals(Files.getFileStore(parent))) fail("project_move_cross_device");
        return target;
    }

    static void apply(Path source, Path target, String revision) throws Exception {
        if (!destination(source, target.getParent()).equals(target)) fail("project_stale");
        verify(source, revision);
        // No ATOMIC_MOVE: that option is permitted to replace an existing destination.
        // Default same-filesystem rename refuses collisions; the durable receipt handles failure.
        Files.move(source, target);
        verify(target, revision);
    }

    static void rollback(Path source, Path target, String revision) throws Exception {
        boolean before = Files.exists(source, LinkOption.NOFOLLOW_LINKS);
        boolean after = Files.exists(target, LinkOption.NOFOLLOW_LINKS);
        if (before == after) fail("project_recovery_required");
        if (before) { verify(source, revision); return; }
        verify(target, revision);
        if (!ProjectFiles.key(ProjectFiles.physical(source)).equals(ProjectFiles.key(source))) fail("project_recovery_required");
        Files.move(target, source); // Never overwrite a recreated source.
        verify(source, revision);
    }

    static void verify(Path root, String revision) throws Exception {
        if (!ProjectFiles.inspect(root).revision().equals(revision)) fail("project_recovery_required");
    }

    private static void fail(String code) { throw new ProjectManagementService.Failure(code); }
}
