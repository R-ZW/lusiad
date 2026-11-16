package com.lusiad.backend.service.fs;

import junit.framework.TestCase;
import java.nio.file.Files;

public class NativeDirectoryPickerTest extends TestCase {
    public void testSelectionOnlyReturnsAnExistingRealDirectoryWithoutTouchingContents() throws Exception {
        var root = Files.createTempDirectory("lusiad-picker-");
        var file = root.resolve("Conteúdo Ω.java");
        try {
            Files.writeString(file, "class Example {}\r\n");
            assertEquals(root.toRealPath().toString(), NativeDirectoryPicker.selectedDirectory(root));
            assertEquals("class Example {}\r\n", Files.readString(file));
            for (var invalid : new java.nio.file.Path[]{file, root.resolve("missing")}) {
                try { NativeDirectoryPicker.selectedDirectory(invalid); fail("Must reject files/missing folders"); }
                catch (java.io.IOException expected) { }
            }
        } finally { Files.deleteIfExists(file); Files.deleteIfExists(root); }
    }
}
