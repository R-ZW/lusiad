package com.lusiad.backend.service.restore;

import com.google.gson.JsonParser;
import com.lusiad.backend.repository.restore.RestoreRepository.ChangeRow;
import com.lusiad.backend.repository.restore.RestoreRepository.HistoricalBundleFile;
import com.lusiad.backend.service.fs.ContainedPaths;
import com.lusiad.backend.service.fs.SnapshotFiles;
import com.lusiad.backend.util.JsonUtil;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

/** Pure snapshot I/O for exact v2/structural/bundle events. Legacy PSI is an explicit adapter. */
public final class HistoricalReplay {
  private HistoricalReplay() {}

  @FunctionalInterface
  public interface Legacy {
    String apply(ChangeRow row, Map<String, String> body) throws Exception;
  }

  public static void run(
      String temp,
      String project,
      List<ChangeRow> rows,
      int target,
      Map<Integer, List<HistoricalBundleFile>> bundles,
      Legacy legacy)
      throws Exception {
    String working = ContainedPaths.resolve(temp, "working-copy", false);
    SnapshotFiles.reset(temp, ContainedPaths.resolve(temp, "archive", false), working);
    boolean found = false;
    for (ChangeRow row : rows) {
      if (row.id > target) break;
      Map<String, String> body = JsonUtil.parseSimpleJson(row.reqBody);
      ContainedPaths.legacy(body, project);
      if (row.id == target)
        SnapshotFiles.reset(
            temp, working, ContainedPaths.resolve(temp, "working-copy-prev", false));
      try {
        if (body.containsKey("resources")) {
          var resources = JsonParser.parseString(body.get("resources")).getAsJsonObject();
          com.lusiad.backend.service.undo.ResourceImage.applyHistorical(working,
              com.lusiad.backend.service.undo.ResourceImage.decode(resources.get("before").toString()),
              com.lusiad.backend.service.undo.ResourceImage.decode(resources.get("after").toString()));
        } else if (row.changeType.equals("external_bundle"))
          applyBundle(working, bundles.getOrDefault(row.id, List.of()));
        else if (row.scope.equals("file") && "2".equals(body.get("recordVersion")))
          applyEdit(working, body);
        else if (row.changeType.matches("(?:file|dir)_(?:create|delete|rename|move)"))
          applyFile(working, row.changeType, body);
        else if (row.scope.equals("file")
            && Set.of("create", "update", "move", "delete").contains(row.changeType)) {
          var result = JsonParser.parseString(legacy.apply(row, body)).getAsJsonObject();
          if (result.has("error")
              || !result.has("status")
              || !result.get("status").getAsString().equals("ok"))
            throw new IllegalArgumentException("legacy replay rejected");
        } else throw new IllegalArgumentException("unsupported historical operation");
      } catch (Exception error) {
        throw new IllegalArgumentException(
            "Replay failed at change #" + row.id + ": " + error.getMessage(), error);
      }
      if (row.id == target) {
        found = true;
        break;
      }
    }
    if (!found) throw new IllegalArgumentException("target change absent from ordered batch");
  }

  private static Path path(String root, String value, boolean allowRoot) {
    if (value == null) throw new IllegalArgumentException("missing historical path");
    return Path.of(ContainedPaths.resolve(root, value, allowRoot));
  }

