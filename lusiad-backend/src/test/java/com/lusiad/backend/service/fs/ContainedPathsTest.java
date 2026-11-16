package com.lusiad.backend.service.fs;

import junit.framework.TestCase;
import java.nio.file.*;
import java.util.HashMap;
import java.util.Map;

public class ContainedPathsTest extends TestCase {
    private Path fixture, project, temp, outside;

    @Override protected void setUp() throws Exception {
        fixture = Files.createTempDirectory("lusiad-paths-");
        project = Files.createDirectory(fixture.resolve("project"));
        temp = Files.createDirectory(fixture.resolve("previews"));
        outside = Files.writeString(fixture.resolve("outside.java"), "untouched");
    }

    @Override protected void tearDown() throws Exception {
        // Walk never follows symbolic links or junctions.
        try (var paths = Files.walk(fixture)) {
            for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) Files.delete(path);
        }
    }

    private void rejected(Runnable operation) {
        try { operation.run(); fail("Unsafe path was accepted"); }
        catch (IllegalArgumentException expected) { assertNotNull(expected.getMessage()); }
    }

    public void testRootRelativeLegacyWindowsAndMalformedPaths() throws Exception {
        String root = project.toString();
        assertEquals("", ContainedPaths.relative(root, root, true));
        assertEquals("src/Árvore.java", ContainedPaths.relative(root, root + "/src/Árvore.java", false));
        assertEquals("src/Árvore.java", ContainedPaths.relative(root, "./src\\Árvore.java", false));
        if (System.getProperty("os.name").startsWith("Windows")) {
            assertEquals("src/X.java", ContainedPaths.relative(root.toUpperCase(), root.toLowerCase() + "/src/X.java", false));
            assertEquals("src/X.java", ContainedPaths.relative("D:/", "d:/src/X.java", false));
        }
        for (String value : new String[]{"../outside.java", "src/../../outside.java", root + "-other/X.java",
                outside.toString(), "C:relative.java", "//?/C:/Windows/x", "src/X.java:stream", "src/../X.java",
                "NUL.java", "src./X.java", "x /X.java", "x\0.java"}) {
            rejected(() -> ContainedPaths.resolve(root, value, false));
            rejected(() -> FsDirService.resolve(root, value));
        }
        rejected(() -> ContainedPaths.resolve(root, "", false));
        assertEquals("untouched", Files.readString(outside));
    }

    public void testHistoricalAbsoluteFieldsAreRemappedWithoutTouchingLiveFiles() throws Exception {
        var request = new HashMap<>(Map.of("path", project.toString(), "sourcePath", project + "/src/X.java", "destPath", "dst"));
        ContainedPaths.legacy(request, project.toString());
        assertEquals("", request.get("path"));
        assertEquals("src/X.java", request.get("sourcePath"));
        assertEquals("dst", request.get("destPath"));
        rejected(() -> ContainedPaths.legacy(new HashMap<>(Map.of("path", outside.toString())), project.toString()));
        rejected(() -> ContainedPaths.legacy(new HashMap<>(Map.of("path", "", "name", "../outside.java")), project.toString()));
        assertEquals("untouched", Files.readString(outside));
    }

    public void testReadOnlyPreviewScopesAndSeparateRoots() throws Exception {
        String live = project.toString(), snapshots = temp.toString();
        for (String folder : new String[]{"working-copy", "working-copy-prev", "comparisons/compare-12345678-1234-1234-1234-123456789abc/working-copy"}) {
            Path file = temp.resolve(folder).resolve("src/X.java");
            Files.createDirectories(file.getParent()); Files.writeString(file, "class X {}");
            assertEquals(file, Path.of(ContainedPaths.readable(live, snapshots, file.toString()).absolute()));
            rejected(() -> ContainedPaths.resolve(live, file.toString(), false));
        }
        for (String value : new String[]{"archive/X.java", "settings.json", "comparisons/random/working-copy/X.java", "working-copy/../../outside.java"})
            rejected(() -> ContainedPaths.readable(live, snapshots, temp + "/" + value));
        rejected(() -> ContainedPaths.separate(live, live));
        rejected(() -> ContainedPaths.separate(live, project + "/previews"));
        rejected(() -> ContainedPaths.separate(live, fixture.toString()));
    }

    private void junction(Path link, Path target) throws Exception {
        if (System.getProperty("os.name").startsWith("Windows")) {
            Process process = new ProcessBuilder("cmd", "/c", "mklink", "/J", link.toString(), target.toString()).redirectErrorStream(true).start();
            String output = new String(process.getInputStream().readAllBytes());
            assertEquals(output, 0, process.waitFor());
        } else Files.createSymbolicLink(link, target);
    }

    public void testJunctionsInChildrenRefusedButRegisteredRootAliasWorks() throws Exception {
        Path target = Files.createDirectory(fixture.resolve("elsewhere"));
        Files.writeString(target.resolve("X.java"), "untouched");
        Path link = project.resolve("redirect"); junction(link, target);
        rejected(() -> ContainedPaths.resolve(project.toString(), "redirect/X.java", false));
        rejected(() -> ContainedPaths.resolve(project.toString(), "redirect/new/X.java", false));
        rejected(() -> ContainedPaths.tree(project.toString()));
        Path alias = fixture.resolve("registered-alias"); junction(alias, target);
        assertEquals(alias.resolve("X.java"), Path.of(ContainedPaths.resolve(alias.toString(), "X.java", false)));
        rejected(() -> ContainedPaths.separate(alias.toString(), target.toString()));
        Path snapshotLink = temp.resolve("working-copy"); junction(snapshotLink, target);
        rejected(() -> ContainedPaths.readable(project.toString(), temp.toString(), snapshotLink + "/X.java"));
        assertEquals("untouched", Files.readString(target.resolve("X.java")));
        // Remove the junctions themselves, never their targets.
        Files.delete(link); Files.delete(alias); Files.delete(snapshotLink);
    }
}
