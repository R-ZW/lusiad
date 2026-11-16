package com.lusiad.backend.service.project;

import org.junit.Test;
import java.nio.file.*;
import java.nio.file.attribute.DosFileAttributeView;
import java.util.*;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

/** Windows-specific deletion regression; uses only its own disposable directory. */
public class ProjectFilesWindowsTest {
    @Test public void readOnlyGitObjectsAreRemovedOnlyFromAuthorizedQuarantine() throws Exception {
        assumeTrue("DOS read-only deletion semantics require Windows",System.getProperty("os.name").startsWith("Windows"));
        Path base=Files.createTempDirectory("lusiad-readonly-delete-");
        try {
            Path root=Files.createDirectory(base.resolve("project"));
            Path objects=Files.createDirectories(root.resolve(".git/objects/ab"));
            Path object=Files.writeString(objects.resolve("123456"),"Git object fixture");
            Path neighbor=Files.writeString(base.resolve("preserved.txt"),"outside the deletion");
            Files.getFileAttributeView(object,DosFileAttributeView.class).setReadOnly(true);
            Files.getFileAttributeView(neighbor,DosFileAttributeView.class).setReadOnly(true);
            String id=UUID.randomUUID().toString();Path staged=ProjectFiles.trash(root,id);
            Files.move(root,staged,StandardCopyOption.ATOMIC_MOVE);
            try { ProjectFiles.purge(root,base,id);fail("Unrelated directory accepted"); }
            catch(ProjectManagementService.Failure expected){assertEquals("project_protected_path",expected.code);}
            assertTrue(Files.getFileAttributeView(staged.resolve(".git/objects/ab/123456"),DosFileAttributeView.class).readAttributes().isReadOnly());
            ProjectFiles.purge(root,staged,id);ProjectFiles.purge(root,staged,id);
            assertFalse(Files.exists(staged));assertEquals("outside the deletion",Files.readString(neighbor));
            assertTrue(Files.getFileAttributeView(neighbor,DosFileAttributeView.class).readAttributes().isReadOnly());
        } finally {
            try(var paths=Files.walk(base)) {
                for(var path:paths.sorted(Comparator.reverseOrder()).toList()) {
                    Files.getFileAttributeView(path,DosFileAttributeView.class,LinkOption.NOFOLLOW_LINKS).setReadOnly(false);
                    Files.delete(path);
                }
            }
        }
    }
}
