package com.lusiad.backend.service.fs;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.openapi.command.WriteCommandAction;
import com.intellij.openapi.vfs.LocalFileSystem;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.testFramework.fixtures.BasePlatformTestCase;
import java.io.IOException;
import java.nio.file.*;
import java.util.Map;

public class FsOperationsTest extends BasePlatformTestCase {
    private Path root;
    @Override protected void setUp() throws Exception { super.setUp(); root = Files.createTempDirectory("lusiad-fs-"); }
    @Override protected void tearDown() throws Exception {
        try (var files = Files.walk(root)) {
            for (Path file : files.sorted(java.util.Comparator.reverseOrder()).toList()) Files.delete(file);
        } finally { super.tearDown(); }
    }
    private JsonObject json(String value) { return JsonParser.parseString(value).getAsJsonObject(); }
    private VirtualFile vf(Path path) { return LocalFileSystem.getInstance().refreshAndFindFileByNioFile(path); }

    public void testConflictsNoOpsCaseRenameAndDirectoryGuards() throws Exception {
        Files.createDirectory(root.resolve("src")); Files.createDirectory(root.resolve("dst"));
        Files.writeString(root.resolve("src/X.java"), "source"); Files.writeString(root.resolve("dst/X.java"), "previous");
        assertTrue(json(FsFileService.create(getProject(), 0, root.toString(), "src", "X.java", "bad", Map.of(), false)).has("error"));
        assertTrue(json(FsFileService.move(getProject(), 0, root.toString(), "src/X.java", "dst", Map.of(), false)).has("error"));
        assertEquals("previous", Files.readString(root.resolve("dst/X.java")));
        assertTrue(json(FsFileService.move(getProject(), 0, root.toString(), "src/X.java", "src", Map.of("overwrite", "true"), false)).get("noOp").getAsBoolean());
        assertTrue(json(FsFileService.rename(getProject(), 0, root.toString(), "src/X.java", "X.java", Map.of(), false)).get("noOp").getAsBoolean());
        assertTrue(json(FsDirService.move(getProject(), 0, root.toString(), "src", "", Map.of(), false)).get("noOp").getAsBoolean());
        assertTrue(json(FsDirService.move(getProject(), 0, root.toString(), "src", "src", Map.of(), false)).get("noOp").getAsBoolean());
        Files.createDirectory(root.resolve("src/child"));
        assertTrue(json(FsDirService.move(getProject(), 0, root.toString(), "src", "src/child", Map.of(), false)).has("error"));
        assertTrue(json(FsDirService.delete(getProject(), 0, root.toString(), "src", Map.of(), false)).has("error"));
        assertFalse(json(FsFileService.rename(getProject(), 0, root.toString(), "src/X.java", "x.java", Map.of(), false)).has("error"));
        assertEquals("x.java", vf(root.resolve("src")).findChild("x.java").getName());
        assertFalse(json(FsFileService.move(getProject(), 0, root.toString(), "src/x.java", "dst", Map.of("overwrite", "true"), false)).has("error"));
        assertEquals("source", Files.readString(root.resolve("dst/x.java")));
        assertFalse(Files.exists(root.resolve("src/x.java")));
        assertFalse(json(FsDirService.delete(getProject(), 0, root.toString(), "src", Map.of("recursive", "true"), false)).has("error"));
        assertFalse(Files.exists(root.resolve("src")));
    }

    public void testReplacementRollbackBeforeAndAfterActualMove() throws Exception {
        Path src = Files.createDirectory(root.resolve("src")), dst = Files.createDirectory(root.resolve("dst"));
        Files.writeString(src.resolve("X.java"), "source Ω\r\n"); Files.writeString(dst.resolve("X.java"), "previous\r\n");
        for (boolean moveFirst : new boolean[]{false, true}) {
            VirtualFile file = vf(src.resolve("X.java")), folder = vf(dst);
            IOException[] error = {null};
            WriteCommandAction.runWriteCommandAction(getProject(), () -> {
                try {
                    SafeVfsFiles.replaceMove(file, folder, true, (source, destination) -> {
                        if (moveFirst) source.move(this, destination);
                        throw new IOException("controlled disk failure");
                    });
                    fail("failure was hidden");
                } catch (IOException expected) { error[0] = expected; }
            });
            assertNotNull(error[0]);
            assertEquals("source Ω\r\n", Files.readString(src.resolve("X.java")));
            assertEquals("previous\r\n", Files.readString(dst.resolve("X.java")));
            try (var children = Files.list(dst)) { assertEquals(1L, children.count()); }
        }
    }

