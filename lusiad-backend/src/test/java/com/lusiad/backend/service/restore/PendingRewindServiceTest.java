package com.lusiad.backend.service.restore;

import com.lusiad.backend.service.undo.ResourceEdits;
import com.lusiad.backend.service.undo.ResourceImage;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import static org.junit.Assert.*;

public class PendingRewindServiceTest {
  @Rule public TemporaryFolder temporary = new TemporaryFolder();

  @Test public void acceptsOnlyLineEndingDifferencesOutsideRestoredPaths() throws Exception {
    Path live = temporary.newFolder("live").toPath();
    Path preview = temporary.newFolder("preview").toPath();
    Files.createDirectory(live.resolve("src")); // Git has no entry for an empty directory.
    Files.writeString(live.resolve("Untouched.java"), "class Untouched {\r\n}\r\n");
    Files.writeString(preview.resolve("Untouched.java"), "class Untouched {\n}\n");
    Files.writeString(live.resolve("Drop.java"), "class Drop {}\r\n");
    Files.writeString(preview.resolve("Keep.java"), "class Keep {}\n");
    var before = ResourceImage.capture(live.toString(), List.of("Drop.java", "Keep.java"));
    var after = ResourceImage.capture(preview.toString(), List.of("Drop.java", "Keep.java"));
    var baseline = ResourceEdits.projectHashes(live.toString());

    PendingRewindService.verifyPreviewTree(live.toString(), preview.toString(), baseline, before, after);

    Files.writeString(live.resolve("src/Unexpected.java"), "class Unexpected {}");
    try {
      PendingRewindService.verifyPreviewTree(live.toString(), preview.toString(), ResourceEdits.projectHashes(live.toString()), before, after);
      fail("A real file missing from the preview must not be ignored with its directory");
    } catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("paths")); }
    Files.delete(live.resolve("src/Unexpected.java"));

    Files.writeString(preview.resolve("Untouched.java"), "class Different {\n}\n");
    try {
      PendingRewindService.verifyPreviewTree(live.toString(), preview.toString(), baseline, before, after);
      fail("A semantic difference in an untouched file must reject the preview");
    } catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("differs")); }

    Files.writeString(preview.resolve("Untouched.java"), "class Untouched {\n}\n");
    Files.writeString(preview.resolve("Keep.java"), "class Other {}\n");
    try {
      PendingRewindService.verifyPreviewTree(live.toString(), preview.toString(), baseline, before, after);
      fail("A restored file must still match exact bytes");
    } catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("differs")); }
  }
}
