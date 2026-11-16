package com.lusiad.backend.service.psi;

import com.intellij.openapi.command.WriteCommandAction;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.progress.EmptyProgressIndicator;
import com.intellij.openapi.progress.ProgressManager;
import com.intellij.psi.PsiDocumentManager;
import com.intellij.testFramework.fixtures.BasePlatformTestCase;
import java.util.*;

/** Real IntelliJ parser in an isolated test IDE. These are service regressions, not UI E2E. */
public class SyntaxDiagnosticsTest extends BasePlatformTestCase {
    public void testExpandedJava21LibraryHasParserOwnedDeclarationsAndStatements() {
        String source = """
                record Pair(int left, int right) {}
                @interface Mark { String value() default ""; }
                class Demo {
                  static int total;
                  static { total = 1; }
                  { total++; }
                  Demo(int initial) { total = initial; }
                  int choose(int value) {
                    return switch (value) { case 1 -> { yield 2; } default -> 0; };
                  }
                  void run(String[] items) {
                    outer: for (String item : items) {
                      if (item.isEmpty()) continue outer;
                      if (total > 10) break outer;
                      assert total >= 0 : "Ω";
                      synchronized (this) { total += 1; }
                    }
                    try (var input = new java.io.StringReader("")) {} finally { total++; }
                    java.util.function.Supplier<String[]> factory = () -> new String[]{"Ω"};
                  }
                }
                """;
        var diagnostics = analyze(source).diagnostics();
        assertTrue(diagnostics.toString(), diagnostics.isEmpty());
        var root = com.google.gson.JsonParser.parseString(PsiService.parseJavaSource(getProject(), "Demo.java", source)).getAsJsonObject();
        Set<String> types = new HashSet<>();
        collectTypes(root.getAsJsonObject("tree"), types);
        for (String type : List.of("PsiRecordHeaderImpl", "PsiClassInitializerImpl", "PsiForeachStatementImpl",
                "PsiBreakStatementImpl", "PsiContinueStatementImpl", "PsiYieldStatementImpl", "PsiAssertStatementImpl",
                "PsiSynchronizedStatementImpl", "PsiAssignmentExpressionImpl", "PsiPostfixExpressionImpl", "PsiSwitchExpressionImpl")) {
            assertTrue(type, types.contains(type));
        }
    }

    private void collectTypes(com.google.gson.JsonObject node, Set<String> types) {
        types.add(node.get("type").getAsString());
        if (node.has("children")) for (var child : node.getAsJsonArray("children")) collectTypes(child.getAsJsonObject(), types);
    }

    private SyntaxDiagnostics.Result analyze(String source) {
        return SyntaxDiagnostics.analyze(getProject(), new SyntaxDiagnostics.Request("src/Demo.java", source, null));
    }

    public void testCompleteSyntaxDoesNotResolveSymbolsOrCheckTypes() {
        String source = "import absent.Library; class Demo { int value = \"wrong type\"; void run(){ unknown(1, 2); } }";
        var result = analyze(source);
        assertEquals("ok", result.status());
        assertEquals("psi-syntax", result.source());
        assertEquals(1, result.version());
        assertEquals("src/Demo.java", result.file());
        assertEquals(source.length(), result.sourceLength());
        assertEquals(EditCoordinator.hash(source), result.revision());
        assertEquals(result.revision(), result.baseRevision());
        assertTrue(result.diagnostics().isEmpty());
        assertTrue(analyze("").diagnostics().isEmpty());
    }

    public void testIncompleteDeclarationsExpressionsAndDelimitersReturnParserProblems() {
        for (String source : List.of("class Demo { int ; }", "class Demo { void run(){ if (true > ) {} } }",
                "class Demo { void run(){ int x = 1 } }", "class Demo { void run(")) {
            var result = analyze(source);
            assertFalse(source, result.diagnostics().isEmpty());
            for (var problem : result.diagnostics()) {
                assertEquals("error", problem.severity());
                assertFalse(problem.message().isBlank());
                assertCoordinates(source, problem.range());
            }
        }
    }

