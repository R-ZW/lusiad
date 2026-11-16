package com.lusiad.backend.service.psi;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.openapi.application.ReadAction;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.vfs.LocalFileSystem;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.testFramework.fixtures.BasePlatformTestCase;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

public class PsiDiskConsistencyTest extends BasePlatformTestCase {
    private Path root;
    private Path file;

    @Override
    protected void setUp() throws Exception {
        super.setUp();
        root = Files.createTempDirectory("lusiad-psi-disk-");
        file = root.resolve("Demo.java");
    }

    @Override
    protected void tearDown() throws Exception {
        try {
            if (file != null) Files.deleteIfExists(file);
            if (root != null) Files.deleteIfExists(root);
        } finally { super.tearDown(); }
    }

    public void testReadAndNextEditUseExternallyReplacedFile() throws Exception {
        String before = "class Demo { String text = \"before\"; }\n";
        String external = "class Demo { String text = \"external Ω\"; }\n";
        Files.writeString(file, before);
        assertEquals(before, read());
        Files.writeString(file, external);
        assertEquals(external, read());
        int start = external.indexOf("external Ω");
        String result = PsiService.update(getProject(), 1, root.toString(), "Demo.java",
                Integer.toString(start), Integer.toString(start + "external Ω".length()), "feature",
                Map.of("path", "Demo.java"), false);
        assertFalse(result, JsonParser.parseString(result).getAsJsonObject().has("error"));
        assertTrue(Files.readString(file).contains("\"feature\""));
        assertEquals(Files.readString(file), read());
    }

    public void testEqualLengthAndTimestampReplacementDoesNotReturnStalePsiOrWriteDisk() throws Exception {
        String before = "class Demo { int value = 1; }\n", after = "class Demo { int value = 2; }\n";
        Files.writeString(file, before); read();
        var stamp = Files.getLastModifiedTime(file);
        Files.writeString(file, after); Files.setLastModifiedTime(file, stamp);
        assertState(after);
        assertEquals(stamp, Files.getLastModifiedTime(file));
        assertEquals(after, Files.readString(file));
        var vf = LocalFileSystem.getInstance().findFileByNioFile(file);
        assertFalse(FileDocumentManager.getInstance().isDocumentUnsaved(FileDocumentManager.getInstance().getDocument(vf)));
    }

    public void testMissingSnapshotIsAnExplicitErrorWithoutPsiTree() {
        JsonObject result = JsonParser.parseString(
                PsiService.readJavaPsiStructure(getProject(), root.toString(), "Missing.java")).getAsJsonObject();
        assertEquals("psi_file_not_found", result.get("code").getAsString());
        assertEquals("Java file not found", result.get("error").getAsString());
        assertFalse(result.has("tree"));
    }

    public void testIncompleteJavaIsSavedEvenIfFormattingFails() throws Exception {
        String before = "class Demo { void run() { return; } }\n";
        Files.writeString(file, before);
        read();
        int start = before.indexOf("return;");
        String replacement = "System.out.println(\"unfinished";
        JsonObject result = saved(PsiService.update(getProject(), 1, root.toString(), "Demo.java", Integer.toString(start),
                Integer.toString(start + "return;".length()), replacement, Map.of("path", "Demo.java"), false));
        assertEquals("rejected", result.getAsJsonObject("formatting").get("status").getAsString());
        String expected = before.replace("return;", replacement);
        assertEquals(expected, Files.readString(file));
        assertEquals(expected, read());
    }

    public void testReadDoesNotDiscardUnsavedIntelliJDocument() throws Exception {
        Files.writeString(file, "class Demo {}\n");
        read();
        VirtualFile vf = LocalFileSystem.getInstance().findFileByNioFile(file);
        var document = ReadAction.compute(() -> FileDocumentManager.getInstance().getDocument(vf));
        com.intellij.openapi.command.WriteCommandAction.runWriteCommandAction(getProject(),
                () -> document.setText("class Demo { int unsaved; }\n"));
        assertEquals("class Demo { int unsaved; }\n", read());
        assertEquals("class Demo {}\n", Files.readString(file));
        FileDocumentManager.getInstance().reloadFromDisk(document);
    }