  private static String hash(String text) throws Exception {
    return HexFormat.of()
        .formatHex(
            MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
  }

  public static void applyEdit(String root, Map<String, String> body) throws Exception {
    String before = body.get("beforeText"), after = body.get("afterText");
    if (before == null
        || after == null
        || !hash(before).equals(body.get("beforeHash"))
        || !hash(after).equals(body.get("afterHash")))
      throw new IllegalArgumentException("invalid v2 state hashes");
    Path file = path(root, body.get("path"), false);
    String disk = Files.readString(file).replace("\r\n", "\n").replace('\r', '\n');
    if (disk.startsWith("\ufeff")) disk = disk.substring(1);
    if (!disk.equals(before))
      throw new IllegalArgumentException("historical preimage differs from snapshot");
    Files.writeString(file, after);
    if (!Files.readString(file).equals(after))
      throw new java.io.IOException("snapshot write verification failed");
  }

  private static boolean flag(Map<String, String> body, String name) {
    return "true".equalsIgnoreCase(body.get(name));
  }

  private static void remove(Path entry) throws Exception {
    if (Files.isDirectory(entry)) {
      ContainedPaths.tree(entry.toString());
      try (var stream = Files.walk(entry)) {
        for (Path item : stream.sorted(Comparator.reverseOrder()).toList()) Files.delete(item);
      }
    } else Files.delete(entry);
  }

  private static void applyFile(String root, String type, Map<String, String> body)
      throws Exception {
    boolean directory = type.startsWith("dir_");
    String operation = type.substring(type.indexOf('_') + 1);
    if (operation.equals("create")) {
      String name = body.get("name");
      ContainedPaths.name(name);
      Path parent = path(root, body.get("path"), true),
          target = path(root, parent.resolve(name).toString(), false);
      if (!Files.isDirectory(parent))
        throw new IllegalArgumentException("historical parent missing");
      if (directory) Files.createDirectory(target);
      else {
        if (Files.isDirectory(target))
          throw new IllegalArgumentException("destination is a directory");
        if (Files.exists(target) && !flag(body, "overwrite"))
          throw new FileAlreadyExistsException(target.toString());
        Files.writeString(
            target,
            body.get("content") == null ? "" : body.get("content"),
            StandardOpenOption.CREATE,
            StandardOpenOption.TRUNCATE_EXISTING);
      }
      return;
    }
    Path source = path(root, body.get(operation.equals("move") ? "sourcePath" : "path"), false);
    if (!Files.exists(source) || Files.isDirectory(source) != directory)
      throw new IllegalArgumentException("historical source missing or wrong kind");
    if (operation.equals("delete")) {
      if (directory && !flag(body, "recursive")) Files.delete(source);
      else remove(source);
      return;
    }
    Path destination;
    if (operation.equals("rename")) {
      String name = body.getOrDefault("newName", body.get("name"));
      ContainedPaths.name(name);
      destination = path(root, source.resolveSibling(name).toString(), false);
    } else
      destination =
          path(
              root,
              path(root, body.get("destPath"), true).resolve(source.getFileName()).toString(),
              false);
    if (source.equals(destination)) return;
    if (destination.startsWith(source))
      throw new IllegalArgumentException("cannot move into itself");
    if (Files.exists(destination)) {
      if (!flag(body, "overwrite") || Files.isDirectory(destination) != directory)
        throw new FileAlreadyExistsException(destination.toString());
      remove(destination);
    }
    Files.move(source, destination);
  }

  private static boolean sameBytes(byte[] actual, byte[] expected) {
    if (Arrays.equals(actual, expected)) return true;
    // Git may store LF while an external bundle keeps original CRLF bytes.
    // Never decode arbitrary binary payloads with replacement characters.
    try {
      var decoder =
          StandardCharsets.UTF_8
              .newDecoder()
              .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT);
      String a = decoder.decode(java.nio.ByteBuffer.wrap(actual)).toString();
      decoder.reset();
      String b = decoder.decode(java.nio.ByteBuffer.wrap(expected)).toString();
      return a.indexOf(0) < 0
          && b.indexOf(0) < 0
          && a.replace("\r\n", "\n").equals(b.replace("\r\n", "\n"));
    } catch (java.nio.charset.CharacterCodingException invalid) {
      return false;
    }
  }

  public static void applyBundle(String root, List<HistoricalBundleFile> entries) throws Exception {
    if (entries.isEmpty()) throw new IllegalArgumentException("external bundle files missing");
    Set<Path> unique = new HashSet<>();
    for (var entry : entries) {
      Path file = path(root, entry.path(), false);
      if (!unique.add(file)) throw new IllegalArgumentException("duplicate bundle path");
      if (entry.beforeKind() == null) {
        if (Files.exists(file)) throw new IllegalArgumentException("bundle expected absent path");
      } else if (entry.beforeKind().equals("directory")) {
        if (!Files.isDirectory(file))
          throw new IllegalArgumentException("bundle directory preimage mismatch");
      } else if (entry.beforeKind().equals("file")) {
        if (entry.beforeContent() == null
            || !Files.isRegularFile(file)
            || !sameBytes(Files.readAllBytes(file), entry.beforeContent()))
          throw new IllegalArgumentException("bundle file preimage mismatch");
      } else throw new IllegalArgumentException("invalid bundle preimage kind");
      if (entry.afterKind() != null && !Set.of("file", "directory").contains(entry.afterKind()))
        throw new IllegalArgumentException("invalid bundle result kind");
      if ("file".equals(entry.afterKind()) && entry.afterContent() == null)
        throw new IllegalArgumentException("bundle content missing");
    }
    for (var entry :
        entries.stream()
            .sorted(
                Comparator.comparingInt(
                        (HistoricalBundleFile f) -> Path.of(f.path()).getNameCount())
                    .reversed())
            .toList()) {
      if (entry.beforeKind() != null && !Objects.equals(entry.beforeKind(), entry.afterKind()))
        Files.delete(path(root, entry.path(), false));
    }
    for (var entry :
        entries.stream()
            .sorted(Comparator.comparingInt(f -> Path.of(f.path()).getNameCount()))
            .toList()) {
      Path file = path(root, entry.path(), false);
      if ("directory".equals(entry.afterKind())) Files.createDirectories(file);
      if ("file".equals(entry.afterKind())) {
        Files.createDirectories(file.getParent());
        Files.write(file, entry.afterContent());
      }
    }
  }
}
