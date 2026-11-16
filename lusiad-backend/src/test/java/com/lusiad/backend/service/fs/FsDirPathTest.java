package com.lusiad.backend.service.fs;

import junit.framework.TestCase;

public class FsDirPathTest extends TestCase {

    public void testProjectRootRelativizesToEmptyPath() {
        assertEquals("", FsDirService.relativize(
                "D:/lusiad-examples/project", "D:/lusiad-examples/project"));
    }

    public void testNestedWindowsPathRelativizesIndependentlyOfCase() {
        assertEquals("src/Main.java", FsDirService.relativize(
                "D:/User/Projects/Example", "d:/user/projects/example/src/Main.java"));
    }

    public void testDetectsRootAndChildPathsOnly() {
        assertTrue(FsDirService.isWithinBase("D:/lusiad-examples/project", "D:/lusiad-examples/project"));
        assertTrue(FsDirService.isWithinBase("D:/lusiad-examples/project", "D:/lusiad-examples/project/src"));
        assertFalse(FsDirService.isWithinBase("D:/lusiad-examples/project", "D:/lusiad-examples/project-other"));
    }
}