    public void testWhitespaceCreateEditMoveAndDeletePreserveExactLayout() throws Exception {
        String expected = "class Demo {\n\n  void run() {}\n}\n";
        Files.writeString(file, expected);
        read();
        int start = expected.indexOf('\n') + 1;
        PsiService.create(getProject(), 1, root.toString(), "Demo.java",
                Map.of("line", "2", "content", "\n"), false);
        expected = expected.substring(0, start) + "\n" + expected.substring(start);
        assertEquals(expected, Files.readString(file));
        PsiService.update(getProject(), 1, root.toString(), "Demo.java", Integer.toString(start),
                Integer.toString(start + 1), "\n\n", Map.of(), false);
        expected = expected.substring(0, start) + "\n\n" + expected.substring(start + 1);
        assertEquals(expected, Files.readString(file));
        PsiService.move(getProject(), 1, root.toString(), "Demo.java", Map.of(
                "startOffset", Integer.toString(start), "endOffset", Integer.toString(start + 1),
                "line", Integer.toString(expected.split("\n", -1).length)), false);
        expected = expected.substring(0, start) + expected.substring(start + 1) + "\n";
        assertEquals(expected, Files.readString(file));
        int end = expected.length();
        PsiService.delete(getProject(), 1, root.toString(), "Demo.java", Map.of(
                "startOffset", Integer.toString(end - 1), "endOffset", Integer.toString(end)), false);
        expected = expected.substring(0, end - 1);
        assertEquals(expected, Files.readString(file));
        assertEquals(expected, read());
    }

    public void testSequenceFormatsSavesAndReadsTheActualNextState() throws Exception {
        Files.writeString(file, "class Demo {\r\n  void run() {\r\n    int a = 1;\r\n    int b = 2;\r\n  }\r\n}\r\n");
        saved(PsiService.create(getProject(), 0, root.toString(), "Demo.java", Map.of(
                "line", "5", "content", "if (a>0) {System.out.println(\"Ω😀\");}\n"), false));
        String expected = "class Demo {\n  void run() {\n    int a = 1;\n    int b = 2;\n    if (a > 0) {\n      System.out.println(\"Ω😀\");\n    }\n  }\n}\n";
        assertState(expected);
        int start = expected.indexOf("    int b"), end = expected.indexOf('\n', start) + 1;
        saved(PsiService.move(getProject(), 0, root.toString(), "Demo.java", Map.of(
                "startOffset", "" + start, "endOffset", "" + end, "line", "3"), false));
        expected = expected.replace("    int a = 1;\n    int b = 2;", "    int b = 2;\n    int a = 1;");
        assertState(expected);
        start = expected.indexOf("int a = 1;");
        saved(PsiService.update(getProject(), 0, root.toString(), "Demo.java", "" + start, "" + (start + "int a = 1;".length()),
                "int a=7;", Map.of(), false));
        expected = expected.replace("int a = 1;", "int a = 7;"); assertState(expected);
        start = expected.indexOf("    if ("); end = expected.indexOf("    }\n", start) + 6;
        saved(PsiService.delete(getProject(), 0, root.toString(), "Demo.java", Map.of("startOffset", "" + start, "endOffset", "" + end), false));
        expected = expected.substring(0, start) + expected.substring(end); assertState(expected);
        start = expected.indexOf("int a = 7;");
        JsonObject incomplete = saved(PsiService.update(getProject(), 0, root.toString(), "Demo.java", "" + start,
                "" + (start + "int a = 7;".length()), "int a = \"", Map.of(), false));
        assertEquals("rejected", incomplete.getAsJsonObject("formatting").get("status").getAsString());
        expected = expected.replace("int a = 7;", "int a = \""); assertState(expected);
        saved(PsiService.update(getProject(), 0, root.toString(), "Demo.java", "" + start,
                "" + (start + "int a = \"".length()), "int a=9;", Map.of(), false));
        expected = expected.replace("int a = \"", "int a = 9;"); assertState(expected);
    }

    public void testReadOnlyEditHasNoSuccessAndKeepsDiskAndPsi() throws Exception {
        String original = "class Demo { int value; }\n";
        Files.writeString(file, original); read();
        VirtualFile vf = LocalFileSystem.getInstance().findFileByNioFile(file);
        try {
            com.intellij.openapi.command.WriteCommandAction.runWriteCommandAction(getProject(), () -> {
                try { vf.setWritable(false); } catch (java.io.IOException failure) { throw new RuntimeException(failure); }
            });
            JsonObject result = JsonParser.parseString(PsiService.update(getProject(), 0, root.toString(), "Demo.java",
                    "0", "" + original.length(), "class Changed {}", Map.of(), false)).getAsJsonObject();
            assertEquals("save_failed", result.get("code").getAsString());
            assertFalse(result.get("saved").getAsBoolean());
            assertFalse(result.has("status") && result.get("status").getAsString().equals("ok"));
            assertState(original);
        } finally {
            com.intellij.openapi.command.WriteCommandAction.runWriteCommandAction(getProject(), () -> {
                try { vf.setWritable(true); } catch (java.io.IOException failure) { throw new RuntimeException(failure); }
            });
        }
    }

