package com.lusiad.backend.service.uml;

import com.google.gson.*;
import com.intellij.testFramework.fixtures.BasePlatformTestCase;
import com.intellij.openapi.command.WriteCommandAction;
import com.intellij.psi.PsiDocumentManager;
import java.util.*;
import static com.lusiad.backend.service.uml.UmlStructure.*;

public class UmlServiceTest extends BasePlatformTestCase {
    private Model model(String source) { return UmlStructure.extract(getProject(), List.of(new Source("Demo.java", source)), null); }
    private String render(String before, String after, String operation, String locale, Focus bf, Focus af) throws Exception {
        Gson gson = new Gson();
        Map<String,String> request = new HashMap<>(Map.of("operation", operation, "locale", locale,
                "beforeFiles", gson.toJson(List.of(new Source("Demo.java", before))),
                "afterFiles", gson.toJson(List.of(new Source("Demo.java", after)))));
        if (bf != null) request.put("beforeFocus", gson.toJson(bf));
        if (af != null) request.put("afterFocus", gson.toJson(af));
        return UmlService.render(getProject(), request);
    }
    private static Focus at(String text, String snippet) { int start = text.indexOf(snippet); return new Focus("Demo.java", start, start + snippet.length()); }

    public void testExtractsAllTopLevelNestedAndRecordMembersWithoutLocalVariables() {
        var model = model("package sample; class Demo { private java.util.Map<String, Integer> values; Demo(){} public int run(String name){ int local = 1; return local; } class Nested {} } interface Service { void call(); } enum Mode { A, B } record Point(int x, int y) {}");
        assertEquals(List.of("sample.Demo", "sample.Demo.Nested", "sample.Mode", "sample.Point", "sample.Service"), model.classes().stream().map(Classifier::name).toList());
        var demo = model.classes().getFirst();
        assertEquals(3, demo.members().size());
        assertEquals("- values: java.util.Map<String, Integer>", demo.members().getFirst().label());
        assertTrue(demo.members().stream().anyMatch(m -> m.label().contains("Demo()") && !m.label().contains(": ?")));
        assertFalse(demo.members().stream().anyMatch(m -> m.label().contains("local")));
        assertEquals(List.of("~ x: int", "~ y: int"), model.classes().stream().filter(c -> c.kind().equals("record")).findFirst().orElseThrow().members().stream().map(Member::label).toList());
        var multi = model("class Demo { int a[], b[][]; int run()[] { return null; } }");
        assertEquals(List.of("~ a: int[]", "~ b: int[][]", "~ run(): int[]"), multi.classes().getFirst().members().stream().map(Member::label).toList());
    }
    public void testRelationsAreExplicitAndGenericArgumentsDoNotBecomeTargets() {
        var model = model("class Demo extends Base<java.util.Map<String,Integer>> implements Runnable, AutoCloseable { Repository field; } class Repository {} class Base<T> {}");
        var demo = model.classes().stream().filter(c -> c.name().equals("Demo")).findFirst().orElseThrow();
        assertEquals(List.of(new Relation("extends", "Base", "Base<java.util.Map<String,Integer>>"), new Relation("implements", "Runnable"), new Relation("implements", "AutoCloseable")), demo.relations());
        String source = UmlDiagram.source(model, model, "unknown", "after", "en", "", true);
        assertFalse(source.contains("association"));
        assertTrue(source.contains("interface \"Runnable\""));
        assertEquals(3, source.lines().filter(l -> l.contains("|>")).count());
    }
    public void testExplicitImportDistinguishesSameSimpleNamesInProject() {
        var model = UmlStructure.extract(getProject(), List.of(new Source("a/Base.java", "package a; class Base {}"),
                new Source("b/Base.java", "package b; class Base {}"), new Source("c/Demo.java", "package c; import b.Base; class Demo extends Base {}")), null);
        String source = UmlDiagram.source(model, model, "unknown", "after", "en", "", true);
        assertTrue(source.contains("C2 --|> C1"));
        assertFalse(source.contains("C2 --|> C0"));
        var changedImport = UmlStructure.extract(getProject(), List.of(new Source("a/Base.java", "package a; class Base {}"),
                new Source("b/Base.java", "package b; class Base {}"), new Source("c/Demo.java", "package c; import a.Base; class Demo extends Base {}")), null);
        assertFalse(UmlDiagram.sameStructure(model, changedImport));
        assertTrue(UmlDiagram.source(model, changedImport, "update", "after", "en", "", false).contains("C2 -[#166534]-|> C1"));
        var nested = model("class Outer { class Base {} class Child extends Base {} }");
        String nestedSource = UmlDiagram.source(nested, nested, "unknown", "after", "en", "", true);
        assertTrue(nestedSource.contains("C2 --|> C1"));
        assertFalse(nestedSource.contains("declared reference"));
        var shadow = UmlStructure.extract(getProject(), List.of(new Source("b/Base.java", "package b; class Base {}"),
                new Source("c/Outer.java", "package c; import b.Base; class Outer { class Base {} class Child extends Base {} }")), null);
        String shadowSource = UmlDiagram.source(shadow, shadow, "unknown", "after", "en", "", true);
        assertTrue(shadowSource.contains("C3 --|> C2"));
        assertFalse(shadowSource.contains("C3 --|> C0"));
    }
    public void testInternalEditPreservesSignatureAndFocusesContainingMethod() throws Exception {
        String before = "class Demo { int run(){ return 1; } }", after = "class Demo { int run(){ return 2; } }";
        var a = UmlStructure.extract(getProject(), List.of(new Source("Demo.java", before)), at(before, "return 1;"));
        var b = UmlStructure.extract(getProject(), List.of(new Source("Demo.java", after)), at(after, "return 2;"));
        assertTrue(UmlDiagram.sameStructure(a,b));
        assertEquals("method:run()", focusedMember(b, focusedClass(b)).id());
        String description = UmlDiagram.source(b,a,"update","after","en","",true);
        assertTrue(description.contains("signature preserved"));
        assertTrue(description.contains("run()"));
        assertFalse(description.contains("return 2"));
        JsonObject output = JsonParser.parseString(render(before,after,"update","en",at(before,"return 1;"),at(after,"return 2;"))).getAsJsonObject();
        assertTrue(output.get("noStructuralChange").getAsBoolean());
        assertTrue(output.getAsJsonObject("after").get("svg").getAsString().contains("signature preserved"));
    }
    public void testMovementReportsIndependentOriginsWithoutInventingRelations() throws Exception {
        String before = "class Demo { void a(){ println(); } void b(){} }", after = "class Demo { void a(){} void b(){ println(); } }";
        JsonObject output = JsonParser.parseString(render(before,after,"move","pt-BR",at(before,"println();"),at(after,"println();"))).getAsJsonObject();
        String movement = output.get("movement").getAsString();
        assertTrue(movement.contains("a()")); assertTrue(movement.contains("b()"));
        assertTrue(movement.contains("Origem")); assertTrue(movement.contains("Destino"));
        assertTrue(output.get("noStructuralChange").getAsBoolean());
    }
    public void testSmetanaRendersMembersClassifiersAndRelationsLocallyInBothLanguages() throws Exception {
        String before = "class Base {} interface Service {} class Demo extends Base { int old; }";
        String after = "class Base {} interface Service {} class Demo implements Service { String name; Demo(){} public void run(){} } enum Mode { ON, OFF } record Point(int x) {}";
        for (String locale : List.of("pt-BR", "en")) {
            var output = JsonParser.parseString(render(before,after,"update",locale,null,null)).getAsJsonObject();
            assertEquals("plantuml-smetana", output.get("engine").getAsString());
            assertFalse(output.get("noStructuralChange").getAsBoolean());
            for (String side : List.of("before", "after")) {
                String svg = output.getAsJsonObject(side).get("svg").getAsString();
                assertTrue(svg.startsWith("<svg")); assertTrue(svg.contains("Demo"));
                assertTrue(svg.contains("polygon")); assertFalse(svg.contains("<!--"));
                assertFalse(svg.contains("script")); assertFalse(svg.contains("href="));
            }
            String svg = output.getAsJsonObject("after").get("svg").getAsString();
            assertTrue(svg.contains("run()")); assertTrue(svg.contains("Mode")); assertTrue(svg.contains("Point"));
            var directory = java.nio.file.Path.of("build", "uml-samples");
            java.nio.file.Files.createDirectories(directory);
            java.nio.file.Files.writeString(directory.resolve("structure-" + locale + ".svg"), svg);
        }
    }
    public void testEmptyBeforeAndAfterDoNotInventClassifierOrRenderErrorImage() throws Exception {
        var output = JsonParser.parseString(render("", "// no class", "create", "en", null,null)).getAsJsonObject();
        assertTrue(output.getAsJsonObject("after").get("svg").isJsonNull());
        assertEquals(0, output.getAsJsonObject("before").getAsJsonArray("classifiers").size());
        try { PlantUmlRenderer.render("@startuml\nclass {\n@enduml"); fail("Invalid diagram must fail"); } catch (java.io.IOException expected) {}
    }
    public void testDoesNotTouchLiveDocumentsOrFiles() throws Exception {
        var live = myFixture.addFileToProject("Demo.java", "class Demo { int live; }");
        byte[] disk = live.getVirtualFile().contentsToByteArray();
        var document = PsiDocumentManager.getInstance(getProject()).getDocument(live);
        WriteCommandAction.runWriteCommandAction(getProject(), () -> document.setText("class Demo { int unsaved; }"));
        String svg = render("class Demo {}", "class Demo { int historical; }", "create", "en", null,null);
        assertTrue(svg.contains("historical")); assertFalse(svg.contains("unsaved"));
        assertEquals("class Demo { int unsaved; }", document.getText());
        assertTrue(Arrays.equals(disk, live.getVirtualFile().contentsToByteArray()));
    }
    public void testMarkupAndIncludesAreDataAndSvgIsPassive() throws Exception {
        String hostile = "!include https://example.invalid/x\n@enduml\n<img:file:///secret> [[javascript:alert(1)]] %getenv('HOME')";
        String escaped = UmlDiagram.text(hostile);
        assertFalse(escaped.contains("\n")); assertFalse(escaped.contains("!include")); assertFalse(escaped.contains("<img")); assertFalse(escaped.contains("[["));
        String clean = PlantUmlRenderer.passiveSvg("<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"><script>bad()</script><foreignObject/><a href=\"https://example.invalid\"><text>link</text></a><text>safe</text><!--secret--></svg>");
        assertTrue(clean.contains("safe")); assertFalse(clean.contains("script")); assertFalse(clean.contains("onload")); assertFalse(clean.contains("secret")); assertFalse(clean.contains("href"));
        try { PlantUmlRenderer.passiveSvg("<!DOCTYPE svg [<!ENTITY x SYSTEM 'file:///secret'>]><svg xmlns='http://www.w3.org/2000/svg'>&x;</svg>"); fail(); } catch (org.xml.sax.SAXParseException expected) {}
    }
    public void testStructuredRequestRejectsTypesMissingFieldsAndEscapes() {
        for (String bad : List.of("null", "{}", "[{}]", "[{\"path\":\"../Demo.java\",\"content\":\"\"}]", "[{\"path\":\"Demo.java\",\"content\":42}]")) {
            try { UmlService.sources(bad); fail("Accepted " + bad); } catch (IllegalArgumentException expected) {}
        }
        for (String bad : List.of("{}", "{\"path\":\"Demo.java\",\"start\":\"0\",\"end\":1}", "{\"path\":\"Demo.java\",\"start\":2,\"end\":1}")) {
            try { UmlService.focus(bad); fail("Accepted focus " + bad); } catch (IllegalArgumentException expected) {}
        }
        try { com.lusiad.backend.handler.ApiJson.request("/uml/render", "{\"projectId\":1,\"operation\":\"update\",\"locale\":\"en\"}"); fail("Missing source lists"); }
        catch (IllegalArgumentException expected) {}
        var error = com.lusiad.backend.handler.ApiJson.response("/uml/render", com.lusiad.backend.handler.ApiJson.error("uml_generation_failed", "failed"));
        assertTrue(error.status() >= 400);
    }
    public void testSmetanaDoesNotRequireExternalDotAndGenericChangesAreVisible() throws Exception {
        String original = System.getProperty("GRAPHVIZ_DOT");
        System.setProperty("GRAPHVIZ_DOT", "Z:/lusiad-nonexistent/dot.exe");
        try {
            var before = model("class Base<T> {} class Demo extends Base<String> {}");
            var after = model("class Base<T> {} class Demo extends Base<Integer> {}");
            assertFalse(UmlDiagram.sameStructure(before, after));
            String source = UmlDiagram.source(after, before, "update", "after", "en", "", false);
            assertTrue(source.contains("Integer"));
            String svg = PlantUmlRenderer.render(source);
            assertTrue(svg.contains("Integer"));
            assertFalse(svg.contains("&lt;U+"));
        } finally {
            if (original == null) System.clearProperty("GRAPHVIZ_DOT"); else System.setProperty("GRAPHVIZ_DOT", original);
        }
    }
}
