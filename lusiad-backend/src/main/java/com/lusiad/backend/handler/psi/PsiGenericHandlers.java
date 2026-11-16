package com.lusiad.backend.handler.psi;

import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.lusiad.backend.handler.BaseHandler;
import com.lusiad.backend.handler.ApiJson;
import com.lusiad.backend.service.psi.PsiService;
import com.lusiad.backend.service.psi.SyntaxDiagnostics;
import com.sun.net.httpserver.HttpExchange;

import java.util.Map;

/**
 * HTTP handlers for PSI (in-file code) operations.
 *
 * <p>Every request body must include a {@code projectId} field. The {@code path}
 * field is treated as <em>relative</em> to the project root resolved from the
 * database.
 *
 * <pre>
 * POST /psi/format  { "projectId": 1, "path": "src/Foo.java" }
 * POST /psi/read    { "projectId": 1, "path": "src/Foo.java" }
 * POST /psi/create  { "projectId": 1, "path": "src/Foo.java", "line": 5, "content": "..." }
 * POST /psi/update  { "projectId": 1, "path": "src/Foo.java", "startOffset": 10, "endOffset": 20, "newContent": "..." }
 * POST /psi/delete  { "projectId": 1, "path": "src/Foo.java", "startOffset": 10, "endOffset": 20 }
 * POST /psi/move    { "projectId": 1, "path": "src/Foo.java", "startOffset": 10, "endOffset": 20, "line": 5 }
 * </pre>
 */
public class PsiGenericHandlers extends BaseHandler {

    private static final Logger LOG = Logger.getInstance(PsiGenericHandlers.class);

    /** Analyze supplied source/proposal only; resolving the registered root does not read or save its Java file. */
    public static void handleDiagnose(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);
            Map<String, String> req = parseBody(exchange);
            ProjectPaths paths = resolveProject(req.get("projectId"));
            String path = projectRelativePath(paths, req.get("path"), false);
            try {
                if (project == null || project.isDisposed()) throw new SyntaxDiagnostics.Failure("syntax_analysis_unavailable", "Java syntax analysis is unavailable", null);
                boolean operation = exchange.getRequestURI().getPath().equals("/psi/diagnose-edit");
                String source = operation ? req.get("sourceContent") : req.get("content");
                SyntaxDiagnostics.Edit edit;
                String proposed = null;
                if (operation) {
                    if (!com.lusiad.backend.service.psi.EditCoordinator.hash(source).equals(req.get("expectedHash")))
                        throw new IllegalArgumentException("Proposal context does not match its source revision");
                    proposed = PsiService.proposedEdit(project, path, source, req, req.get("operation"));
                    edit = new SyntaxDiagnostics.Edit(0, source.length(), proposed);
                } else edit = req.containsKey("newContent") ? new SyntaxDiagnostics.Edit(
                        Integer.parseInt(req.get("startOffset")), Integer.parseInt(req.get("endOffset")), req.get("newContent")) : null;
                var result = SyntaxDiagnostics.analyze(project, new SyntaxDiagnostics.Request(path, source, edit));
                var gson = new com.google.gson.GsonBuilder().serializeNulls().create();
                var body = gson.toJsonTree(result).getAsJsonObject();
                if (operation) { body.addProperty("operation", req.get("operation")); body.addProperty("proposedContent", proposed); }
                send(exchange, 200, gson.toJson(body));
            } catch (SyntaxDiagnostics.Failure failure) {
                if (!failure.code.equals("syntax_analysis_cancelled")) LOG.warn("Syntax analysis failed", failure);
                int status = failure.code.equals("syntax_analysis_cancelled") ? 409
                        : failure.code.equals("syntax_analysis_unavailable") ? 503 : 500;
                send(exchange, status, ApiJson.error(failure.code, failure.getMessage()));
            } catch (IllegalArgumentException invalid) {
                send(exchange, 400, ApiJson.error("invalid_request", invalid.getMessage()));
            }
        });
    }

    public static void handleRecover(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);
            var req = parseBody(exchange);
            var paths = resolveProject(req.get("projectId"));
            send(exchange, 200, PsiService.recoverEdits(project, paths.id, paths.basePath));
        });
    }

    public static void handleFormat(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);

            Map<String, String> req = parseBody(exchange);

            ProjectPaths pp = resolveProject(req.get("projectId"));

            String path = projectRelativePath(pp, req.get("path"), false);
            req.put("path", path);

            String result = PsiService.format(project, pp.basePath, path);
            send(exchange, 200, result);
        });
    }

    public static void handleCreate(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);

            Map<String, String> req = parseBody(exchange);

            ProjectPaths pp = resolveProject(req.get("projectId"));

            String path = projectRelativePath(pp, req.get("path"), false);
            req.put("path", path);

            String result = PsiService.create(project, pp.id, pp.basePath, path, req, true);
            send(exchange, 200, result);
        });
    }

    public static void handleRead(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);

            Map<String, String> req = parseBody(exchange);

            ProjectPaths pp = resolveProject(req.get("projectId"));

            var target = projectReadTarget(pp, req.get("path"));

            String result = PsiService.readJavaPsiStructure(project, target.root(), target.relative());
            send(exchange, 200, result);
        });
    }

    /** Read-only PSI parsing for committed Java source supplied by the local frontend. */
    public static void handleParse(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);
            Map<String, String> req = parseBody(exchange);
            resolveProject(req.get("projectId"));
            String fileName = req.get("fileName");
            send(exchange, 200, PsiService.parseJavaSource(project, fileName, req.get("content")));
        });
    }

    public static void handleDelete(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);

            Map<String, String> req = parseBody(exchange);

            ProjectPaths pp = resolveProject(req.get("projectId"));

            String path = projectRelativePath(pp, req.get("path"), false);
            req.put("path", path);

            String result = PsiService.delete(project, pp.id, pp.basePath, path, req, true);
            send(exchange, 200, result);
        });
    }

    public static void handleUpdate(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);

            Map<String, String> req = parseBody(exchange);

            ProjectPaths pp = resolveProject(req.get("projectId"));

            String path = projectRelativePath(pp, req.get("path"), false);
            req.put("path", path);

            String startOffsetStr = req.get("startOffset");
            String endOffsetStr   = req.get("endOffset");
            String newContent     = req.get("newContent");

            String result = PsiService.update(
                    project,
                    pp.id,
                    pp.basePath,
                    path,
                    startOffsetStr,
                    endOffsetStr,
                    newContent,
                    req,
                    true
            );
            send(exchange, 200, result);
        });
    }

    public static void handleMove(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);

            Map<String, String> req = parseBody(exchange);

            ProjectPaths pp = resolveProject(req.get("projectId"));

            String path = projectRelativePath(pp, req.get("path"), false);
            req.put("path", path);

            String result = PsiService.move(project, pp.id, pp.basePath, path, req, true);
            send(exchange, 200, result);
        });
    }

}
