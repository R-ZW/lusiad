package com.lusiad.backend.config;

import com.google.gson.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import java.nio.file.*;
import static org.junit.Assert.*;

/** Disposable files only; the author runs these regressions. */
public class SharedConfigurationTest {
    @Rule public TemporaryFolder temporary=new TemporaryFolder();
    @Test public void preservesUnrelatedSettingsAndRejectsAnOldRevision()throws Exception{
        Path file=temporary.newFolder().toPath().resolve("config.json");
        Files.writeString(file,"{\"version\":1,\"apiToken\":\"internal\",\"javaProjects\":{\"a\":{}},\"database\":{\"name\":\"fixture\"}}");
        String old=SharedConfiguration.revision(file);
        SharedConfiguration.update(file,old,root->{var ui=new JsonObject();ui.addProperty("language","en");root.add("ui",ui);});
        var saved=SharedConfiguration.read(file);assertEquals("internal",saved.get("apiToken").getAsString());assertTrue(saved.getAsJsonObject("javaProjects").has("a"));assertEquals("fixture",saved.getAsJsonObject("database").get("name").getAsString());
        String bytes=Files.readString(file);
        try{SharedConfiguration.update(file,old,root->root.addProperty("frontendUrl","http://localhost:9999"));fail();}catch(java.io.IOException expected){}
        assertEquals(bytes,Files.readString(file));assertFalse(Files.exists(Path.of(file+".lock")));
    }
    @Test public void neverDeletesAnotherWriterLockAndReleasesItsOwnAfterFailure()throws Exception{
        Path file=temporary.newFolder().toPath().resolve("config.json"),lock=Path.of(file+".lock");Files.writeString(lock,"owner");
        try{SharedConfiguration.update(file,null,root->{});fail();}catch(FileAlreadyExistsException expected){}
        assertEquals("owner",Files.readString(lock));Files.delete(lock);
        try{SharedConfiguration.update(file,null,root->{throw new IllegalArgumentException("injected");});fail();}catch(IllegalArgumentException expected){}
        assertFalse(Files.exists(file));assertFalse(Files.exists(lock));
    }
    @Test public void preferencesRejectForeignOptionsAndMalformedColors(){
        SharedConfiguration.validateUi(JsonParser.parseString("{\"theme\":\"dark\",\"language\":\"pt-BR\"}").getAsJsonObject());
        for(String body:new String[]{"{\"apiToken\":\"value\"}","{\"theme\":[]}","{\"palette\":{\"version\":1,\"preset\":\"custom\",\"custom\":{\"types\":\"not-a-color\"}}}"}){
            try{SharedConfiguration.validateUi(JsonParser.parseString(body).getAsJsonObject());fail(body);}catch(RuntimeException expected){}
        }
    }
}
