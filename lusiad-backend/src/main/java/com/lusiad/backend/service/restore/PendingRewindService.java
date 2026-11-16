package com.lusiad.backend.service.restore;

import com.google.gson.*;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vfs.LocalFileSystem;
import com.lusiad.backend.repository.change.EditOperationStore;
import com.lusiad.backend.repository.restore.RestoreRepository;
import com.lusiad.backend.repository.sql.SqlConnectionConfig;
import com.lusiad.backend.repository.sql.SqlConnectionFactory;
import com.lusiad.backend.service.fs.ContainedPaths;
import com.lusiad.backend.service.psi.EditCoordinator;
import com.lusiad.backend.service.psi.PsiService;
import com.lusiad.backend.service.undo.ResourceEdits;
import com.lusiad.backend.service.undo.ResourceImage;
import com.lusiad.backend.service.undo.UndoRegistry;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.*;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Cuts a pending suffix without creating a change. A prepared edit receipt makes interrupted writes recoverable. */
public final class PendingRewindService {
  private static final SqlConnectionFactory DATABASE = new SqlConnectionFactory(SqlConnectionConfig.load());
  private PendingRewindService() {}

  public record Request(int projectId, int changeId, int branchId, String gitId, String revision,
                        String snapshotId, String selectionRevision, String requestId) {}
  private record Event(int id, String title, String type, String body) {}
  private record Plan(Request request, String root, String temp, List<Event> discarded,
                      SortedSet<String> affected, ResourceImage before, ResourceImage after,
                      Map<String,String> baseline, JsonArray tags) {}

  public static JsonObject preview(Project host, String root, String temp, Request request) throws Exception {
    try (var store = new EditOperationStore(DATABASE, request.projectId(), root)) {
      recover(store, root);
      EditCoordinator.recover(store, PsiService.recordedDisk(host, root));
      store.requireRewindBaseline();
      return describe(plan(store, root, temp, request));
    }
  }

  public static JsonObject apply(Project host, String root, String temp, Request request) throws Exception {
    if (request.requestId() == null || !request.requestId().matches("[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}"))
      throw new IllegalArgumentException("Invalid rewind request id");
    try (var store = new EditOperationStore(DATABASE, request.projectId(), root)) {
      recover(store, root);
      JsonObject prior = receipt(store.rewindConnection(), request);
      if (prior != null) return prior;
      EditCoordinator.recover(store, PsiService.recordedDisk(host, root));
      store.requireRewindBaseline();
      Plan plan = plan(store, root, temp, request);
      if (!selectionRevision(plan).equals(request.selectionRevision()))
        throw new IllegalStateException("Pending changes or tags changed; reopen the confirmation");
      if (plan.discarded().isEmpty()) throw new IllegalArgumentException("No later pending changes to discard");
      plan.before().requireCurrent(root);
      requireSavedDocuments(root, plan.before(), plan.after());
      JsonObject journal = new JsonObject();
      journal.addProperty("kind", "pending_rewind"); journal.addProperty("version", 1);
      journal.addProperty("target", request.changeId()); journal.addProperty("branch", request.branchId());
      journal.addProperty("revision", request.revision());
      journal.add("before", plan.before().json()); journal.add("after", plan.after().json());
      try (var statement = store.rewindConnection().prepareStatement(
          "INSERT INTO lusiad_edit_operations(operation_id,project_id,branch_id,state,payload) VALUES(?,?,?,'prepared',?)")) {
        statement.setString(1, request.requestId()); statement.setInt(2, request.projectId());
        statement.setInt(3, request.branchId()); statement.setString(4, journal.toString()); statement.executeUpdate();
      }
      try {
        ResourceImage.apply(root, plan.before(), plan.after());
        publish(store.rewindConnection(), plan);
      } catch (Exception failure) {
        JsonObject completed = receipt(store.rewindConnection(), request);
        if (completed != null) return completed; // A lost COMMIT acknowledgement is not a rollback.
        try {
          ResourceImage.recoverBefore(root, plan.before(), plan.after());
          try (var statement = store.rewindConnection().prepareStatement(
              "UPDATE lusiad_edit_operations SET state='aborted',payload=NULL WHERE project_id=? AND operation_id=? AND state='prepared'")) {
            statement.setInt(1, request.projectId()); statement.setString(2, request.requestId()); statement.executeUpdate();
          }
        } catch (Exception recovery) {
          failure.addSuppressed(recovery);
          throw new IllegalStateException("Rewind requires recovery; reopen pending history before editing", failure);
        }
        throw failure;
      }
      UndoRegistry.discardThrough(request.projectId(), root, store.boundary(), request.changeId());
      try { refresh(host, root, plan.affected()); }
      catch (RuntimeException warning) {
        com.intellij.openapi.diagnostic.Logger.getInstance(PendingRewindService.class)
            .warn("Rewind confirmed, but VFS refresh must be retried", warning);
      }
      JsonObject result = describe(plan); result.addProperty("recovered", false); return result;
    }
  }

