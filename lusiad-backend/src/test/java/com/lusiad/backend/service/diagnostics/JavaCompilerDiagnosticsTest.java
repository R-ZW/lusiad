package com.lusiad.backend.service.diagnostics;

import com.google.gson.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import javax.tools.ToolProvider;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.jar.*;
import static org.junit.Assert.*;

/** Compiler/context regressions on disposable files, not UI E2E. */
public class JavaCompilerDiagnosticsTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    private Path root, snapshots, config;
    @Before public void setUp() throws Exception {
        root = temporary.newFolder("project").toPath(); snapshots = temporary.newFolder("snapshots").toPath(); config = temporary.getRoot().toPath().resolve("config.json");
    }
    @Test public void compilerDiscoveryUsesTheRuntimeModuleNotTheIdeClasspath() throws Exception {
        System.out.println("Javac runtime=" + System.getProperty("java.home") + "; compiler module=" + ModuleLayer.boot().findModule("jdk.compiler")
                + "; tools module=" + ToolProvider.class.getModule() + "; system loader=" + ClassLoader.getSystemClassLoader());
        System.out.println("compiler providers=" + ServiceLoader.load(javax.tools.JavaCompiler.class).stream().map(p -> p.type().getName()).toList());
        System.out.println("platform javac=" + Class.forName("com.sun.tools.javac.api.JavacTool", true, ClassLoader.getPlatformClassLoader()));
        assertNotNull(RuntimeJavaCompiler.get());
    }
    private void source(String name, String source) throws Exception { Path file = root.resolve(name); Files.createDirectories(file.getParent()); Files.writeString(file, source); }
    private JavaAnalysisContext.Snapshot snapshot() { return JavaAnalysisContext.capture(root.toString(), snapshots.toString(), config, () -> {}); }
    private JavaCompilerDiagnostics.Result analyze() throws Exception { return JavaCompilerDiagnostics.analyze(snapshot(), UUID.randomUUID().toString(), null, () -> {}); }
    private void settings(List<String> roots, List<String> tests, List<String> cp, List<String> mp) throws Exception {
        var settings = new JavaAnalysisContext.Settings(System.getProperty("java.home"), 21, roots, tests, cp, mp);
        JavaProjectSettings.save(root, config, JavaProjectSettings.revision(config), new Gson().toJsonTree(settings).getAsJsonObject());
    }
    @Test public void rejectsIllegalDuplicatesAndAllowsOverloadShadowingAndSeparateScopes() throws Exception {
        source("A.java", "class A { int x; void run(int n) { int x=1; {int y=1;} {int y=2;} } void run(String n){} }");
        assertTrue(analyze().diagnostics().toString(), analyze().diagnostics().isEmpty());
        source("A.java", "class A { int x; int x; void run(int n){} int run(int n){return 1;} void go(){int n=1; int n=2;} }");
        assertTrue(analyze().diagnostics().size() >= 3);
    }
    @Test public void resolvesTwoFilesButDoesNotLeakHostClasspathOrOtherProjects() throws Exception {
        source("p/A.java", "package p; class A { B value; }"); source("p/B.java", "package p; class B {}");
        assertTrue(analyze().diagnostics().isEmpty());
        source("p/A.java", "package p; class A { org.junit.Test plugin; Missing other; }");
        var result = analyze(); assertEquals(2, result.diagnostics().size());
        assertTrue(result.diagnostics().stream().allMatch(p -> p.file().equals("p/A.java")));
    }
    @Test public void diagnosesInheritanceTypesCallsAndReturnsFromCompilerRules() throws Exception {
        source("A.java", "final class Base {} class A extends Base { int x=\"wrong\"; int run(){ return; } void go(){ missing(1); } }");
        var result = analyze(); assertTrue(result.diagnostics().toString(), result.diagnostics().size() >= 4);
        assertTrue(result.diagnostics().stream().allMatch(p -> p.code().startsWith("compiler.err.")));
    }
    @Test public void declaredBinaryDependencyWorksAndMissingContextIsNotAnUnresolvedSymbol() throws Exception {
        Path classes = temporary.newFolder("dependency").toPath(), java = temporary.getRoot().toPath().resolve("Library.java");
        Files.writeString(java, "package dep; public class Library { public int value(){return 1;} }");
        assertEquals(0, RuntimeJavaCompiler.get().run(null, null, null, "-proc:none", "-d", classes.toString(), java.toString()));
        source("A.java", "class A { dep.Library value; }");
        assertFalse(analyze().diagnostics().isEmpty()); // Real compiler error in an explicitly empty classpath.
        settings(List.of("."), List.of(), List.of(classes.toString()), List.of());
        assertTrue(analyze().diagnostics().isEmpty());
        Path jar = temporary.getRoot().toPath().resolve("library.jar");
        try (var output = new JarOutputStream(Files.newOutputStream(jar))) {
            output.putNextEntry(new JarEntry("dep/Library.class")); output.write(Files.readAllBytes(classes.resolve("dep/Library.class"))); output.closeEntry();
        }
        settings(List.of("."), List.of(), List.of(jar.toString()), List.of()); assertTrue(analyze().diagnostics().isEmpty());
        Path wrapper = temporary.getRoot().toPath().resolve("wrapper.jar"); Manifest manifest = new Manifest();
        manifest.getMainAttributes().putValue("Manifest-Version", "1.0"); manifest.getMainAttributes().putValue("Class-Path", "library.jar");
        try (var output = new JarOutputStream(Files.newOutputStream(wrapper), manifest)) { }
        settings(List.of("."), List.of(), List.of(wrapper.toString(), jar.toString()), List.of()); assertTrue(analyze().diagnostics().isEmpty());
        settings(List.of("."), List.of(), List.of(), List.of(jar.toString())); assertTrue(analyze().diagnostics().isEmpty());
        settings(List.of("."), List.of(), List.of(classes.toString()), List.of());
        var before = snapshot().revision(); Files.write(classes.resolve("dep/Library.class"), new byte[]{1, 2, 3}); assertNotEquals(before, snapshot().revision());
        settings(List.of("."), List.of(), List.of(classes.resolve("missing.jar").toString()), List.of());
        try { snapshot(); fail(); } catch (JavaAnalysisContext.Failure error) { assertEquals("java_context_incomplete", error.code); }
    }
    @Test public void productionCannotResolveTestOnlyTypesButTestsCanResolveProduction() throws Exception {
        source("src/main/java/A.java", "class A {}"); source("src/test/java/Fixture.java", "class Fixture { A a; }");
        settings(List.of("src/main/java"), List.of("src/test/java"), List.of(), List.of()); assertTrue(analyze().diagnostics().isEmpty());
        source("src/main/java/A.java", "class A { Fixture notProduction; }"); assertFalse(analyze().diagnostics().isEmpty());
    }
    @Test public void overlayIsIsolatedAndChangesDiagnosticsInDependentFile() throws Exception {
        source("A.java", "class A { int value(){return 1;} }"); source("B.java", "class B { int b=new A().value(); }");
        var captured = snapshot(); var original = Files.readString(root.resolve("A.java"));
        var proposal = new JavaCompilerDiagnostics.Overlay("A.java", captured.sources().get("A.java").revision(), "class A { String value(){return \"x\";} }");
        var result = JavaCompilerDiagnostics.analyze(captured, UUID.randomUUID().toString(), proposal, () -> {});
        assertTrue(result.diagnostics().stream().anyMatch(p -> p.file().equals("B.java")));
        assertEquals(original, Files.readString(root.resolve("A.java"))); assertEquals(captured.revision(), snapshot().revision());
        assertFalse(Files.exists(root.resolve("A.class")));
        source("B.java", "class B {}"); assertNotEquals(captured.revision(), snapshot().revision());
        try { JavaCompilerDiagnostics.analyze(snapshot(), "id", new JavaCompilerDiagnostics.Overlay("A.java", "0".repeat(64), ""), () -> {}); fail(); }
        catch (JavaAnalysisContext.Failure error) { assertEquals("revision_conflict", error.code); }
    }
    @Test public void utf16CrlfEofAndEmptyProjectsHaveHonestLocations() throws Exception {
        assertTrue(analyze().diagnostics().isEmpty());
        source("A.java", "class A {\r\n String text=\"😀 café\";\r\n int n=\"x\";\r\n}");
        var problem = analyze().diagnostics().getFirst(); assertEquals(3, problem.range().startLine()); assertEquals(8, problem.range().startColumn());
        source("A.java", "class A {"); var eof = analyze().diagnostics().getFirst(); assertEquals(9, eof.range().startOffset());
        assertTrue(Files.list(root).allMatch(path -> path.toString().endsWith(".java")));
    }
    @Test public void ignoresTemporaryMetadataAndRefusesEscapesAndMissingRoots() throws Exception {
        source("A.java", "class A {}"); source("build/Bad.java", "broken"); source(".hidden/Bad.java", "broken"); assertEquals(1, snapshot().sources().size());
        try { settings(List.of("../"), List.of(), List.of(), List.of()); fail(); } catch (IllegalArgumentException expected) { }
        settings(List.of("missing"), List.of(), List.of(), List.of());
        try { snapshot(); fail(); } catch (JavaAnalysisContext.Failure error) { assertEquals("java_context_incomplete", error.code); }
    }
    @Test public void configurationPreservesOtherProjectsSecretsAndDetectsConflicts() throws Exception {
        Files.writeString(config, "{\"version\":1,\"apiToken\":\"preserved\",\"database\":{\"password\":\"preserved\"},\"unknown\":true}");
        String before = JavaProjectSettings.revision(config);
        settings(List.of("."), List.of(), List.of(), List.of());
        var json = JavaAnalysisContext.shared(config); assertEquals("preserved", json.getAsJsonObject("database").get("password").getAsString()); assertTrue(json.get("unknown").getAsBoolean());
        assertFalse(JavaProjectSettings.view(root, config).has("database"));
        try { JavaProjectSettings.save(root, config, before, new Gson().toJsonTree(snapshot().settings()).getAsJsonObject()); fail(); }
        catch (JavaAnalysisContext.Failure error) { assertEquals("java_configuration_conflict", error.code); }
        assertFalse(Files.exists(Path.of(config + ".lock")));
        Files.writeString(Path.of(config + ".lock"), "other writer");
        try { settings(List.of("."), List.of(), List.of(), List.of()); fail(); } catch (JavaAnalysisContext.Failure expected) { }
        assertTrue(Files.exists(Path.of(config + ".lock")));
    }
    @Test public void annotationProcessorAndImplicitJarManifestDependenciesAreNotExecuted() throws Exception {
        Path processor = temporary.newFolder("processor").toPath(), file = temporary.getRoot().toPath().resolve("Danger.java");
        Files.writeString(file, "package dep; public class Danger extends javax.annotation.processing.AbstractProcessor { public boolean process(java.util.Set<? extends javax.lang.model.element.TypeElement> a, javax.annotation.processing.RoundEnvironment b){throw new AssertionError(\"processor executed\");} public java.util.Set<String> getSupportedAnnotationTypes(){return java.util.Set.of(\"*\");} }");
        assertEquals(0, RuntimeJavaCompiler.get().run(null, null, null, "-proc:none", "-d", processor.toString(), file.toString()));
        Path service = processor.resolve("META-INF/services/javax.annotation.processing.Processor"); Files.createDirectories(service.getParent()); Files.writeString(service, "dep.Danger");
        settings(List.of("."), List.of(), List.of(processor.toString()), List.of()); source("A.java", "class A {}"); assertTrue(analyze().diagnostics().isEmpty());
        Path jar = temporary.getRoot().toPath().resolve("implicit.jar"); Manifest manifest = new Manifest(); manifest.getMainAttributes().putValue("Manifest-Version", "1.0"); manifest.getMainAttributes().putValue("Class-Path", "undeclared.jar");
        try (var output = new JarOutputStream(Files.newOutputStream(jar), manifest)) { }
        settings(List.of("."), List.of(), List.of(jar.toString()), List.of());
        try { snapshot(); fail(); } catch (JavaAnalysisContext.Failure error) { assertEquals("java_context_incomplete", error.code); }
    }
    @Test public void unsupportedJdkOrReleaseDoesNotFallbackAndConfigurationCanRecover() throws Exception {
        settings(List.of("."), List.of(), List.of(), List.of());
        var saved = snapshot().settings(); var json = new Gson().toJsonTree(saved).getAsJsonObject(); json.addProperty("release", 99);
        JavaProjectSettings.save(root, config, JavaProjectSettings.revision(config), json);
        try { snapshot(); fail(); } catch (JavaAnalysisContext.Failure error) { assertEquals("java_context_incomplete", error.code); }
        json.addProperty("release", 21); json.addProperty("jdkHome", temporary.newFolder("invalid-jdk").getAbsolutePath());
        JavaProjectSettings.save(root, config, JavaProjectSettings.revision(config), json);
        try { snapshot(); fail(); } catch (JavaAnalysisContext.Failure error) { assertEquals("java_context_incomplete", error.code); }
        settings(List.of("."), List.of(), List.of(), List.of()); assertTrue(analyze().diagnostics().isEmpty());
    }
    @Test public void configuredReleaseChangesTheActualCompilerRulesAndContextRevision() throws Exception {
        source("A.java", "record A(int value) {}");
        var original = snapshot(); assertTrue(analyze().diagnostics().isEmpty());
        var settings = new Gson().toJsonTree(original.settings()).getAsJsonObject(); settings.addProperty("release", 17);
        JavaProjectSettings.save(root, config, JavaProjectSettings.revision(config), settings);
        assertNotEquals(original.revision(), snapshot().revision()); assertTrue(analyze().diagnostics().isEmpty());
        settings.addProperty("release", 11); JavaProjectSettings.save(root, config, JavaProjectSettings.revision(config), settings);
        assertFalse(analyze().diagnostics().isEmpty());
    }
    @Test public void cancellationTimeoutAndLatestRequestNeverApproveOldWork() throws Exception {
        try (var jobs = new JavaAnalysisJobs()) {
            CountDownLatch started = new CountDownLatch(1);
            var old = jobs.submit("project:saved", 2000, check -> { started.countDown(); while (true) { check.run(); Thread.onSpinWait(); } });
            assertTrue(started.await(2, TimeUnit.SECONDS));
            var next = jobs.submit("project:saved", 2000, check -> "current"); assertEquals("current", next.get(2, TimeUnit.SECONDS)); assertTrue(old.isCancelled());
            var timeout = jobs.submit("timeout", 20, check -> { while (true) { check.run(); Thread.onSpinWait(); } });
            try { timeout.get(2, TimeUnit.SECONDS); fail(); } catch (ExecutionException expected) { }
            var cancel = jobs.submit("cancel", 2000, check -> { while (true) check.run(); }); jobs.cancel("cancel"); assertTrue(cancel.isCancelled());
            var current = jobs.submit("matching", "new-id", 2000, check -> { while (true) check.run(); });
            jobs.cancel("matching", "old-id"); assertFalse(current.isCancelled());
            jobs.cancel("matching", "new-id"); assertTrue(current.isCancelled());
        }
    }
}
