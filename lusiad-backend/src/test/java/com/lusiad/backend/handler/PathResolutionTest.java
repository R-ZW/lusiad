package com.lusiad.backend.handler;

import junit.framework.TestCase;

public class PathResolutionTest extends TestCase {

    private static final BaseHandler.ProjectPaths PROJECT = new BaseHandler.ProjectPaths(
            11,
            "D:/lusiad-examples/project",
            "D:/lusiad-temp/11"
    );

    public void testWritePathAtProjectRootIsStoredAsEmptyRelativePath() throws Exception {
        assertEquals("", BaseHandler.projectRelativePath(PROJECT, "D:/lusiad-examples/project", true));
    }

    public void testSnapshotPathRemainsAvailableForPsiRead() throws Exception {
        assertEquals(
                "D:/lusiad-temp/11/working-copy/Calculator.java",
                BaseHandler.projectReadablePath(
                        PROJECT,
                        "D:/lusiad-temp/11/working-copy/Calculator.java"
                )
        );
    }

    public void testReadRejectsPathOutsideProjectAndSnapshots() {
        try {
            BaseHandler.projectReadablePath(PROJECT, "D:/other-project/Calculator.java");
            fail("An external path must be rejected");
        } catch (BaseHandler.HandlerException expected) {
            assertEquals(400, expected.status);
        }
    }

    public void testPreviewAuthorizationDoesNotAuthorizeAWriteOrArbitraryTempRead() throws Exception {
        var target = BaseHandler.projectReadTarget(PROJECT, "D:/lusiad-temp/11/working-copy/Foo.java");
        assertEquals("D:/lusiad-temp/11/working-copy", target.root().replace('\\', '/'));
        assertEquals("Foo.java", target.relative());
        for (String path : new String[]{"D:/lusiad-temp/11/working-copy/Foo.java", "../other/Foo.java",
                "D:/lusiad-examples/project-other/Foo.java", "D:relative.java"}) {
            try { BaseHandler.projectRelativePath(PROJECT, path, false); fail("write escape accepted"); }
            catch (BaseHandler.HandlerException expected) { assertEquals(400, expected.status); }
        }
        try {
            BaseHandler.projectReadablePath(PROJECT, "D:/lusiad-temp/11/archive/Foo.java");
            fail("archive must not be exposed as a preview");
        } catch (BaseHandler.HandlerException expected) { assertEquals(400, expected.status); }
    }
}