  private static void recover(EditOperationStore store, String root) throws Exception {
    try (var statement = store.rewindConnection().prepareStatement(
        "SELECT operation_id,payload FROM lusiad_edit_operations WHERE project_id=? AND state='prepared' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.kind'))='pending_rewind' ORDER BY id")) {
      statement.setInt(1, projectId(store));
      try (var rows = statement.executeQuery()) {
        while (rows.next()) {
          JsonObject journal = JsonParser.parseString(rows.getString(2)).getAsJsonObject();
          ResourceImage before = ResourceImage.decode(journal.get("before").toString());
          ResourceImage after = ResourceImage.decode(journal.get("after").toString());
          ResourceImage.recoverBefore(root, before, after);
          try (var update = store.rewindConnection().prepareStatement(
              "UPDATE lusiad_edit_operations SET state='aborted',payload=NULL WHERE operation_id=? AND state='prepared'")) {
            update.setString(1, rows.getString(1)); update.executeUpdate();
          }
        }
      }
    }
  }

  private static int projectId(EditOperationStore store) { return store.rewindProjectId(); }

  private static JsonObject receipt(Connection db, Request request) throws Exception {
    try (var query = db.prepareStatement("SELECT state,change_id FROM lusiad_edit_operations WHERE project_id=? AND operation_id=?")) {
      query.setInt(1, request.projectId()); query.setString(2, request.requestId());
      try (var rows = query.executeQuery()) {
        if (!rows.next()) return null;
        if ("prepared".equals(rows.getString(1))) return null;
        if ("applied".equals(rows.getString(1)) && rows.getInt(2) == request.changeId()) {
          JsonObject result = new JsonObject(); result.addProperty("status", "ok");
          result.addProperty("targetChangeId", request.changeId()); result.addProperty("recovered", true); return result;
        }
        throw new IllegalStateException("Rewind request was aborted or belongs to another change; start a new confirmation");
      }
    }
  }

