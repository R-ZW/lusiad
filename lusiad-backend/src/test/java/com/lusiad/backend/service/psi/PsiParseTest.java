package com.lusiad.backend.service.psi;

import com.google.gson.JsonObject;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.intellij.testFramework.fixtures.BasePlatformTestCase;

public class PsiParseTest extends BasePlatformTestCase {
    public void testParsesCommittedSourceWithoutCreatingProjectFile() {
        String source = "class Demo {\n String text = \"a, b: \\\"quoted\\\" — café\";\n void run() {}\n}\n";
        JsonObject result = JsonParser.parseString(
                PsiService.parseJavaSource(getProject(), "Demo.java", source)).getAsJsonObject();

        assertEquals("Demo.java", result.get("file").getAsString());
        assertTrue(result.has("tree"));
        assertEquals(source.length(), result.getAsJsonObject("tree").get("endOffset").getAsInt());
    }

    public void testParsesWindowsSnapshotWithConsistentOffsetsAndLines() {
        String source = "class Demo {\r\n  private String name;\r\n  void run() {\r\n    return;\r\n  }\r\n}\r\n";
        assertParsedCoordinates(source, source.replace("\r\n", "\n"));
    }

    public void testParsesMixedSeparatorsWithoutChangingLiteralEscapes() {
        String source = "class Demo {\r\n  String text = \"\\r\\n — café\";\r  void run() {}\n}\r\n";
        String expected = "class Demo {\n  String text = \"\\r\\n — café\";\n  void run() {}\n}\n";
        assertParsedCoordinates(source, expected);
    }

    public void testHistoricalParsingDoesNotReloadOrSaveLiveUnsavedDocumentWithSameName() throws Exception {
        var live = myFixture.addFileToProject("Live.java", "class Live {}\n");
        byte[] persisted = live.getVirtualFile().contentsToByteArray();
        var document = com.intellij.psi.PsiDocumentManager.getInstance(getProject()).getDocument(live);
        assertNotNull(document);
        com.intellij.openapi.command.WriteCommandAction.runWriteCommandAction(getProject(), () -> document.setText("class Live { int unsaved; }\n"));
        assertTrue(com.intellij.openapi.fileEditor.FileDocumentManager.getInstance().isDocumentUnsaved(document));
        String result = PsiService.parseJavaSource(getProject(), "Live.java", "class Live { int historical; }\n");
        assertTrue(result.contains("historical"));
        assertEquals("class Live { int unsaved; }\n", document.getText());
        assertTrue(com.intellij.openapi.fileEditor.FileDocumentManager.getInstance().isDocumentUnsaved(document));
        assertTrue(java.util.Arrays.equals(persisted, live.getVirtualFile().contentsToByteArray()));
    }

    private void assertParsedCoordinates(String source, String expected) {
        JsonObject result = JsonParser.parseString(
                PsiService.parseJavaSource(getProject(), "Demo.java", source)).getAsJsonObject();
        JsonObject tree = result.getAsJsonObject("tree");
        assertEquals(expected.length(), tree.get("endOffset").getAsInt());
        assertEquals(expected, leafText(tree));
        assertNodeCoordinates(tree, expected);
        assertNull(myFixture.findFileInTempDir("Demo.java"));
    }

    private String leafText(JsonObject node) {
        if (!node.has("children")) return node.get("text").getAsString();
        StringBuilder text = new StringBuilder();
        for (JsonElement child : node.getAsJsonArray("children")) text.append(leafText(child.getAsJsonObject()));
        return text.toString();
    }

    private void assertNodeCoordinates(JsonObject node, String source) {
        int start = node.get("startOffset").getAsInt();
        int end = node.get("endOffset").getAsInt();
        int endPosition = Math.max(start, end - 1);
        assertEquals(lineAt(source, start), node.get("startLine").getAsInt());
        assertEquals(lineAt(source, endPosition), node.get("endLine").getAsInt());
        assertEquals(start - source.lastIndexOf('\n', start - 1), node.get("startColumn").getAsInt());
        assertEquals(endPosition - source.lastIndexOf('\n', endPosition - 1), node.get("endColumn").getAsInt());
        if (!node.has("children")) assertEquals(source.substring(start, end), node.get("text").getAsString());
        else for (JsonElement child : node.getAsJsonArray("children")) assertNodeCoordinates(child.getAsJsonObject(), source);
    }

    private int lineAt(String source, int position) {
        return 1 + (int) source.substring(0, position).chars().filter(character -> character == '\n').count();
    }
}
