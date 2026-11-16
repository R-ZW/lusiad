package com.lusiad.backend.service.change;

import com.google.gson.*;
import com.google.googlejavaformat.java.Formatter;
import com.intellij.openapi.application.ReadAction;
import com.intellij.testFramework.fixtures.BasePlatformTestCase;
import com.lusiad.backend.service.psi.EditCoordinator;
import java.util.*;

public class ChangeMetadataTest extends BasePlatformTestCase {
    public void testClassInitializersKeepTheirOwnIdentityInsteadOfAnAnonymousBlock() throws Exception {
        for (String prefix : List.of("", "static ")) {
            var result = update("class Demo { int n; " + prefix + "{ n = 1; } }",
                    prefix + "{ n = 1; }", prefix + "{ n = 2; }");
            assertEquals(prefix.isEmpty() ? "instanceInitializer" : "staticInitializer", kind(side(result.facts, "before")));
            assertEquals(prefix.isEmpty() ? "instanceInitializer" : "staticInitializer", kind(side(result.facts, "after")));
        }
    }

    private record Edit(JsonObject facts, String after) {}
    private Edit update(String before, String old, String replacement) throws Exception {
        int start = before.indexOf(old); assertTrue(start >= 0);
        String raw = before.substring(0, start) + replacement + before.substring(start + old.length());
        String after;
        try { after = new Formatter().formatSource(raw); } catch (Exception malformed) { after = raw; }
        JsonObject result = new JsonObject();
        result.addProperty("startOffset", start); result.addProperty("endOffset", start + old.length());
        result.addProperty("insertedChars", replacement.length());
        String formatted = after;
        return new Edit(ReadAction.compute(() -> ChangeMetadata.code(getProject(), "src/Ω.java", "update", before, raw, formatted, result)), after);
    }
    private JsonObject side(JsonObject facts, String name) { return facts.getAsJsonObject(name); }
    private String kind(JsonObject side) { return side.getAsJsonObject("element").get("kind").getAsString(); }
    private String field(JsonObject facts) { return facts.getAsJsonArray("differences").get(0).getAsJsonObject().get("field").getAsString(); }
    private void located(String source, JsonObject side, String expected) {
        JsonObject range = side.getAsJsonObject("range");
        int a = range.get("start").getAsInt(), b = range.get("end").getAsInt();
        assertEquals(expected, source.substring(a, b));
        assertEquals(source.substring(0, a).chars().filter(c -> c == '\n').count() + 1, range.get("startLine").getAsLong());
    }