  private static Plan plan(EditOperationStore store, String root, String temp, Request request) throws Exception {
    if (request.snapshotId() == null || !request.snapshotId().matches("compare-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}"))
      throw new IllegalArgumentException("Invalid pending preview id");
    ContainedPaths.separate(root, temp);
    var input = new RestoreRepository(DATABASE).loadPendingReplay(request.projectId(), request.changeId(),
        request.branchId(), request.gitId(), request.revision());
    if (!Path.of(input.replay().root()).toRealPath().equals(Path.of(root).toRealPath())
        || !Path.of(input.replay().temp()).toRealPath().equals(Path.of(temp).toRealPath()))
      throw new IllegalArgumentException("Project paths changed");
    verifyGit(root, input.branchName(), request.gitId());
    Path markerPath = Path.of(ContainedPaths.resolve(temp,
        "comparisons/" + request.snapshotId() + "/.lusiad-preview.json", false));
    JsonObject marker = JsonParser.parseString(Files.readString(markerPath)).getAsJsonObject();
    JsonObject pending = marker.getAsJsonObject("pending");
    if (!request.snapshotId().equals(string(marker, "snapshotId")) || request.projectId() != number(marker, "projectId")
        || request.changeId() != number(marker, "changeId") || input.replay().commitId() != number(marker, "commitId")
        || pending == null || request.branchId() != number(pending, "branchId")
        || !request.gitId().equals(string(pending, "gitId")) || !request.revision().equals(string(pending, "revision")))
      throw new IllegalArgumentException("Pending preview is stale");
    if (request.changeId() != 0 && !JsonParser.parseString(input.replay().rows().get(input.replay().rows().size() - 1).reqBody)
        .equals(marker.get("reqBody"))) throw new IllegalArgumentException("Pending preview contents changed");
    List<Event> suffix = new ArrayList<>(); SortedSet<String> affected = new TreeSet<>(); JsonArray tags = new JsonArray();
    try (var query = store.rewindConnection().prepareStatement(
        "SELECT id,summary,change_type,req_body FROM changes WHERE project_id=? AND commit_id IS NULL AND (branch_id IS NULL OR branch_id=?) AND id>? ORDER BY id")) {
      query.setInt(1, request.projectId()); query.setInt(2, request.branchId()); query.setInt(3, request.changeId());
      try (var rows = query.executeQuery()) {
        while (rows.next()) {
          Event event = new Event(rows.getInt(1), rows.getString(2), rows.getString(3), rows.getString(4));
          suffix.add(event); affected.addAll(affected(root, event, store.rewindConnection()));
        }
      }
    }
    if (suffix.isEmpty()) throw new IllegalArgumentException("No later pending changes to discard");
    try (var query = store.rewindConnection().prepareStatement(
        "SELECT ht.name,ch.id FROM lusiad_history_tags ht JOIN changes ch ON ch.id=ht.change_id WHERE ht.project_id=? AND ch.commit_id IS NULL AND (ch.branch_id IS NULL OR ch.branch_id=?) AND ch.id>? ORDER BY ch.id,ht.name")) {
      query.setInt(1, request.projectId()); query.setInt(2, request.branchId()); query.setInt(3, request.changeId());
      try (var rows = query.executeQuery()) {
        while (rows.next()) {
          JsonObject tag = new JsonObject(); tag.addProperty("name", rows.getString(1)); tag.addProperty("changeId", rows.getInt(2)); tags.add(tag);
        }
      }
    }
    // A parent resource supersedes descendants in the same cut.
    List<String> roots = new ArrayList<>();
    for (String path : affected.stream().sorted(Comparator.comparingInt(String::length)).toList())
      if (roots.stream().noneMatch(parent -> ResourceImage.within(path, parent))) roots.add(path);
    Path desiredRoot = Path.of(ContainedPaths.resolve(temp,
        "comparisons/" + request.snapshotId() + "/working-copy", false));
    if (!Files.isDirectory(desiredRoot)) throw new IllegalArgumentException("Pending preview is incomplete");
    ResourceImage before = ResourceImage.capture(root, roots), after = ResourceImage.capture(desiredRoot.toString(), roots);
    if (before.size() + after.size() > ResourceImage.MAX_BYTES) throw ResourceImage.capacity();
    Set<String> imagePaths = new TreeSet<>(before.entries().keySet()); imagePaths.addAll(after.entries().keySet());
    for (String path : imagePaths) if (Arrays.stream(path.split("/")).anyMatch(part -> part.startsWith(".")
        || Set.of("node_modules", "build", "dist", "out", "target").contains(part))
        && !Objects.equals(before.entries().get(path), after.entries().get(path)))
      throw new IllegalStateException("Unmanaged content under an affected path; move it aside before returning to a change");
    Map<String,String> baseline = ResourceEdits.projectHashes(root);
    verifyPreviewTree(root, desiredRoot.toString(), baseline, before, after);
    return new Plan(request, root, temp, suffix, affected, before, after, baseline, tags);
  }

  private static String string(JsonObject object, String key) { return object.has(key) ? object.get(key).getAsString() : null; }
  private static int number(JsonObject object, String key) { return object.has(key) ? object.get(key).getAsInt() : -1; }

