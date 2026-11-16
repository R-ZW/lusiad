package com.lusiad.backend.handler.uml;

import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.lusiad.backend.handler.ApiJson;
import com.lusiad.backend.handler.BaseHandler;
import com.lusiad.backend.service.uml.UmlService;
import com.sun.net.httpserver.HttpExchange;

public final class UmlHandler extends BaseHandler {
    private static final Logger LOG = Logger.getInstance(UmlHandler.class);
    public static void render(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);
            var request = parseBody(exchange);
            resolveProject(request.get("projectId"));
            try { send(exchange, 200, UmlService.render(project, request)); }
            catch (IllegalArgumentException invalid) {
                send(exchange, 400, ApiJson.error("uml_invalid_request", invalid.getMessage()));
            } catch (Exception | LinkageError failure) {
                LOG.warn("Local UML generation failed", failure);
                send(exchange, 503, ApiJson.error("uml_generation_failed", "Local UML generation failed"));
            }
        });
    }
    public static void current(Project project, HttpExchange exchange) {
        handleSafely(exchange, LOG, () -> {
            requirePost(exchange);
            var request = parseBody(exchange);
            resolveProject(request.get("projectId"));
            try { send(exchange, 200, UmlService.renderCurrent(project, request)); }
            catch (IllegalArgumentException invalid) {
                send(exchange, 400, ApiJson.error("uml_invalid_request", invalid.getMessage()));
            } catch (Exception | LinkageError failure) {
                LOG.warn("Local current UML generation failed", failure);
                send(exchange, 503, ApiJson.error("uml_generation_failed", "Local UML generation failed"));
            }
        });
    }
}