    public void testPartialDeletionRestoresTheCompleteTree() throws Exception {
        Path tree = Files.createDirectory(root.resolve("tree"));
        Files.writeString(tree.resolve("first"), "first"); Files.writeString(tree.resolve("second"), "second");
        VirtualFile folder = vf(tree);
        WriteCommandAction.runWriteCommandAction(getProject(), () -> {
            try {
                SafeVfsFiles.delete(folder, entry -> {
                    entry.findChild("first").delete(this);
                    throw new IOException("controlled deletion failure");
                });
                fail("deletion failure was hidden");
            } catch (IOException expected) { assertEquals("controlled deletion failure", expected.getMessage()); }
        });
        assertEquals("first", Files.readString(tree.resolve("first")));
        assertEquals("second", Files.readString(tree.resolve("second")));
        try (var entries = Files.list(root)) { assertEquals(1L, entries.count()); }
    }

    private String psiText(Path working) {
        JsonObject result = json(com.lusiad.backend.service.psi.PsiService.readJavaPsiStructure(getProject(), working.toString(), "Demo.java"));
        assertFalse(result.toString(), result.has("error"));
        return leaves(result.getAsJsonObject("tree"));
    }

    private String leaves(JsonObject node) {
        if (!node.has("children") || node.getAsJsonArray("children").isEmpty()) return node.has("text") ? node.get("text").getAsString() : "";
        StringBuilder text = new StringBuilder();
        for (var child : node.getAsJsonArray("children")) text.append(leaves(child.getAsJsonObject()));
        return text.toString();
    }

    public void testPublishedSnapshotIsReadThroughPsiWithoutStaleContent() throws Exception {
        Path archive = Files.createDirectory(root.resolve("archive"));
        Path working = Files.createDirectory(root.resolve("working-copy"));
        Files.writeString(archive.resolve("Demo.java"), "class Demo { int value = 2; }\n");
        Files.writeString(working.resolve("Demo.java"), "class Demo { int value = 1; }\n");
        assertEquals("class Demo { int value = 1; }\n", psiText(working));
        SnapshotFiles.reset(root.toString(), archive.toString(), working.toString());
        assertEquals("class Demo { int value = 2; }\n", psiText(working));
        assertEquals("class Demo { int value = 2; }\n", Files.readString(working.resolve("Demo.java")));
    }

    public void testFailedCreationRemovesOnlyItsNewFileAndCannotReplaceDirectory() throws Exception {
        VirtualFile folder = vf(root);
        WriteCommandAction.runWriteCommandAction(getProject(), () -> {
            try {
                SafeVfsFiles.create(folder, "New.java", new byte[]{1}, (file, content) -> { throw new IOException("write failed"); });
                fail("creation failure was hidden");
            } catch (IOException expected) { assertNull(folder.findChild("New.java")); }
        });
        Files.createDirectory(root.resolve("src")); Files.createDirectory(root.resolve("dst"));
        Files.writeString(root.resolve("src/X.java"), "source");
        Files.createDirectory(root.resolve("dst/X.java")); Files.writeString(root.resolve("dst/X.java/keep"), "keep");
        assertTrue(json(FsFileService.move(getProject(), 0, root.toString(), "src/X.java", "dst", Map.of("overwrite", "true"), false)).has("error"));
        assertEquals("keep", Files.readString(root.resolve("dst/X.java/keep")));
        assertEquals("source", Files.readString(root.resolve("src/X.java")));
    }
}