    public void testOnlyInequivoqualPropertiesAreClassified() throws Exception {
        String before = "class Demo { private int count; int sum(int x) { return x + 1; } }";
        var name = update(before, "private int count;", "private int total;");
        assertEquals("name", field(name.facts)); assertEquals("field", kind(side(name.facts, "after")));
        assertEquals("total", side(name.facts, "after").getAsJsonObject("element").get("name").getAsString());
        assertEquals("type", field(update(before, "private int count;", "private long count;").facts));
        assertEquals("signature", field(update(before, "int sum(int x) { return x + 1; }", "int sum(int x, int y) { return x + 1; }").facts));
        assertTrue(update(before, "private int count;", "private long total;").facts.getAsJsonArray("differences").isEmpty());
        assertEquals("expression", field(update(before, "return x + 1;", "return x + 2;").facts));
        assertEquals("condition", field(update("class D {void a(){if (true) {}}}", "if (true) {}", "if (false) {}").facts));
    }
    public void testMethodBodyChangesNeverClaimASignatureChange() throws Exception {
        var edit = update("class D { int run(int x) { return x; } }", "int run(int x) { return x; }", "int run(int x) { return x+1; }");
        assertEquals("method", kind(side(edit.facts, "before")));
        assertEquals("method", kind(side(edit.facts, "after")));
        assertTrue(edit.facts.getAsJsonArray("differences").isEmpty());
        var arrays = update("class D { void run(int values[], String... args) {} }", "void run(int values[], String... args) {}", "void run(int values[][], String... args) {}");
        assertEquals("run(int[][], String...)", side(arrays.facts, "after").getAsJsonObject("element").get("name").getAsString());
        assertEquals("signature", field(arrays.facts));
    }
    public void testSeveralElementsAndIncompleteJavaStayConservative() throws Exception {
        var edit = update("class D { void a(){ int x = 1; int y = 2; } }", "int x = 1; int y = 2;", "long z = 3; throw new RuntimeException();");
        assertEquals("elements", kind(side(edit.facts, "before")));
        assertEquals("elements", kind(side(edit.facts, "after")));
        assertTrue(edit.facts.getAsJsonArray("differences").isEmpty());
        assertTrue(update("class D { int x = 1; }", "int x = 1;", "int y = \"").facts.getAsJsonArray("differences").isEmpty());
    }
    public void testCreationAndDeletionUseTheirOwnStates() throws Exception {
        String raw = "class Demo {}", after = new Formatter().formatSource(raw);
        JsonObject create = new JsonObject(); create.addProperty("offset", 0); create.addProperty("insertedChars", raw.length());
        JsonObject facts = ReadAction.compute(() -> ChangeMetadata.code(getProject(), "Demo.java", "create", "", raw, after, create));
        assertTrue(facts.get("before").isJsonNull()); assertEquals("class", kind(side(facts, "after")));
        located(after, side(facts, "after"), after.strip());
        JsonObject deletion = new JsonObject(); deletion.addProperty("startOffset", 0); deletion.addProperty("endOffset", after.strip().length());
        facts = ReadAction.compute(() -> ChangeMetadata.code(getProject(), "Demo.java", "delete", after, "\n", "\n", deletion));
        assertTrue(facts.get("after").isJsonNull()); assertEquals("class", kind(side(facts, "before")));
    }
    public void testMovementUsesExactTokenOrdinalWithRepeatedContentAndFormatting() throws Exception {
        String before = "class D { void a(){ switch(1){ case 1 -> {System.out.println(\"Ω😀\");} default -> {} } } void b(){System.out.println(\"Ω😀\");} }";
        String moved = "System.out.println(\"Ω😀\");";
        int start = before.indexOf(moved), end = start + moved.length(), target = before.indexOf("default -> {") + "default -> {".length();
        String removed = before.substring(0, start) + before.substring(end);
        int insertion = target - moved.length();
        String raw = removed.substring(0, insertion) + moved + removed.substring(insertion);
        String after = new Formatter().formatSource(raw);
        JsonObject result = new JsonObject(); result.addProperty("startOffset", start); result.addProperty("endOffset", end);
        result.addProperty("targetOffset", insertion); result.addProperty("insertedChars", moved.length());
        JsonObject facts = ReadAction.compute(() -> ChangeMetadata.code(getProject(), "D.java", "move", before, raw, after, result));
        located(before, side(facts, "before"), moved); located(after, side(facts, "after"), moved);
        assertTrue(side(facts, "before").getAsJsonArray("context").toString().contains("case"));
        assertTrue(side(facts, "after").getAsJsonArray("context").toString().contains("default"));
        assertFalse(side(facts, "after").getAsJsonArray("context").toString().contains("b()"));
        assertTrue(side(facts, "before").getAsJsonObject("range").get("startLine").getAsInt()
                < side(facts, "after").getAsJsonObject("range").get("startLine").getAsInt());
    }
    public void testUnsupportedTokenRewriteDoesNotInventALocation() {
        JsonObject r = new JsonObject(); r.addProperty("offset", 0); r.addProperty("insertedChars", 10);
        JsonObject facts = ReadAction.compute(() -> ChangeMetadata.code(getProject(), "D.java", "create", "", "class D {}", "class Other {}", r));
        assertTrue(side(facts, "after").get("range").isJsonNull());
        assertEquals("fragment", kind(side(facts, "after")));
    }
    public void testSameNameInDifferentClassesRetainsActualContextAndLeavesCodeUntouched() throws Exception {
        String before = "class A {int value;} class B {int value;}";
        var edit = update(before, "class B {int value;}", "class B {long value;}");
        assertTrue(edit.facts.getAsJsonArray("differences").isEmpty()); // An entire class was selected, not just its field.
        assertEquals("B", side(edit.facts, "after").getAsJsonObject("element").get("name").getAsString());
        var whitespace = update("class D {\n\n}\n", "\n\n", "\n\n\n");
        assertEquals("whitespace", kind(side(whitespace.facts, "before")));
    }
    public void testActualFilesystemPathsAtRootAndInFolders() {
        var create = ChangeMetadata.paths("file_create", null, "Calculator.java");
        assertEquals("Calculator.java", side(create, "after").get("path").getAsString());
        var rename = ChangeMetadata.paths("file_rename", "src/Calculator.java", "src/Basic.java");
        assertEquals("src/Calculator.java", side(rename, "before").get("path").getAsString());
        assertEquals("Basic.java", side(rename, "after").getAsJsonObject("element").get("name").getAsString());
        assertEquals("directory", ChangeMetadata.paths("dir_move", "src/a", "other/a").get("kind").getAsString());
    }
    public void testMetadataSurvivesDurablePlanSerializationAndIgnoresClientClaim() throws Exception {
        var edit = update("class D {int run(){return 1;}}", "return 1;", "return 2;");
        JsonObject result = new JsonObject(); result.add("changeMetadata", edit.facts);
        var plan = new EditCoordinator.Plan("root", "D.java", "update", Map.of("changeMetadata", "forged", "changeDescription", "free Ω😀"), "before", edit.after, result);
        var codec = new GsonBuilder().serializeNulls().create();
        var restored = codec.fromJson(codec.toJson(plan), EditCoordinator.Plan.class);
        JsonObject event = EditCoordinator.event(new EditCoordinator.Pending(1, "id", 1, restored));
        assertEquals(edit.facts, event.getAsJsonObject("changeMetadata"));
        assertFalse(event.has("changeDescription"));
        assertEquals("free Ω😀", restored.request().get("changeDescription"));
    }
}