    public void testProposalUsesTheCompleteFileContextAndRecordsBothRevisions() {
        String source = "class Demo { void run(){} }";
        int methodBody = source.indexOf("{}") + 1;
        var valid = SyntaxDiagnostics.analyze(getProject(), new SyntaxDiagnostics.Request("Demo.java", source,
                new SyntaxDiagnostics.Edit(methodBody, methodBody, "return;")));
        assertTrue(valid.diagnostics().isEmpty());
        int classBody = source.indexOf('{') + 1;
        var invalid = SyntaxDiagnostics.analyze(getProject(), new SyntaxDiagnostics.Request("Demo.java", source,
                new SyntaxDiagnostics.Edit(classBody, classBody, "return;")));
        assertFalse(invalid.diagnostics().isEmpty());
        assertEquals(EditCoordinator.hash(source), invalid.baseRevision());
        assertEquals(EditCoordinator.hash(source.substring(0, classBody) + "return;" + source.substring(classBody)), invalid.revision());
        assertFalse(valid.revision().equals(invalid.revision()));
        try { new SyntaxDiagnostics.Request("Demo.java", source, new SyntaxDiagnostics.Edit(0, source.length() + 1, "")); fail(); }
        catch (IllegalArgumentException expected) { }
        String unicode = "class Demo { String text = \"😀\"; }";
        int emoji = unicode.indexOf("😀");
        try { new SyntaxDiagnostics.Request("Demo.java", unicode, new SyntaxDiagnostics.Edit(emoji, emoji + 1, "")); fail(); }
        catch (IllegalArgumentException expected) { }
        assertEquals(unicode, new SyntaxDiagnostics.Request("Demo.java", unicode, null).proposedSource());
    }

    public void testOriginalCoordinatesAndHashesPreserveCrlfCrUnicodeAndEscapedLiterals() {
        String lf = "class Demo {\n String text = \"😀 café \\\"Ω\\\" \\r\\n\";\n void run(){ int value = ; }\n}\n";
        var baseline = analyze(lf);
        assertFalse(baseline.diagnostics().isEmpty());
        for (String ending : List.of("\n", "\r\n", "\r")) {
            String original = lf.replace("\n", ending);
            var result = analyze(original);
            assertEquals(EditCoordinator.hash(original), result.revision());
            assertEquals(original.length(), result.sourceLength());
            assertEquals(baseline.diagnostics().size(), result.diagnostics().size());
            for (int i = 0; i < result.diagnostics().size(); i++) {
                var a = baseline.diagnostics().get(i).range();
                var b = result.diagnostics().get(i).range();
                assertCoordinates(original, b);
                assertEquals(a.startLine(), b.startLine()); assertEquals(a.startColumn(), b.startColumn());
                assertEquals(a.endLine(), b.endLine()); assertEquals(a.endColumn(), b.endColumn());
                assertEquals(lf.substring(a.startOffset(), a.endOffset()).replace("\n", ending), original.substring(b.startOffset(), b.endOffset()));
            }
        }
        String mixed = "class Demo {\r\n String text = \"😀\";\r void run(){ int x = ; }\n}\r\n";
        for (var problem : analyze(mixed).diagnostics()) assertCoordinates(mixed, problem.range());
    }

    public void testZeroLengthProblemsAtEofRemainLocatable() {
        String source = "class Demo {";
        var result = analyze(source);
        assertTrue(result.diagnostics().toString(), result.diagnostics().stream().anyMatch(p -> p.range() != null
                && p.range().startOffset() == source.length() && p.range().endOffset() == source.length()));
        for (var problem : result.diagnostics()) assertCoordinates(source, problem.range());
        System.out.println("EOF example: " + new com.google.gson.Gson().toJson(result));
    }

    public void testLanguageLevelIsReportedAndIndependentOfTheHostProject() {
        var settings = com.intellij.openapi.roots.LanguageLevelProjectExtension.getInstance(getProject());
        var previous = settings.getLanguageLevel();
        try {
            WriteCommandAction.runWriteCommandAction(getProject(), () -> settings.setLanguageLevel(com.intellij.pom.java.LanguageLevel.JDK_1_8));
            var result = analyze("record Demo(int x) { String run(){ return \"\"\"\ntext\n\"\"\"; } }");
            assertEquals(SyntaxDiagnostics.LANGUAGE_LEVEL.name(), result.languageLevel());
            assertTrue(result.diagnostics().toString(), result.diagnostics().isEmpty());
            System.out.println("Syntax parser language level: " + result.languageLevel());
        } finally { WriteCommandAction.runWriteCommandAction(getProject(), () -> settings.setLanguageLevel(previous)); }
    }

    public void testAnalysisDoesNotReloadSaveOrCreateFilesEvenWithTheSameName() throws Exception {
        var live = myFixture.addFileToProject("src/Demo.java", "class Demo { int persisted; }\n");
        var document = PsiDocumentManager.getInstance(getProject()).getDocument(live);
        assertNotNull(document);
        byte[] disk = live.getVirtualFile().contentsToByteArray();
        WriteCommandAction.runWriteCommandAction(getProject(), () -> document.setText("class Demo { int unsaved; }\n"));
        long stamp = document.getModificationStamp();
        var result = analyze("class Demo { void broken( }");
        assertFalse(result.diagnostics().isEmpty());
        assertEquals("class Demo { int unsaved; }\n", document.getText());
        assertEquals(stamp, document.getModificationStamp());
        assertTrue(FileDocumentManager.getInstance().isDocumentUnsaved(document));
        assertTrue(Arrays.equals(disk, live.getVirtualFile().contentsToByteArray()));
        SyntaxDiagnostics.analyze(getProject(), new SyntaxDiagnostics.Request("New.java", "class New {}", null));
        assertNull(myFixture.findFileInTempDir("New.java"));
    }