    public void testSilentSaveVetoAndDiskMismatchCannotSucceed() throws Exception {
        String before = "class Demo {}\n";
        Files.writeString(file, before); read();
        VirtualFile vf = LocalFileSystem.getInstance().findFileByNioFile(file);
        var manager = FileDocumentManager.getInstance();
        var document = ReadAction.compute(() -> manager.getDocument(vf));
        try {
            com.intellij.openapi.command.WriteCommandAction.runWriteCommandAction(getProject(), () -> {
                document.setText("class Demo { int value; }\n");
                try {
                    PsiEditPersistence.finish(getProject(), document, vf, false, text -> text, doc -> {});
                    fail("silent save veto was accepted");
                } catch (PsiEditPersistence.SaveFailure error) { assertEquals("save_failed", error.code); }
            });
            assertEquals(before, Files.readString(file));
            manager.reloadFromDisk(document);
            com.intellij.openapi.command.WriteCommandAction.runWriteCommandAction(getProject(), () -> {
                document.setText("class Demo { int another; }\n");
                try {
                    PsiEditPersistence.finish(getProject(), document, vf, false, text -> text, doc -> {
                        manager.saveDocument(doc);
                        try { Files.writeString(file, "class Unexpected {}\n"); }
                        catch (java.io.IOException error) { throw new RuntimeException(error); }
                    });
                    fail("disk mismatch was accepted");
                } catch (PsiEditPersistence.SaveFailure error) { assertEquals("save_verification_failed", error.code); }
            });
        } finally { manager.reloadFromDisk(document); }
    }

    public void testUnavailableFormatterStillSavesTheUnformattedEdit() throws Exception {
        Files.writeString(file, "class Demo {}\n"); read();
        VirtualFile vf = LocalFileSystem.getInstance().findFileByNioFile(file);
        var document = ReadAction.compute(() -> FileDocumentManager.getInstance().getDocument(vf));
        com.intellij.openapi.command.WriteCommandAction.runWriteCommandAction(getProject(), () -> {
            document.setText("class Demo {int value;}\n");
            var result = PsiEditPersistence.finish(getProject(), document, vf, false,
                    text -> { throw new IllegalAccessError("controlled formatter failure"); },
                    doc -> FileDocumentManager.getInstance().saveDocument(doc));
            assertEquals("failed", result.status());
        });
        assertState("class Demo {int value;}\n");
    }

    public void testUtf8BomAndCrLfRemainValidForSaveVerification() throws Exception {
        byte[] source = "\uFEFFclass Demo {\r\n  String café = \"😀\";\r\n}\r\n".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        Files.write(file, source);
        String initial = read();
        int start = initial.indexOf("café");
        saved(PsiService.update(getProject(), 0, root.toString(), "Demo.java", "" + start, "" + (start + 4), "name", Map.of(), false));
        byte[] disk = Files.readAllBytes(file);
        assertEquals((byte) 0xef, disk[0]); assertEquals((byte) 0xbb, disk[1]); assertEquals((byte) 0xbf, disk[2]);
        assertEquals("class Demo {\n  String name = \"😀\";\n}\n", read());
        assertTrue(new String(disk, java.nio.charset.StandardCharsets.UTF_8).contains("\r\n"));
    }

    private JsonObject saved(String response) {
        JsonObject result = JsonParser.parseString(response).getAsJsonObject();
        assertFalse(response, result.has("error"));
        assertTrue(response, result.get("saved").getAsBoolean());
        return result;
    }

    public void testRecordedPlansUseDetachedPsiAndReplayExactFormattedStates() throws Exception {
        Files.writeString(file, "class Demo {\n  void run() {\n    int a = 1;\n    int b = 2;\n  }\n}\n");
        planAndReplay("create", Map.of("line", "5", "content", "if(a>0){System.out.println(\"Ω😀\");}\n"));
        String before = read();
        int start = before.indexOf("    int b"), end = before.indexOf('\n', start) + 1;
        planAndReplay("move", Map.of("startOffset", "" + start, "endOffset", "" + end, "line", "3"));
        before = read(); start = before.indexOf("int a = 1;");
        planAndReplay("update", Map.of("startOffset", "" + start, "endOffset", "" + (start + "int a = 1;".length()), "newContent", "int a=7;"));
        before = read(); start = before.indexOf("if ("); end = before.indexOf("    }\n", start) + 5;
        planAndReplay("delete", Map.of("startOffset", "" + start, "endOffset", "" + end));
        before = read(); start = before.indexOf("int a = 7;");
        planAndReplay("update", Map.of("startOffset", "" + start, "endOffset", "" + (start + "int a = 7;".length()), "newContent", "int a = \""));
    }

