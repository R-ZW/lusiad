package com.lusiad.backend.service.restore;

import com.google.gson.*;
import com.intellij.openapi.project.Project;
import com.lusiad.backend.repository.restore.RestoreRepository;
import com.lusiad.backend.repository.sql.*;
import com.lusiad.backend.service.fs.ContainedPaths;
import com.lusiad.backend.service.psi.PsiService;
import java.nio.file.*;
import java.util.Map;

/** Every request owns a fresh snapshot namespace; nothing is exposed as ready on failure. */
public final class RestoreService {
  private static final com.intellij.openapi.diagnostic.Logger LOG =
      com.intellij.openapi.diagnostic.Logger.getInstance(RestoreService.class);

  private RestoreService() {}

  public static String applyUntil(Project project, int target) {
    return applyUntil(project, target, null);
  }

  public static String applyUntil(Project project, int target, String snapshotId) {
    return apply(project, target, snapshotId, null);
  }

  public static String applyPending(Project project, int projectId, int target, String snapshotId,
      int branchId, String gitId, String revision) {
    return apply(project, target, snapshotId, new PendingRequest(projectId, branchId, gitId, revision));
  }

  private record PendingRequest(int projectId, int branchId, String gitId, String revision) {}

  private static String apply(Project project, int target, String snapshotId, PendingRequest pending) {
    JsonObject result = new JsonObject();
    try {
      if (snapshotId == null || !snapshotId.matches("compare-[a-f0-9-]{36}"))
        throw new IllegalArgumentException("an isolated snapshot id is required");
      var repository = new RestoreRepository(new SqlConnectionFactory(SqlConnectionConfig.load()));
      var pendingInput = pending == null ? null : repository.loadPendingReplay(
          pending.projectId(), target, pending.branchId(), pending.gitId(), pending.revision());
      var input = pendingInput == null ? repository.loadReplay(target) : pendingInput.replay();
      ContainedPaths.separate(input.root(), input.temp());
      String requestRoot = ContainedPaths.resolve(input.temp(), "comparisons/" + snapshotId, false);
      com.lusiad.backend.config.RuntimeEnvironment.assertTree(requestRoot, true);
      if (Files.exists(Path.of(requestRoot, "working-copy"))
          || Files.exists(Path.of(requestRoot, "working-copy-prev"))
          || Files.exists(Path.of(requestRoot, ".lusiad-preview.json")))
        throw new IllegalArgumentException("snapshot already used");
      Files.createDirectory(
          Path.of(requestRoot, ".replaying")); // Exclusive, never delete another request's lock.
      try {
        HistoricalReplay.run(
            requestRoot,
            input.root(),
            input.rows(),
            target,
            input.bundles(),
            (row, body) -> legacy(project, requestRoot, row.changeType, body));
      } finally {
        Files.deleteIfExists(Path.of(requestRoot, ".replaying"));
      }
      result.addProperty("status", "ok");
      result.addProperty("snapshotId", snapshotId);
      result.addProperty("gitId", input.gitId());
      result.addProperty("projectId", input.projectId());
      result.addProperty("commitId", input.commitId());
      if (pendingInput != null) {
        result.addProperty("branchId", pendingInput.branchId());
        result.addProperty("pendingRevision", pendingInput.revision());
      }
      result.addProperty("targetChangeId", target);
      result.addProperty("errorCount", 0);
      result.addProperty("appliedCount", input.rows().size());
      JsonArray applied = new JsonArray();
      for (var row : input.rows()) {
        JsonObject entry = new JsonObject();
        entry.addProperty("id", row.id);
        applied.add(entry);
      }
      result.add("applied", applied);
      result.add("errors", new JsonArray());
    } catch (Exception failure) {
      LOG.warn("Historical reconstruction failed for change #" + target, failure);
      result = new JsonObject();
      result.addProperty("error", failure.getMessage());
      result.addProperty("code", "incomplete_restore");
    }
    return result.toString();
  }

  private static String legacy(
      Project project, String root, String kind, Map<String, String> body) {
    String working = ContainedPaths.resolve(root, "working-copy", false), path = body.get("path");
    return switch (kind) {
      case "create" -> PsiService.create(project, 0, working, path, body, false);
      case "update" -> PsiService.update(
          project,
          0,
          working,
          path,
          body.get("startOffset"),
          body.get("endOffset"),
          body.get("newContent"),
          body,
          false);
      case "delete" -> PsiService.delete(project, 0, working, path, body, false);
      case "move" -> PsiService.move(project, 0, working, path, body, false);
      default -> throw new IllegalArgumentException("unsupported legacy PSI change");
    };
  }
}
