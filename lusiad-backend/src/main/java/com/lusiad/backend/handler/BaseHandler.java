package com.lusiad.backend.handler;

import com.intellij.openapi.diagnostic.Logger;
import com.lusiad.backend.repository.project.ProjectRepository;
import com.lusiad.backend.service.fs.ContainedPaths;
import com.lusiad.backend.repository.sql.SqlConnectionConfig;
import com.lusiad.backend.repository.sql.SqlConnectionFactory;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Shared infrastructure for all HTTP handlers.
 *
 * <p>Provides project resolution (id → absolute base path) and common
 * utilities that were previously duplicated across every handler class.
 */
public abstract class BaseHandler {

    protected static final ProjectRepository PROJECT_REPOSITORY = new ProjectRepository(
            new SqlConnectionFactory(SqlConnectionConfig.load())
    );

    // -------------------------------------------------------------------------
    // Project resolution
    // -------------------------------------------------------------------------

    /**
     * Resolves the absolute base path for the given project id.
     *
     * @param projectId string value from the request body (may be null/blank)
     * @return resolved {@link ProjectPaths} — never null; throws on any error
     * @throws HandlerException with a 400 body if projectId is missing or invalid,
     *                          or with a 404 body if the project is not found
     */
    protected static ProjectPaths resolveProject(String projectId) throws HandlerException {
        if (isBlank(projectId)) {
            throw new HandlerException(400, ApiJson.error("invalid_request", "projectId is required"));
        }

        int id;
        try {
            id = Integer.parseInt(projectId.trim());
        } catch (NumberFormatException e) {
            throw new HandlerException(400, ApiJson.error("invalid_request", "projectId must be a valid integer"));
        }

        try {
            ProjectRepository.ProjectPaths paths = PROJECT_REPOSITORY.findPathsById(id);
            if (paths == null) {
                throw new HandlerException(404, ApiJson.error("project_not_found", "project not found: id=" + id));
            }
            return new ProjectPaths(id, paths.path, paths.tempPath);
        } catch (HandlerException e) {
            throw e;
        } catch (Exception e) {
            throw new HandlerException(500, ApiJson.error("project_resolution_failed", "failed to resolve project: " + e.getMessage()));
        }
    }

    // -------------------------------------------------------------------------
    // Shared utilities
    // -------------------------------------------------------------------------

    protected static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    @FunctionalInterface
    protected interface HandlerAction { void run() throws Exception; }

    protected static void handleSafely(HttpExchange exchange, Logger log, HandlerAction action) {
        try {
            action.run();
        } catch (HandlerException error) {
            safeSend(exchange, error.status, error.body);
        } catch (Exception error) {
            log.warn("JSON API request failed", error);
            safeSend(exchange, 500, ApiJson.error("internal_error", error.getMessage()));
        }
    }

    protected static void requirePost(HttpExchange exchange) throws HandlerException {
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.getResponseHeaders().set("Allow", "POST");
            throw new HandlerException(405, ApiJson.error("method_not_allowed", "Method Not Allowed"));
        }
    }

    protected static Map<String, String> parseBody(HttpExchange exchange) throws IOException, HandlerException {
        int maximum = 4 * 1024 * 1024;
        byte[] bytes = exchange.getRequestBody().readNBytes(maximum + 1);
        if (bytes.length > maximum) {
            throw new HandlerException(413, ApiJson.error("body_too_large", "JSON body exceeds 4 MiB"));
        }
        try {
            return ApiJson.request(exchange.getRequestURI().getPath(), new String(bytes, StandardCharsets.UTF_8));
        } catch (IllegalArgumentException invalid) {
            throw new HandlerException(400, ApiJson.error("invalid_request", invalid.getMessage()));
        }
    }

    protected static void send(HttpExchange exchange, int status, String body) throws IOException {
        if (status == 200) {
            ApiJson.Response result = ApiJson.response(exchange.getRequestURI().getPath(), body);
            status = result.status();
            body = result.body();
        }
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        try (var output = exchange.getResponseBody()) { output.write(bytes); }
        finally { exchange.close(); }
    }

    private static void safeSend(HttpExchange exchange, int status, String body) {
        try { send(exchange, status, body); }
        catch (IOException failure) { exchange.close(); }
    }

    /**
     * Converts a request path to the representation stored in the change log:
     * relative to the project root.  The web client currently supplies absolute
     * paths for entries selected at the root of the file explorer, so accepting
     * both forms here keeps the service API stable while preventing absolute
     * machine-specific paths from reaching {@code req_body}.
     *
     * @param allowRoot whether the empty relative path (the project root) is a
     *                  valid value for this operation
     */
    protected static String projectRelativePath(ProjectPaths project, String rawPath, boolean allowRoot)
            throws HandlerException {
        try {
            ContainedPaths.separate(project.basePath, project.tempPath);
            String absolute = ContainedPaths.resolve(project.basePath, rawPath, allowRoot);
            return ContainedPaths.relative(project.basePath, absolute, allowRoot);
        } catch (IllegalArgumentException invalid) { throw invalidPath(invalid.getMessage()); }
    }

    protected static ContainedPaths.ReadTarget projectReadTarget(ProjectPaths project, String rawPath)
            throws HandlerException {
        try { return ContainedPaths.readable(project.basePath, project.tempPath, rawPath); }
        catch (IllegalArgumentException invalid) { throw invalidPath(invalid.getMessage()); }
    }

    protected static String projectReadablePath(ProjectPaths project, String rawPath) throws HandlerException {
        var target = projectReadTarget(project, rawPath);
        return target.root().equals(project.basePath) ? target.relative() : target.absolute();
    }

    private static HandlerException invalidPath(String message) {
        return new HandlerException(400, ApiJson.error("path_not_authorized", message));
    }

    // -------------------------------------------------------------------------
    // Value types
    // -------------------------------------------------------------------------

    /** Resolved project metadata needed by every handler. */
    public static final class ProjectPaths {
        public final int id;
        /** Absolute path to the project root directory. */
        public final String basePath;
        /** Absolute path to the project's temporary restore directory. */
        public final String tempPath;

        public ProjectPaths(int id, String basePath, String tempPath) {
            this.id       = id;
            this.basePath = basePath;
            this.tempPath = tempPath;
        }
    }

    /** Signals an HTTP error that should be returned to the client. */
    public static final class HandlerException extends Exception {
        public final int status;
        public final String body;

        public HandlerException(int status, String body) {
            super(body);
            this.status = status;
            this.body   = body;
        }
    }
}