  private static SortedSet<String> affected(String root, Event event, Connection db) throws Exception {
    SortedSet<String> paths = new TreeSet<>(); JsonObject body = JsonParser.parseString(event.body()).getAsJsonObject();
    if (body.has("resources")) {
      JsonObject resources = body.getAsJsonObject("resources");
      ResourceImage before = ResourceImage.decode(resources.get("before").toString());
      ResourceImage after = ResourceImage.decode(resources.get("after").toString());
      Set<String> all = new TreeSet<>(before.entries().keySet()); all.addAll(after.entries().keySet());
      for (String path : all) if (!Objects.equals(before.entries().get(path), after.entries().get(path))) paths.add(path);
    } else if (event.type().equals("external_bundle")) {
      try (var query = db.prepareStatement("SELECT path FROM external_sync_bundle_files WHERE change_id=?")) {
        query.setInt(1, event.id());
        try (var rows = query.executeQuery()) {
          while (rows.next()) paths.add(relative(root, rows.getString(1)));
        }
      }
    } else if (event.type().matches("(?:file|dir)_create")) {
      String parent = string(body, "path"), name = string(body, "name");
      ContainedPaths.name(name);
      paths.add(relative(root, Path.of(ContainedPaths.resolve(root, parent, true)).resolve(name).toString()));
    } else if (event.type().matches("(?:file|dir)_(?:rename|move)")) {
      String source = string(body, event.type().endsWith("move") ? "sourcePath" : "path");
      paths.add(relative(root, source));
      String target;
      if (event.type().endsWith("rename")) {
        String name = string(body, "newName"); if (name == null) name = string(body, "name"); ContainedPaths.name(name);
        target = Path.of(ContainedPaths.resolve(root, source, false)).resolveSibling(name).toString();
      } else target = Path.of(ContainedPaths.resolve(root, string(body, "destPath"), true))
          .resolve(Path.of(source).getFileName()).toString();
      paths.add(relative(root, target));
    } else paths.add(relative(root, string(body, "path")));
    if (paths.isEmpty()) throw new IllegalArgumentException("Change has no recoverable paths: " + event.id());
    return paths;
  }

  private static String relative(String root, String value) {
    return ContainedPaths.relative(root, ContainedPaths.resolve(root, value, false), false);
  }

  private static void verifyGit(String root, String branch, String sha) throws Exception {
    for (var check : List.of(new String[]{"symbolic-ref", "--quiet", "--short", "HEAD"}, new String[]{"rev-parse", "--verify", "HEAD"})) {
      List<String> command = new ArrayList<>(List.of("git", "-C", root)); command.addAll(List.of(check));
      Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
      if (!process.waitFor(5, TimeUnit.SECONDS)) { process.destroyForcibly(); throw new IllegalStateException("Git status timed out"); }
      String output = new String(process.getInputStream().readNBytes(512), java.nio.charset.StandardCharsets.UTF_8).trim();
      if (process.exitValue() != 0 || !output.equals(check[0].equals("symbolic-ref") ? branch : sha))
        throw new IllegalStateException("Git branch or HEAD changed; reopen the pending change");
    }
    Process staged = new ProcessBuilder("git", "-C", root, "diff", "--cached", "--quiet", "--exit-code").start();
    if (!staged.waitFor(5, TimeUnit.SECONDS)) { staged.destroyForcibly(); throw new IllegalStateException("Git index check timed out"); }
    if (staged.exitValue() != 0) throw new IllegalStateException("The Git index contains staged changes; resolve them before returning to a pending change");
  }

  private static JsonObject describe(Plan plan) {
    JsonObject result = new JsonObject(); result.addProperty("status", "ok");
    result.addProperty("targetChangeId", plan.request().changeId());
    result.addProperty("pendingRevision", plan.request().revision());
    result.addProperty("selectionRevision", selectionRevision(plan));
    JsonArray events = new JsonArray();
    for (Event event : plan.discarded()) {
      JsonObject item = new JsonObject(); item.addProperty("id", event.id()); item.addProperty("title", event.title());
      item.addProperty("type", event.type()); events.add(item);
    }
    result.add("discarded", events); result.add("paths", ResourceImage.JSON.toJsonTree(plan.affected()));
    result.add("tags", plan.tags()); return result;
  }

  private static String selectionRevision(Plan plan) {
    JsonArray events = new JsonArray();
    for (Event event : plan.discarded()) {
      JsonObject row = new JsonObject(); row.addProperty("id", event.id());
      row.addProperty("title", event.title()); row.addProperty("type", event.type());
      row.addProperty("body", event.body()); events.add(row);
    }
    return EditCoordinator.hash(events + ":" + plan.tags() + ":" + plan.affected()
        + ":" + plan.after().revision());
  }

