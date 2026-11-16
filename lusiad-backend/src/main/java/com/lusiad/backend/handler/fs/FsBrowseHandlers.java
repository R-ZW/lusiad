package com.lusiad.backend.handler.fs;

import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;
import com.lusiad.backend.handler.*;
import com.lusiad.backend.service.fs.NativeFileExplorer;
import com.lusiad.backend.service.project.ProjectActivity;
import com.sun.net.httpserver.HttpExchange;

public final class FsBrowseHandlers extends BaseHandler {
    private static final Logger LOG = Logger.getInstance(FsBrowseHandlers.class);
    public static void chooseDirectory(com.intellij.openapi.project.Project project,
                                       com.lusiad.backend.service.fs.NativeDirectoryPicker picker, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);
            var request = parseBody(exchange);
            try {
                send(exchange, 200, picker.request(project, request.get("requestId"), request.get("operation"),
                        request.getOrDefault("path", ""), request.get("locale")).toString());
            } catch (IllegalArgumentException unavailable) {
                String code = "directory_picker_busy".equals(unavailable.getMessage()) ? "directory_picker_busy" : "directory_picker_expired";
                send(exchange, 409, ApiJson.error(code, "Folder selection is busy or expired"));
            } catch (Exception unavailable) {
                LOG.warn("Folder chooser unavailable", unavailable);
                send(exchange, 503, ApiJson.error("directory_picker_unavailable", "Could not open the folder chooser"));
            }
        });
    }

    public static void reveal(HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);
            var request = parseBody(exchange);
            var paths = resolveProject(request.get("projectId"));
            try (var activity = ProjectActivity.enter(paths.id)) {
                var target = NativeFileExplorer.target(paths.basePath, paths.tempPath, request.get("path"));
                var result = new JsonObject(); result.addProperty("status", "ok");
                result.addProperty("mode", NativeFileExplorer.reveal(target));
                send(exchange, 200, result.toString());
            } catch (IllegalArgumentException invalid) {
                send(exchange, 400, ApiJson.error("path_not_authorized", "Item is outside the authorized roots"));
            } catch (Exception unavailable) {
                LOG.warn("Native file explorer unavailable", unavailable);
                send(exchange, 503, ApiJson.error("native_explorer_unavailable", "Could not open the system file explorer"));
            }
        });
    }
}
