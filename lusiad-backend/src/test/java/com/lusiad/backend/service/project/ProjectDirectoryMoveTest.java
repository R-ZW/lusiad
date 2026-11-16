package com.lusiad.backend.service.project;

import junit.framework.TestCase;
import java.nio.file.*;

public class ProjectDirectoryMoveTest extends TestCase {
    public void testWholeTreeMovesAndUnpublishedMoveCanBeRecoveredWithoutFormattingOrGitChanges() throws Exception {
        Path fixture=Files.createTempDirectory("lusiad-project-move-");
        try {
            Path source=Files.createDirectory(fixture.resolve("Árvore Ω")), parent=Files.createDirectory(fixture.resolve("destination"));
            Files.createDirectory(source.resolve(".git")); Files.writeString(source.resolve(".git/HEAD"),"ref: refs/heads/main\n");
            Files.writeString(source.resolve("A.java"),"class A {}\r\n"); Files.writeString(source.resolve("ignored.bin"),"preserve");
            String revision=ProjectFiles.inspect(source).revision();
            Path target=ProjectDirectoryMove.destination(source,parent);
            assertFalse(Files.exists(target)); // Preview has no filesystem effect.
            ProjectDirectoryMove.apply(source,target,revision);
            assertFalse(Files.exists(source)); assertEquals(revision,ProjectFiles.inspect(target).revision());
            assertEquals("ref: refs/heads/main\n",Files.readString(target.resolve(".git/HEAD")));
            ProjectDirectoryMove.rollback(source,target,revision); ProjectDirectoryMove.rollback(source,target,revision);
            assertEquals(revision,ProjectFiles.inspect(source).revision()); assertFalse(Files.exists(target));
        } finally { clean(fixture); }
    }

    public void testCollisionsStaleContentAndAmbiguousRecoveryNeverOverwriteAnything() throws Exception {
        Path fixture=Files.createTempDirectory("lusiad-project-move-conflict-");
        try {
            Path source=Files.createDirectory(fixture.resolve("project")), parent=Files.createDirectory(fixture.resolve("destination"));
            Files.writeString(source.resolve("A.java"),"class A {}");
            String revision=ProjectFiles.inspect(source).revision(); Path target=parent.resolve("project");
            Files.createDirectory(target); Files.writeString(target.resolve("keep.txt"),"foreign");
            try { ProjectDirectoryMove.apply(source,target,revision); fail("Collision accepted"); }
            catch(ProjectManagementService.Failure expected) { assertEquals("project_move_destination_exists",expected.code); }
            assertEquals("foreign",Files.readString(target.resolve("keep.txt")));
            Files.delete(target.resolve("keep.txt")); Files.delete(target);
            Files.writeString(source.resolve("A.java"),"class Changed {}");
            try { ProjectDirectoryMove.apply(source,target,revision); fail("Stale content moved"); }
            catch(ProjectManagementService.Failure expected) { assertEquals("project_recovery_required",expected.code); }
            assertFalse(Files.exists(target)); assertTrue(Files.exists(source));
            revision=ProjectFiles.inspect(source).revision(); ProjectDirectoryMove.apply(source,target,revision);
            Files.createDirectory(source); Files.writeString(source.resolve("new.txt"),"new source");
            try { ProjectDirectoryMove.rollback(source,target,revision); fail("Recreated source overwritten"); }
            catch(ProjectManagementService.Failure expected) { assertEquals("project_recovery_required",expected.code); }
            assertEquals("new source",Files.readString(source.resolve("new.txt"))); assertTrue(Files.exists(target.resolve("A.java")));
        } finally { clean(fixture); }
    }

    public void testMoveRequestRequiresAnExplicitDestinationAndConfirmation() {
        var fields=new com.google.gson.JsonObject(); fields.addProperty("projectId",1); fields.addProperty("adminAction","move");
        try { com.lusiad.backend.handler.ApiJson.request("/projects/preview",fields.toString()); fail("Missing destination accepted"); }
        catch(IllegalArgumentException expected) { }
        fields.addProperty("newPath","D:/destination");
        assertEquals("move",com.lusiad.backend.handler.ApiJson.request("/projects/preview",fields.toString()).get("adminAction"));
        try { com.lusiad.backend.handler.ApiJson.request("/projects/apply",fields.toString()); fail("Missing confirmation accepted"); }
        catch(IllegalArgumentException expected) { }
    }

    public void testJavaContextCanBePreparedBeforeTheDestinationExists() throws Exception {
        Path fixture=Files.createTempDirectory("lusiad-move-settings-");
        try {
            Path source=Files.createDirectory(fixture.resolve("Project")),target=fixture.resolve("future/Project");
            Files.createDirectory(target.getParent()); Path file=fixture.resolve("settings.json");
            var settings=new com.google.gson.JsonObject();var contexts=new com.google.gson.JsonObject();var context=new com.google.gson.JsonObject();
            var roots=new com.google.gson.JsonArray();roots.add(source.resolve("src").toString());context.add("sourceRoots",roots);
            contexts.add(ProjectFiles.key(source),context);settings.add("javaProjects",contexts);Files.writeString(file,settings.toString());
            var delta=ProjectJavaSettings.capture(source,target,file);
            assertFalse(Files.exists(target));assertEquals(settings,com.google.gson.JsonParser.parseString(Files.readString(file)));
            assertEquals(target.resolve("src").toString(),delta.getAsJsonObject("after").getAsJsonArray("sourceRoots").get(0).getAsString());
        } finally { clean(fixture); }
    }

    private static void clean(Path fixture) throws Exception {
        try(var paths=Files.walk(fixture)) { for(Path path:paths.sorted(java.util.Comparator.reverseOrder()).toList()) Files.delete(path); }
    }
}
