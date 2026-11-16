package com.lusiad.backend.service.project;

import com.lusiad.backend.handler.ApiJson;
import junit.framework.TestCase;
import java.nio.file.*;
import java.util.UUID;

/** Focused contracts and disposable disk fixtures; never the author's project or database. */
public class ProjectManagementTest extends TestCase {
    public void testActivityDoesNotLockOtherProjectsAndCloseIsIdempotent() {
        var reading=ProjectActivity.enter(701);
        try {
            try(var other=ProjectActivity.administer(702)) { assertNotNull(other); }
            try { ProjectActivity.administer(701);fail("Active project accepted deletion"); }
            catch(ProjectManagementService.Failure expected){assertEquals("project_busy",expected.code);}
        }finally{reading.close();reading.close();}
        try(var administration=ProjectActivity.administer(701)) {
            try {ProjectActivity.enter(701);fail("New analysis crossed administration");}
            catch(ProjectManagementService.Failure expected){assertEquals("project_busy",expected.code);}
        }
        try(var resumed=ProjectActivity.enter(701)){assertNotNull(resumed);}
    }
    public void testRegistryRequestHasTypedFieldsAndExplicitConfirmation() {
        String revision="a".repeat(64),id=UUID.randomUUID().toString();
        assertEquals("delete",ApiJson.request("/projects/apply","{\"projectId\":1,\"adminAction\":\"delete\",\"confirmation\":\"Árvore\",\"registryRevision\":\""+revision+"\",\"requestId\":\""+id+"\"}").get("adminAction"));
        for(String body:new String[]{"{}","{\"projectId\":1,\"adminAction\":\"delete\"}","{\"projectId\":1,\"adminAction\":true}"}) {
            try{ApiJson.request("/projects/apply",body);fail("Incomplete destructive request accepted");}catch(IllegalArgumentException expected){assertNotNull(expected.getMessage());}
        }
        assertTrue(ApiJson.request("/projects/operations","{}").isEmpty());
    }
    public void testDeletionStagesExactTreeAndRejectsAnotherTarget() throws Exception {
        Path base=Files.createTempDirectory("lusiad-management-"),root=Files.createDirectory(base.resolve("owned"));
        Path neighbor=Files.writeString(base.resolve("unrelated.txt"),"keep");String id=UUID.randomUUID().toString();
        try {
            Files.createDirectory(root.resolve(".git"));Files.writeString(root.resolve(".git/HEAD"),"ref: refs/heads/main\n");
            Files.writeString(root.resolve("Árvore.java"),"class Árvore {}\r\n");
            String before=ProjectFiles.inspect(root).revision();
            Path staged=ProjectFiles.trash(root,id);Files.move(root,staged,StandardCopyOption.ATOMIC_MOVE);
            assertEquals(before,ProjectFiles.inspect(staged).revision());
            try{ProjectFiles.purge(root,base,id);fail("Wrong purge target accepted");}
            catch(ProjectManagementService.Failure expected){assertEquals("project_protected_path",expected.code);}
            ProjectFiles.purge(root,staged,id);ProjectFiles.purge(root,staged,id);
            assertFalse(Files.exists(staged));assertEquals("keep",Files.readString(neighbor));
        }finally{try(var paths=Files.walk(base)){for(var path:paths.sorted(java.util.Comparator.reverseOrder()).toList())Files.delete(path);}}
    }
    public void testContextRelinkAndRollbackPreserveUnrelatedSettingsAndReleaseOwnLock() throws Exception {
        Path fixture=Files.createTempDirectory("lusiad-project-context-");
        try {
            Path before=Files.createDirectory(fixture.resolve("Before")),after=Files.createDirectory(fixture.resolve("After")),file=fixture.resolve("settings.json");
            var shared=new com.google.gson.JsonObject();shared.addProperty("version",1);shared.addProperty("unrelated","preserve");
            var contexts=new com.google.gson.JsonObject();var context=new com.google.gson.JsonObject();
            var sources=new com.google.gson.JsonArray();sources.add(before.resolve("Src").toString());context.add("sourceRoots",sources);
            var jars=new com.google.gson.JsonArray();jars.add(fixture.resolve("External.jar").toString());jars.add(before.resolve("Lib/Dependency.jar").toString());context.add("classpath",jars);
            contexts.add(ProjectFiles.key(before.toRealPath()),context);shared.add("javaProjects",contexts);Files.writeString(file,shared.toString());
            var delta=ProjectJavaSettings.capture(before,after,file);
            ProjectJavaSettings.apply(delta,true,file);ProjectJavaSettings.apply(delta,true,file);
            var moved=com.google.gson.JsonParser.parseString(Files.readString(file)).getAsJsonObject();
            assertEquals("preserve",moved.get("unrelated").getAsString());
            var value=moved.getAsJsonObject("javaProjects").getAsJsonObject(ProjectFiles.key(after.toRealPath()));
            assertEquals(after.resolve("Src").toString(),value.getAsJsonArray("sourceRoots").get(0).getAsString());
            assertEquals(fixture.resolve("External.jar").toString(),value.getAsJsonArray("classpath").get(0).getAsString());
            assertEquals(after.resolve("Lib/Dependency.jar").toString(),value.getAsJsonArray("classpath").get(1).getAsString());
            ProjectJavaSettings.apply(delta,false,file);ProjectJavaSettings.apply(delta,false,file);
            assertEquals(shared,com.google.gson.JsonParser.parseString(Files.readString(file)));
            Path lock=Path.of(file+".lock");Files.writeString(lock,"another writer");
            try{ProjectJavaSettings.apply(delta,true,file);fail("Foreign lock was ignored");}catch(ProjectManagementService.Failure expected){assertEquals("project_busy",expected.code);}
            assertEquals("another writer",Files.readString(lock));
        }finally{try(var paths=Files.walk(fixture)){for(var path:paths.sorted(java.util.Comparator.reverseOrder()).toList())Files.delete(path);}}
    }
}
