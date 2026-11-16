package com.lusiad.backend.handler.restore;

import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.lusiad.backend.handler.BaseHandler;
import com.lusiad.backend.service.restore.RestoreService;
import com.lusiad.backend.service.restore.PendingRewindService;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.vfs.LocalFileSystem;
import com.lusiad.backend.service.fs.ContainedPaths;
import com.sun.net.httpserver.HttpExchange;

import java.util.Map;

/**
 * HTTP handler for restore operations.
 *
 * <pre>
 * POST /restore/apply  { "changeId": 153, "snapshotId": "compare-&lt;UUID&gt;" }
 * </pre>
 *
 * <p>The {@code projectId} is resolved automatically from the change record in the
 * database — the client does not need to supply it here.
 */
public class RestoreHandlers extends BaseHandler {

    private static final Logger LOG = Logger.getInstance(RestoreHandlers.class);

    /**
     * POST /restore/apply
     * Body: { "changeId": 153, "snapshotId": "compare-&lt;UUID&gt;" }
     *
     * Replays all changes of the same commit up to and including {@code changeId},
     * remapping every path to a fresh request directory under {@code temp_path/comparisons}.
     */
    public static void handleApply(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);

            Map<String, String> req = parseBody(exchange);

            int changeId = Integer.parseInt(req.get("changeId"));

            String result = RestoreService.applyUntil(project, changeId, req.get("snapshotId"));
            send(exchange, 200, result);
        });
    }

    /** Replays pending events from the selected branch's committed HEAD in an isolated snapshot. */
    public static void handlePending(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);
            Map<String, String> req = parseBody(exchange);
            String result = RestoreService.applyPending(project,
                Integer.parseInt(req.get("projectId")), Integer.parseInt(req.get("changeId")),
                req.get("snapshotId"), Integer.parseInt(req.get("branchId")),
                req.get("gitId"), req.get("pendingRevision"));
            send(exchange, 200, result);
        });
    }

    public static void handleRewind(Project project, HttpExchange exchange, boolean apply) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);
            Map<String, String> req = parseBody(exchange);
            ProjectPaths paths = resolveProject(req.get("projectId"));
            var request = new PendingRewindService.Request(paths.id,
                Integer.parseInt(req.get("changeId")), Integer.parseInt(req.get("branchId")),
                req.get("gitId"), req.get("pendingRevision"), req.get("snapshotId"),
                req.get("selectionRevision"), req.get("requestId"));
            var result = apply
                ? PendingRewindService.apply(project, paths.basePath, paths.tempPath, request)
                : PendingRewindService.preview(project, paths.basePath, paths.tempPath, request);
            send(exchange, 200, result.toString());
        });
    }

    /** Fences unsaved IDE documents before an external Git checkout and refreshes VFS afterwards. */
    public static void handleCommitCheck(Project project, HttpExchange exchange, boolean refresh) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);
            Map<String, String> req = parseBody(exchange);
            ProjectPaths paths = resolveProject(req.get("projectId"));
            if (refresh) {
                var directory = LocalFileSystem.getInstance().refreshAndFindFileByPath(paths.basePath);
                if (directory != null) directory.refresh(false, true);
            } else {
                var manager = FileDocumentManager.getInstance();
                for (var document : manager.getUnsavedDocuments()) {
                    var file = manager.getFile(document);
                    if (file == null) continue;
                    try { ContainedPaths.relative(paths.basePath, file.getPath(), false); }
                    catch (IllegalArgumentException outside) { continue; }
                    throw new IllegalStateException("Save or discard unsaved IntelliJ documents before restoring a commit");
                }
            }
            send(exchange, 200, "{\"status\":\"ok\"}");
        });
    }

}