    public void testUnavailableAndCancelledAnalysisNeverReturnAnEmptySuccess() {
        try { SyntaxDiagnostics.analyze(null, new SyntaxDiagnostics.Request("Demo.java", "", null)); fail(); }
        catch (SyntaxDiagnostics.Failure expected) { assertEquals("syntax_analysis_unavailable", expected.code); }
        EmptyProgressIndicator indicator = new EmptyProgressIndicator();
        try { ProgressManager.getInstance().runProcess(() -> { indicator.cancel(); return analyze("class Demo {}"); }, indicator); fail(); }
        catch (SyntaxDiagnostics.Failure expected) { assertEquals("syntax_analysis_cancelled", expected.code); }
    }

    private void assertCoordinates(String text, SyntaxDiagnostics.Range range) {
        assertNotNull(range);
        assertTrue(range.startOffset() >= 0 && range.endOffset() >= range.startOffset() && range.endOffset() <= text.length());
        assertEquals(position(text, range.startOffset()), List.of(range.startLine(), range.startColumn()));
        assertEquals(position(text, range.endOffset()), List.of(range.endLine(), range.endColumn()));
    }

    public void testOperationProposalsReusePlacementAndParseTheCompleteContext() {
        String source = "class Demo {\n void run(){\n if (true) return;\n }\n}\n";
        int start = source.indexOf("return;"), end = start + "return;".length();
        var insertion = new HashMap<>(Map.of("line", "3", "column", "2", "content", "int n = ;", "componentPlacement", "true"));
        String created = PsiService.proposedEdit(getProject(), "Demo.java", source, insertion, "create");
        assertTrue(created.contains("int n = ;\nif (true) return;"));
        assertFalse(analyze(created).diagnostics().isEmpty());
        String deleted = PsiService.proposedEdit(getProject(), "Demo.java", source,
                Map.of("startOffset", "" + start, "endOffset", "" + end), "delete");
        assertFalse(analyze(deleted).diagnostics().isEmpty());
        String moved = PsiService.proposedEdit(getProject(), "Demo.java", source,
                Map.of("startOffset", "" + start, "endOffset", "" + end, "line", "1", "componentPlacement", "true"), "move");
        assertTrue(moved.startsWith("return;\nclass Demo"));
        assertFalse(analyze(moved).diagnostics().isEmpty());
        String updated = PsiService.proposedEdit(getProject(), "Demo.java", source,
                Map.of("startOffset", "" + start, "endOffset", "" + end, "newContent", "return;\r\n// café 😀"), "update");
        assertFalse(updated.contains("\r"));
        assertTrue(analyze(updated).diagnostics().isEmpty());
        assertEquals("int n = ;", insertion.get("content"));
    }

    public void testProposalDoesNotTouchAnExistingUnsavedDocumentOrCreateAnEvent() throws Exception {
        var live = myFixture.addFileToProject("Demo.java", "class Demo {}\n");
        var doc = PsiDocumentManager.getInstance(getProject()).getDocument(live);
        byte[] disk = live.getVirtualFile().contentsToByteArray();
        WriteCommandAction.runWriteCommandAction(getProject(), () -> doc.setText("class Demo { int unsaved; }\n"));
        long stamp = doc.getModificationStamp();
        String proposal = PsiService.proposedEdit(getProject(), "Demo.java", "class Demo {}\n",
                Map.of("line", "1", "column", "13", "content", "int x;", "componentPlacement", "true"), "create");
        assertTrue(proposal.contains("int x;"));
        assertEquals("class Demo { int unsaved; }\n", doc.getText());
        assertEquals(stamp, doc.getModificationStamp());
        assertTrue(Arrays.equals(disk, live.getVirtualFile().contentsToByteArray()));
    }
    private List<Integer> position(String text, int offset) {
        int line = 1, column = 1;
        for (int i = 0; i < offset; i++) {
            char c = text.charAt(i);
            if (c == '\r') { if (i + 1 < offset && text.charAt(i + 1) == '\n') i++; line++; column = 1; }
            else if (c == '\n') { line++; column = 1; }
            else column++;
        }
        return List.of(line, column);
    }
}
