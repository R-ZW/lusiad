package com.lusiad.backend.service.fs;

import com.lusiad.backend.handler.ApiJson;
import org.junit.Test;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.junit.Assert.*;

/** No desktop launch: the author verifies native Explorer visually. */
public class NativeFileExplorerTest {
    @Test public void javaCreationBoundary() {
        assertTrue(ApiJson.javaFileName("Main.java"));
        for (String name : new String[]{"README.md", ".java", "Main.java.txt", "../Main.java"}) {
            assertFalse(ApiJson.javaFileName(name));
            try { ApiJson.request("/fs/file/create", "{\"projectId\":1,\"path\":\"\",\"name\":\"" + name + "\"}"); fail(); }
            catch (IllegalArgumentException expected) { /* No filesystem/SQL write. */ }
        }
        String body = "{\"projectId\":1,\"path\":\"README.md\",\"expectedHash\":\"" + "0".repeat(64) + "\",\"startOffset\":0,\"endOffset\":1,\"newContent\":\"x\"}";
        ApiJson.request("/psi/update", body.replace("README.md", "Main.java"));
        try { ApiJson.request("/psi/update", body); fail(); }
        catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("Non-Java")); }
    }
    @Test public void targetIsContainedAndRootMayBeOpened() throws Exception {
        Path parent = Files.createTempDirectory("lusiad-native-"), root = Files.createDirectory(parent.resolve("project")), temp = Files.createDirectory(parent.resolve("temp"));
        Path file = Files.writeString(root.resolve("README.md"), "Árvore\r\n");
        try {
            assertEquals(file, NativeFileExplorer.target(root.toString(), temp.toString(), file.toString()));
            assertEquals(root, NativeFileExplorer.target(root.toString(), temp.toString(), root.toString()));
            try { NativeFileExplorer.target(root.toString(), temp.toString(), parent.toString()); fail(); }
            catch (IllegalArgumentException expected) { }
            assertEquals("Árvore\r\n", Files.readString(file));
        } finally { Files.deleteIfExists(file); Files.deleteIfExists(root); Files.deleteIfExists(temp); Files.deleteIfExists(parent); }
    }
}
