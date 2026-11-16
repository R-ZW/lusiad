package com.lusiad.backend.handler.fs;

import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.lusiad.backend.handler.BaseHandler;
import com.lusiad.backend.service.fs.FsFileService;
import com.sun.net.httpserver.HttpExchange;

import java.util.Map;

/**
 * HTTP handlers for file operations.
 *
 * <p>Every request body must include a {@code projectId} field. Paths are
 * treated as <em>relative</em> to the project root; the handler resolves the
 * absolute path before delegating to {@link FsFileService}.
 *
 * <pre>
 * POST /fs/file/create  { "projectId": 1, "path": "src/main", "name": "Foo.java", "content": "..." }
 * POST /fs/file/delete  { "projectId": 1, "path": "src/main/Foo.java" }
 * POST /fs/file/rename  { "projectId": 1, "path": "src/main/Foo.java", "name": "Bar.java" }
 * POST /fs/file/move    { "projectId": 1, "sourcePath": "src/a/Foo.java", "destPath": "src/b" }
 * </pre>
 */
public class FsFileHandlers extends BaseHandler {

    private static final Logger LOG = Logger.getInstance(FsFileHandlers.class);

    /**
     * POST /fs/file/create
     * Body: { "projectId": 1, "path": "relative/dir", "name": "MyFile.java" }
     * Optional: { "content": "initial file content" }
     */
    public static void handleCreate(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);

            Map<String, String> req = parseBody(exchange);

            ProjectPaths pp = resolveProject(req.get("projectId"));

            String path = projectRelativePath(pp, req.get("path"), true);
            req.put("path", path);

            String name = req.get("name");
            String result = com.lusiad.backend.service.undo.ResourceEdits.filesystem(project, pp.id, pp.basePath, "file_create", req);
            send(exchange, 200, result);
        });
    }

    /**
     * POST /fs/file/delete
     * Body: { "projectId": 1, "path": "relative/path/to/File.java" }
     * Optional: { "safe": "true" }
     */
    public static void handleDelete(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);

            Map<String, String> req = parseBody(exchange);

            ProjectPaths pp = resolveProject(req.get("projectId"));

            String path = projectRelativePath(pp, req.get("path"), false);
            req.put("path", path);

            String result = com.lusiad.backend.service.undo.ResourceEdits.filesystem(project, pp.id, pp.basePath, "file_delete", req);
            send(exchange, 200, result);
        });
    }

    /**
     * POST /fs/file/rename
     * Body: { "projectId": 1, "path": "relative/path/to/OldName.java", "name": "NewName.java" }
     */
    public static void handleRename(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);

            Map<String, String> req = parseBody(exchange);

            ProjectPaths pp = resolveProject(req.get("projectId"));

            String path = projectRelativePath(pp, req.get("path"), false);
            req.put("path", path);

            String name = req.get("name");
            String result = com.lusiad.backend.service.undo.ResourceEdits.filesystem(project, pp.id, pp.basePath, "file_rename", req);
            send(exchange, 200, result);
        });
    }

    /**
     * POST /fs/file/move
     * Body: { "projectId": 1, "sourcePath": "old/path/File.java", "destPath": "new/dir" }
     * Optional: { "overwrite": "true" }
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

            String result = com.lusiad.backend.service.undo.ResourceEdits.filesystem(project, pp.id, pp.basePath, "file_move", req);
            send(exchange, 200, result);
        });
    }

}