    private void planAndReplay(String type, Map<String, String> request) throws Exception {
        String before = read();
        var plan = PsiService.prepareRecordedEdit(getProject(), root.toString(), "Demo.java", request, type);
        assertState(before); // Preparation never mutates the actual IDE document/disk.
        var event = EditCoordinator.event(new EditCoordinator.Pending(1, java.util.UUID.randomUUID().toString(), 1, plan));
        Map<String, String> req = new java.util.HashMap<>();
        req.putAll(com.lusiad.backend.util.JsonUtil.parseSimpleJson(event.toString()));
        JsonObject result = JsonParser.parseString(PsiService.replayRecordedEdit(getProject(), root.toString(), req)).getAsJsonObject();
        assertFalse(result.toString(), result.has("error"));
        assertState(plan.after());
        req.put("beforeHash", "0".repeat(64));
        result = JsonParser.parseString(PsiService.replayRecordedEdit(getProject(), root.toString(), req)).getAsJsonObject();
        assertTrue(result.has("error")); assertState(plan.after());
    }

    public void testComponentInsertionAtEofAndIntoEmptyContainerPreservesBoundaries() throws Exception {
        Files.writeString(file, "class Demo {}");
        String before = read();
        saved(PsiService.create(getProject(), 0, root.toString(), "Demo.java", Map.of(
                "line", "1", "column", "" + (before.length() + 1), "content", "// tail Ω", "componentPlacement", "true"), false));
        assertState("class Demo {}\n// tail Ω\n");
        before = read();
        saved(PsiService.create(getProject(), 0, root.toString(), "Demo.java", Map.of(
                "line", "1", "column", "" + (before.indexOf('{') + 2), "content", "private String name;", "componentPlacement", "true"), false));
        assertState("class Demo {\n  private String name;\n}\n// tail Ω\n");
    }

    public void testMovedLeafCommentCannotConsumeTheDestinationClosingBrace() throws Exception {
        String before = "class Demo {\n  void a() {\n    // Ω😀\n  }\n  void b() {}\n}\n";
        Files.writeString(file, before); read();
        int start = before.indexOf("//"), end = before.indexOf('\n', start);
        int column = before.split("\n")[4].indexOf('{') + 2;
        saved(PsiService.move(getProject(), 0, root.toString(), "Demo.java", Map.of(
                "startOffset", "" + start, "endOffset", "" + end, "line", "5", "column", "" + column, "componentPlacement", "true"), false));
        assertState("class Demo {\n  void a() {}\n\n  void b() {\n    // Ω😀\n  }\n}\n");
    }

    public void testRecordedComponentSeparatorsSurviveExactReplay() throws Exception {
        Files.writeString(file, "class Demo {}");
        String before = read();
        Map<String,String> request = Map.of("line", "1", "column", "" + (before.length()+1),
                "content", "// tail", "componentPlacement", "true");
        var plan = PsiService.prepareRecordedEdit(getProject(), root.toString(), "Demo.java", request, "create");
        var event = EditCoordinator.event(new EditCoordinator.Pending(1, java.util.UUID.randomUUID().toString(), 1, plan));
        assertEquals("\n// tail\n", event.get("insertedContent").getAsString());
        assertState(before);
        planAndReplay("create", request);
        assertState("class Demo {}\n// tail\n");
    }

    public void testZeroLengthMoveIsRejectedWithoutChangingDisk() throws Exception {
        String before = "class Demo {}\n";
        Files.writeString(file, before); read();
        JsonObject result = JsonParser.parseString(PsiService.move(getProject(), 0, root.toString(), "Demo.java", Map.of(
                "startOffset", "0", "endOffset", "0", "line", "2"), false)).getAsJsonObject();
        assertTrue(result.toString(), result.has("error"));
        assertState(before);
    }

    private void assertState(String expected) throws Exception {
        assertEquals(expected, com.intellij.openapi.util.text.StringUtil.convertLineSeparators(Files.readString(file)));
        assertEquals(expected, read());
    }

    private String read() {
        JsonObject result = JsonParser.parseString(PsiService.readJavaPsiStructure(getProject(), root.toString(), "Demo.java")).getAsJsonObject();
        assertFalse(result.toString(), result.has("error"));
        return text(result.getAsJsonObject("tree"));
    }

    private String text(JsonObject node) {
        if (!node.has("children")) return node.get("text").getAsString();
        StringBuilder out = new StringBuilder();
        for (JsonElement child : node.getAsJsonArray("children")) out.append(text(child.getAsJsonObject()));
        return out.toString();
    }
}