  private static void publish(Connection db, Plan plan) throws Exception {
    Request request = plan.request();
    plan.after().requireCurrent(plan.root());
    if (!resultingHashes(plan.baseline(), plan.before(), plan.after()).equals(ResourceEdits.projectHashes(plan.root())))
      throw new IllegalStateException("Project files changed during the rewind; synchronize and retry");
    verifyGit(plan.root(), new RestoreRepository(DATABASE).loadPendingReplay(request.projectId(), request.changeId(),
        request.branchId(), request.gitId(), request.revision()).branchName(), request.gitId());
    db.setAutoCommit(false);
    try {
      long count, max;
      try (var query = db.prepareStatement("SELECT COUNT(*),COALESCE(MAX(id),0) FROM changes WHERE project_id=? AND commit_id IS NULL AND (branch_id IS NULL OR branch_id=?)")) {
        query.setInt(1, request.projectId()); query.setInt(2, request.branchId());
        try (var rows = query.executeQuery()) { rows.next(); count = rows.getLong(1); max = rows.getLong(2); }
      }
      if (!(count + ":" + max).equals(request.revision())) throw new IllegalStateException("Pending changes changed during confirmation");
      try (var query = db.prepareStatement("SELECT COUNT(*) FROM commit_change_sets cs JOIN changes ch ON ch.id=cs.change_id WHERE ch.project_id=? AND ch.commit_id IS NULL AND (ch.branch_id IS NULL OR ch.branch_id=?) AND ch.id>?")) {
        query.setInt(1, request.projectId()); query.setInt(2, request.branchId()); query.setInt(3, request.changeId());
        try (var rows = query.executeQuery()) { rows.next(); if (rows.getLong(1) != 0) throw new IllegalStateException("A pending change is already linked to a commit"); }
      }
      Set<String> paths = new TreeSet<>(plan.before().entries().keySet()); paths.addAll(plan.after().entries().keySet());
      for (String path : paths) {
        ResourceImage.Entry before = plan.before().entries().get(path), after = plan.after().entries().get(path);
        if (Objects.equals(before, after) || ignored(path)) continue;
        if (after == null) try (var query = db.prepareStatement("DELETE FROM external_sync_files WHERE project_id=? AND path=?")) {
          query.setInt(1, request.projectId()); query.setString(2, path); query.executeUpdate();
        } else try (var query = db.prepareStatement("INSERT INTO external_sync_files(project_id,path,kind,content,sha256) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE kind=VALUES(kind),content=VALUES(content),sha256=VALUES(sha256)")) {
          byte[] bytes = after.bytes();
          query.setInt(1, request.projectId()); query.setString(2, path); query.setString(3, after.kind());
          query.setBytes(4, after.kind().equals("file") ? bytes : null);
          query.setString(5, HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes))); query.executeUpdate();
        }
      }
      try (var query = db.prepareStatement("UPDATE external_sync_projects SET pending_bundle_change_id=NULL WHERE project_id=? AND pending_bundle_change_id>?")) {
        query.setInt(1, request.projectId()); query.setInt(2, request.changeId()); query.executeUpdate();
      }
      try (var query = db.prepareStatement("UPDATE lusiad_edit_operations SET state='aborted',change_id=NULL,payload=NULL WHERE project_id=? AND state='applied' AND change_id IN (SELECT id FROM changes WHERE project_id=? AND commit_id IS NULL AND (branch_id IS NULL OR branch_id=?) AND id>?)")) {
        query.setInt(1, request.projectId()); query.setInt(2, request.projectId()); query.setInt(3, request.branchId()); query.setInt(4, request.changeId()); query.executeUpdate();
      }
      try (var query = db.prepareStatement("DELETE FROM changes WHERE project_id=? AND commit_id IS NULL AND (branch_id IS NULL OR branch_id=?) AND id>?")) {
        query.setInt(1, request.projectId()); query.setInt(2, request.branchId()); query.setInt(3, request.changeId());
        if (query.executeUpdate() != plan.discarded().size()) throw new IllegalStateException("Pending suffix changed during deletion");
      }
      try (var query = db.prepareStatement("UPDATE lusiad_edit_operations SET state='applied',change_id=?,payload=NULL WHERE project_id=? AND operation_id=? AND state='prepared'")) {
        query.setInt(1, request.changeId()); query.setInt(2, request.projectId()); query.setString(3, request.requestId());
        if (query.executeUpdate() != 1) throw new IllegalStateException("Rewind receipt was not prepared");
      }
      db.commit();
    } catch (Exception failure) { try { db.rollback(); } catch (Exception rollback) { failure.addSuppressed(rollback); } throw failure; }
    finally { db.setAutoCommit(true); }
  }

  private static Map<String,String> resultingHashes(Map<String,String> baseline, ResourceImage before,
      ResourceImage after) throws Exception {
    Map<String,String> result = new TreeMap<>(baseline);
    Set<String> changed = new TreeSet<>(before.entries().keySet()); changed.addAll(after.entries().keySet());
    for (String path : changed) {
      ResourceImage.Entry previous = before.entries().get(path), next = after.entries().get(path);
      if (Objects.equals(previous, next) || ignored(path)) continue;
      if (next == null) result.remove(path);
      else result.put(path, next.kind() + ":" + HexFormat.of().formatHex(
          MessageDigest.getInstance("SHA-256").digest(next.bytes())));
    }
    return result;
  }

  static void verifyPreviewTree(String root, String previewRoot, Map<String,String> baseline,
      ResourceImage before, ResourceImage after) throws Exception {
    Map<String,String> expected = resultingHashes(baseline, before, after);
    Map<String,String> actual = ResourceEdits.projectHashes(previewRoot);
    // Git snapshots omit empty directories. Keep pre-existing directories that the cut does not touch.
    for (String path : actual.keySet()) if (!expected.containsKey(path))
      throw new IllegalStateException("Pending preview has different project paths; rebuild the preview");
    for (String path : expected.keySet()) {
      if (!actual.containsKey(path)) {
        if (expected.get(path).startsWith("directory:")
            && Objects.equals(before.entries().get(path), after.entries().get(path))
            && Files.isDirectory(Path.of(ContainedPaths.resolve(root, path, false)))) continue;
        throw new IllegalStateException("Pending preview has different project paths; rebuild the preview");
      }
      if (Objects.equals(expected.get(path), actual.get(path))) continue;
      // Git may check out LF while the live Windows working tree uses CRLF.
      // Only untouched UTF-8 text may differ this way; restored paths must match exactly.
      if (!Objects.equals(before.entries().get(path), after.entries().get(path))
          || !expected.get(path).startsWith("file:") || !actual.get(path).startsWith("file:")
          || !sameTextIgnoringCrlf(root, previewRoot, path))
        throw new IllegalStateException("Pending preview differs outside the discarded changes; rebuild the preview");
    }
  }

  private static boolean sameTextIgnoringCrlf(String root, String previewRoot, String path) throws Exception {
    Path live = Path.of(ContainedPaths.resolve(root, path, false));
    Path preview = Path.of(ContainedPaths.resolve(previewRoot, path, false));
    if (Files.size(live) > ResourceImage.MAX_BYTES || Files.size(preview) > ResourceImage.MAX_BYTES) return false;
    byte[] left = Files.readAllBytes(live), right = Files.readAllBytes(preview);
    String a = new String(left, StandardCharsets.UTF_8), b = new String(right, StandardCharsets.UTF_8);
    return a.indexOf('\0') < 0 && b.indexOf('\0') < 0
        && Arrays.equals(a.getBytes(StandardCharsets.UTF_8), left)
        && Arrays.equals(b.getBytes(StandardCharsets.UTF_8), right)
        && a.replace("\r\n", "\n").equals(b.replace("\r\n", "\n"));
  }

  private static boolean ignored(String path) {
    return Arrays.stream(path.split("/")).anyMatch(part -> part.startsWith(".")
        || Set.of("node_modules", "build", "dist", "out", "target").contains(part));
  }

  private static void requireSavedDocuments(String root, ResourceImage before, ResourceImage after) {
    Set<String> paths = new TreeSet<>(before.entries().keySet()); paths.addAll(after.entries().keySet());
    var files = FileDocumentManager.getInstance();
    for (String path : paths) {
      if (Objects.equals(before.entries().get(path), after.entries().get(path))) continue;
      var file = LocalFileSystem.getInstance().findFileByPath(ContainedPaths.resolve(root, path, false));
      if (file == null || file.isDirectory()) continue;
      var document = files.getCachedDocument(file);
      if (document != null && files.isDocumentUnsaved(document))
        throw new EditCoordinator.Failure("revision_conflict", "Save or discard unsaved IntelliJ changes before returning to a pending change", null, null);
    }
  }

  private static void refresh(Project host, String root, Collection<String> paths) {
    for (String path : paths) if (path.toLowerCase(Locale.ROOT).endsWith(".java"))
      try { PsiService.refreshFileFromDisk(host, ContainedPaths.resolve(root, path, false)); }
      catch (Exception ignored) { /* The browser reloads the confirmed tree; a deleted VFS node may be gone. */ }
    var directory = com.intellij.openapi.vfs.LocalFileSystem.getInstance().refreshAndFindFileByPath(root);
    if (directory != null) directory.refresh(false, true);
  }
}
