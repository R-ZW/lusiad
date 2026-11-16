package com.lusiad.backend.service.run;

import com.google.gson.JsonObject;
import com.google.gson.JsonArray;
import com.lusiad.backend.service.diagnostics.JavaAnalysisContext;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import java.nio.file.*;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

/** Disposable, real javac/java process checks. These are not UI E2E. */
public class JavaRunServiceTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    private Path root, output, configuration;
    @Before public void setup() throws Exception {
        root = temporary.newFolder("project").toPath(); output = temporary.newFolder("output").toPath();
        configuration = temporary.getRoot().toPath().resolve("settings.json");
    }
    private void source(String path, String content) throws Exception {
        Path file = root.resolve(path); Files.createDirectories(file.getParent()); Files.writeString(file, content);
    }
    private JsonObject await(JavaRunService service, int project) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
        while (System.nanoTime() < deadline) {
            JsonObject state = service.status(project);
            if (java.util.Set.of("succeeded", "failed", "stopped").contains(state.get("state").getAsString())) return state;
            Thread.sleep(50);
        }
        fail("Java execution did not finish within the test deadline"); return null;
    }
    @Test public void emptyMainListDoesNotStartAProcess() throws Exception {
        source("Only.java", "class Only { void main(String[] args) {} }");
        try (JavaRunService service = new JavaRunService(configuration)) {
            assertEquals(0, service.list(root.toString(), output.toString()).getAsJsonArray("mains").size());
            assertEquals("idle", service.status(1).get("state").getAsString());
        }
    }
    @Test public void listsMultipleMainsAndRejectsAnOldSourceRevision() throws Exception {
        source("A.java", "class A { public static void main(String[] args) {} }");
        source("B.java", "class B { public static void main(String... args) {} }");
        try (JavaRunService service = new JavaRunService(configuration)) {
            JsonObject list = service.list(root.toString(), output.toString());
            assertEquals(2, list.getAsJsonArray("mains").size());
            source("A.java", "class A { public static void main(String[] args) { System.out.println(1); } }");
            try {
                service.start(4, root.toString(), output.toString(), "A", list.get("contextRevision").getAsString());
                fail("A changed source must invalidate the selected main");
            } catch (JavaAnalysisContext.Failure expected) { assertEquals("java_context_stale", expected.code); }
            assertEquals("idle", service.status(4).get("state").getAsString());
        }
    }
    @Test public void unavailableDeclaredJdkDoesNotBecomeAnEmptyMainList() throws Exception {
        source("A.java", "class A { public static void main(String[] args) {} }");
        JsonObject settings = new JsonObject();
        settings.addProperty("jdkHome", root.resolve("missing-jdk").toString());
        settings.addProperty("release", Runtime.version().feature());
        JsonArray roots = new JsonArray(); roots.add(".");
        settings.add("sourceRoots", roots);
        settings.add("testRoots", new JsonArray());
        settings.add("classpath", new JsonArray());
        settings.add("modulePath", new JsonArray());
        JsonObject projects = new JsonObject(); projects.add(JavaAnalysisContext.key(root), settings);
        JsonObject shared = new JsonObject(); shared.addProperty("version", 1); shared.add("javaProjects", projects);
        Files.writeString(configuration, shared.toString());
        try (JavaRunService service = new JavaRunService(configuration)) {
            try {
                service.list(root.toString(), output.toString());
                fail("Missing JDK should be reported as unavailable");
            } catch (JavaAnalysisContext.Failure expected) { assertEquals("java_context_incomplete", expected.code); }
        }
    }
    @Test public void discoversOnlyMainDeclarationsAndRunsSavedUncommittedSource() throws Exception {
        source("p/Hello.java", "package p; public class Hello { public static void main(String[] args) { System.out.println(\"olá\"); } }");
        source("p/Other.java", "package p; class Other { void main(String[] args) {} }");
        try (JavaRunService service = new JavaRunService(configuration)) {
            JsonObject list = service.list(root.toString(), output.toString());
            assertEquals(1, list.getAsJsonArray("mains").size());
            assertEquals("p.Hello", list.getAsJsonArray("mains").get(0).getAsJsonObject().get("className").getAsString());
            service.start(1, root.toString(), output.toString(), "p.Hello", list.get("contextRevision").getAsString());
            JsonObject result = await(service, 1);
            assertEquals("succeeded", result.get("state").getAsString());
            assertTrue(result.get("output").getAsString().contains("olá"));
            assertEquals(0, result.get("exitCode").getAsInt());
            assertFalse(Files.exists(root.resolve("p/Hello.class")));
        }
    }
    @Test public void reportsCompilationErrorsWithoutWritingToProject() throws Exception {
        source("Broken.java", "class Broken { public static void main(String[] args) { missing(); } }");
        try (JavaRunService service = new JavaRunService(configuration)) {
            JsonObject list = service.list(root.toString(), output.toString());
            service.start(2, root.toString(), output.toString(), "Broken", list.get("contextRevision").getAsString());
            JsonObject result = await(service, 2);
            assertEquals("failed", result.get("state").getAsString());
            assertTrue(result.get("errors").getAsString().contains("missing"));
            assertFalse(Files.exists(root.resolve("Broken.class")));
        }
    }
    @Test public void stopsRunningProgramAndRetainsItsOutput() throws Exception {
        source("Wait.java", "class Wait { public static void main(String[] args) throws Exception { System.out.println(\"started\"); Thread.sleep(30000); } }");
        try (JavaRunService service = new JavaRunService(configuration)) {
            JsonObject list = service.list(root.toString(), output.toString());
            JsonObject started = service.start(3, root.toString(), output.toString(), "Wait", list.get("contextRevision").getAsString());
            String id = started.get("id").getAsString();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
            while (System.nanoTime() < deadline && !service.status(3).get("output").getAsString().contains("started")) Thread.sleep(50);
            assertTrue(service.status(3).get("output").getAsString().contains("started"));
            assertEquals("stopped", service.stop(3, id).get("state").getAsString());
            assertEquals("stopped", await(service, 3).get("state").getAsString());
        }
    }
}
