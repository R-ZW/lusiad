package com.lusiad.backend.handler.fs;

import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.lusiad.backend.handler.BaseHandler;
import com.lusiad.backend.service.fs.FsDirService;
import com.sun.net.httpserver.HttpExchange;

import java.util.Map;

/**
 * HTTP handlers for directory operations.
 *
 * <p>Every request body must include a {@code projectId} field. Paths sent in
 * the body are treated as <em>relative</em> to the project root stored in the
 * database; the handler resolves the absolute path before delegating to
 * {@link FsDirService}.
 *
 * <pre>
 * POST /fs/dir/create  { "projectId": 1, "path": "src/main", "name": "utils" }
 * POST /fs/dir/delete  { "projectId": 1, "path": "src/main/utils", "recursive": "true" }
 * POST /fs/dir/rename  { "projectId": 1, "path": "src/main/utils", "name": "helpers" }
 * POST /fs/dir/move    { "projectId": 1, "sourcePath": "src/a", "destPath": "src/b" }
 * </pre>
 */
public class FsDirHandlers extends BaseHandler {

    private static final Logger LOG = Logger.getInstance(FsDirHandlers.class);

    /**
     * POST /fs/dir/create
     * Body: { "projectId": 1, "path": "relative/parent/dir", "name": "new-folder" }
     */
    public static void handleCreate(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);

            Map<String, String> req = parseBody(exchange);

            ProjectPaths pp = resolveProject(req.get("projectId"));

            String path = projectRelativePath(pp, req.get("path"), true);
            req.put("path", path);

            String name = req.get("name");
            String result = com.lusiad.backend.service.undo.ResourceEdits.filesystem(project, pp.id, pp.basePath, "dir_create", req);
            send(exchange, 200, result);
        });
    }

    /**
     * POST /fs/dir/delete
     * Body: { "projectId": 1, "path": "relative/path/to/dir" }
     * Optional: { "recursive": "true" }
     */
    public static void handleDelete(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);

            Map<String, String> req = parseBody(exchange);

            ProjectPaths pp = resolveProject(req.get("projectId"));

            String path = projectRelativePath(pp, req.get("path"), false);
            req.put("path", path);

            String result = com.lusiad.backend.service.undo.ResourceEdits.filesystem(project, pp.id, pp.basePath, "dir_delete", req);
            send(exchange, 200, result);
        });
    }

    /**
     * POST /fs/dir/rename
     * Body: { "projectId": 1, "path": "relative/path/to/dir", "name": "NewDirName" }
     */
    public static void handleRename(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);

            Map<String, String> req = parseBody(exchange);

            ProjectPaths pp = resolveProject(req.get("projectId"));

            String path = projectRelativePath(pp, req.get("path"), false);
            req.put("path", path);

            String name = req.get("name");
            String result = com.lusiad.backend.service.undo.ResourceEdits.filesystem(project, pp.id, pp.basePath, "dir_rename", req);
            send(exchange, 200, result);
        });
    }

    /**
     * POST /fs/dir/move
     * Body: { "projectId": 1, "sourcePath": "old/path/dir", "destPath": "new/parent/dir" }
     */
    public static void handleMove(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);

            Map<String, String> req = parseBody(exchange);

            ProjectPaths pp = resolveProject(req.get("projectId"));

            String sourcePath = projectRelativePath(pp, req.get("sourcePath"), false);
            String destPath = projectRelativePath(pp, req.get("destPath"), true);
            req.put("sourcePath", sourcePath);
            req.put("destPath", destPath);

            String result = com.lusiad.backend.service.undo.ResourceEdits.filesystem(project, pp.id, pp.basePath, "dir_move", req);
            send(exchange, 200, result);
        });
    }

}
