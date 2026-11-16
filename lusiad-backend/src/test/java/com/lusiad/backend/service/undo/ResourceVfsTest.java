package com.lusiad.backend.service.undo;

import com.google.gson.JsonParser;
import com.intellij.testFramework.fixtures.BasePlatformTestCase;
import com.lusiad.backend.service.psi.PsiService;
import java.nio.file.*;
import java.util.Map;

/** Real VFS/Document lifecycle on disposable files; not native UI or SQL E2E. */
public class ResourceVfsTest extends BasePlatformTestCase {
    public void testRenameOfCachedJavaDocumentPreservesTheActualResources() throws Exception {
        Path root=Files.createTempDirectory("lusiad-resource-vfs-");
        try {
            byte[] bytes="class Demo {\r\n void run() {}\r\n}\r\n".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            Files.write(root.resolve("Demo.java"),bytes);
            assertFalse(JsonParser.parseString(PsiService.readJavaPsiStructure(getProject(),root.toString(),"Demo.java")).getAsJsonObject().has("error"));
            var plan=ResourceEdits.filesystemPlan(root.toString(),"file_rename",Map.of("path","Demo.java","name","Renamed.java"));
            ResourceEdits.apply(getProject(),root.toString(),plan);
            ResourceImage.decode(plan.after()).requireCurrent(root.toString());
            assertFalse(Files.exists(root.resolve("Demo.java"))); assertTrue(java.util.Arrays.equals(bytes,Files.readAllBytes(root.resolve("Renamed.java"))));
            assertFalse(JsonParser.parseString(PsiService.readJavaPsiStructure(getProject(),root.toString(),"Renamed.java")).getAsJsonObject().has("error"));
        } finally { try(var files=Files.walk(root)){ for(Path path:files.sorted(java.util.Comparator.reverseOrder()).toList()) Files.delete(path); } }
    }
}
