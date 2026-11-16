package com.lusiad.backend.service.restore;

import com.google.gson.Gson;
import com.lusiad.backend.repository.restore.RestoreRepository.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import junit.framework.TestCase;

public class HistoricalReplayTest extends TestCase {
  private Path lab;

  @Override
  protected void setUp() throws Exception {
    lab = Files.createTempDirectory("lusiad-replay-");
  }

  @Override
  protected void tearDown() throws Exception {
    try (var stream = Files.walk(lab)) {
      for (var file : stream.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(file);
    }
  }

  private Path snapshot(String name, String text) throws Exception {
    Path root = Files.createDirectory(lab.resolve(name));
    Files.createDirectory(root.resolve("archive"));
    Files.writeString(root.resolve("archive/Demo.java"), text);
    return root;
  }

  private String hash(String text) throws Exception {
    return HexFormat.of()
        .formatHex(
            MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
  }

  private ChangeRow edit(int id, String before, String after) throws Exception {
    return new ChangeRow(
        id,
        "update",
        "file",
        new Gson()
            .toJson(
                Map.of(
                    "path",
                    "Demo.java",
                    "recordVersion",
                    2,
                    "beforeText",
                    before,
                    "afterText",
                    after,
                    "beforeHash",
                    hash(before),
                    "afterHash",
                    hash(after))));
  }

  private HistoricalReplay.Legacy noLegacy =
      (row, body) -> {
        throw new AssertionError("v2 must not use PSI/VFS or SQL");
      };

  public void testExactBeforeAfterAcrossSequenceWithUnicodeAndRepeatedContent() throws Exception {
    String a = "class Demo { String s=\"Ω😀\"; void f(){call();call();} }\n",
        b = a.replace("Ω😀", "edited"),
        c = b.replace("call();call();", "call();other();");
    Path project = Files.createDirectory(lab.resolve("live"));
    Files.writeString(project.resolve("Demo.java"), "live unsaved owner");
    Path root = snapshot("request", a.replace("\n", "\r\n"));
    HistoricalReplay.run(
        root.toString(),
        project.toString(),
        List.of(edit(1, a, b), edit(2, b, c), new ChangeRow(3, "bad", "file", "{}")),
        2,
        Map.of(),
        noLegacy);
    assertEquals(b, Files.readString(root.resolve("working-copy-prev/Demo.java")));
    assertEquals(c, Files.readString(root.resolve("working-copy/Demo.java")));
    assertEquals("live unsaved owner", Files.readString(project.resolve("Demo.java")));
  }

  public void testFailureStopsBeforeTargetAndNeverCreatesAReadyMarker() throws Exception {
    Path root = snapshot("failed", "before");
    try {
      HistoricalReplay.run(
          root.toString(),
          lab.resolve("live").toString(),
          List.of(edit(1, "wrong", "bad"), edit(2, "bad", "target")),
          2,
          Map.of(),
          noLegacy);
      fail();
    } catch (IllegalArgumentException expected) {
      assertTrue(expected.getMessage().contains("#1"));
    }
    assertEquals("before", Files.readString(root.resolve("working-copy/Demo.java")));
    assertFalse(Files.exists(root.resolve("working-copy-prev")));
    assertFalse(Files.exists(root.resolve(".lusiad-preview.json")));
  }

  public void testConcurrentRequestsHaveIndependentTreesAndFailures() throws Exception {
    Path a = snapshot("a", "same"), b = snapshot("b", "same");
    var barrier = new CyclicBarrier(2);
    var executor = Executors.newFixedThreadPool(2);
    try {
      var first =
          executor.submit(
              () -> {
                barrier.await();
                HistoricalReplay.run(
                    a.toString(),
                    lab.resolve("live").toString(),
                    List.of(edit(1, "same", "A")),
                    1,
                    Map.of(),
                    noLegacy);
                return Files.readString(a.resolve("working-copy/Demo.java"));
              });
      var second =
          executor.submit(
              () -> {
                barrier.await();
                try {
                  HistoricalReplay.run(
                      b.toString(),
                      lab.resolve("live").toString(),
                      List.of(edit(1, "wrong", "B")),
                      1,
                      Map.of(),
                      noLegacy);
                  return "unexpected";
                } catch (IllegalArgumentException expected) {
                  return Files.readString(b.resolve("working-copy/Demo.java"));
                }
              });
      assertEquals("A", first.get(10, TimeUnit.SECONDS));
      assertEquals("same", second.get(10, TimeUnit.SECONDS));
    } finally {
      executor.shutdownNow();
    }
  }

  public void testBundlePreimagesBinaryAndDirectoryReplacementAreValidatedBeforeWrites()
      throws Exception {
    Path root = snapshot("bundle", "class Demo {}\n");
    Files.createDirectory(root.resolve("archive/folder"));
    Files.write(root.resolve("archive/folder/binary"), new byte[] {0, -1, 13, 10});
    var entries =
        List.of(
            new HistoricalBundleFile(
                "Demo.java",
                "file",
                "class Demo {}\r\n".getBytes(StandardCharsets.UTF_8),
                "file",
                "class Demo { int n; }\r\n".getBytes(StandardCharsets.UTF_8)),
            new HistoricalBundleFile(
                "folder/binary", "file", new byte[] {0, -1, 13, 10}, null, null),
            new HistoricalBundleFile("folder", "directory", null, "file", new byte[] {1, 2, 3}));
    HistoricalReplay.run(
        root.toString(),
        lab.resolve("live").toString(),
        List.of(new ChangeRow(1, "external_bundle", "project", "{}")),
        1,
        Map.of(1, entries),
        noLegacy);
    assertTrue(Files.isDirectory(root.resolve("working-copy-prev/folder")));
    assertTrue(
        Arrays.equals(
            new byte[] {1, 2, 3}, Files.readAllBytes(root.resolve("working-copy/folder"))));
    String previous = Files.readString(root.resolve("working-copy/Demo.java"));
    try {
      HistoricalReplay.applyBundle(
          root.resolve("working-copy").toString(),
          List.of(
              new HistoricalBundleFile(
                  "Demo.java", "file", new byte[] {9}, "file", new byte[] {8})));
      fail();
    } catch (IllegalArgumentException expected) {
      assertNotNull(expected.getMessage());
    }
    assertEquals(previous, Files.readString(root.resolve("working-copy/Demo.java")));
  }

  public void testLegacyFailureAndEscapedPathsAreNeverAccepted() throws Exception {
    Path root = snapshot("legacy", "before");
    try {
      HistoricalReplay.run(
          root.toString(),
          lab.resolve("live").toString(),
          List.of(new ChangeRow(1, "update", "file", "{\"path\":\"Demo.java\"}")),
          1,
          Map.of(),
          (row, body) -> "{\"error\":\"rejected\"}");
      fail();
    } catch (IllegalArgumentException expected) {
      assertTrue(expected.getMessage().contains("legacy replay rejected"));
    }
    try {
      HistoricalReplay.applyEdit(
          root.resolve("working-copy").toString(),
          Map.of(
              "path",
              "../escape",
              "beforeText",
              "before",
              "afterText",
              "after",
              "beforeHash",
              hash("before"),
              "afterHash",
              hash("after")));
      fail();
    } catch (IllegalArgumentException expected) {
      assertNotNull(expected.getMessage());
    }
  }

  public void testStructuralReplayUsesRootNamesAndOwnDestinationWithoutIdeWrites()
      throws Exception {
    Path root = snapshot("structural", "unchanged");
    var rows =
        List.of(
            new ChangeRow(1, "dir_create", "project", "{\"path\":\"\",\"name\":\"pkg\"}"),
            new ChangeRow(
                2, "file_create", "dir", "{\"path\":\"\",\"name\":\"Root.java\",\"content\":null}"),
            new ChangeRow(
                3, "file_rename", "dir", "{\"path\":\"Root.java\",\"name\":\"Foo.java\"}"),
            new ChangeRow(
                4, "file_move", "dir", "{\"sourcePath\":\"Foo.java\",\"destPath\":\"pkg\"}"),
            new ChangeRow(
                5, "file_move", "dir", "{\"sourcePath\":\"pkg/Foo.java\",\"destPath\":\"pkg\"}"),
            new ChangeRow(6, "file_delete", "dir", "{\"path\":\"pkg/Foo.java\"}"),
            new ChangeRow(7, "dir_delete", "project", "{\"path\":\"pkg\"}"));
    HistoricalReplay.run(
        root.toString(), lab.resolve("live").toString(), rows, 7, Map.of(), noLegacy);
    assertTrue(Files.isDirectory(root.resolve("working-copy-prev/pkg")));
    assertFalse(Files.exists(root.resolve("working-copy/pkg")));
    assertEquals("unchanged", Files.readString(root.resolve("working-copy/Demo.java")));
  }
}
