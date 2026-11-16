package com.lusiad.backend.config;

import com.lusiad.backend.handler.ApiJson;
import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Browser traffic goes through Next. Only Next and local tooling holding the private token call the API. */
public final class LocalApiAccess {
    private final String clientOrigin;
    private final byte[] token;
    public static final String TOKEN_HEADER = "X-Lusiad-Token";
    private static final Set<String> HEADERS = Set.of("content-type", "x-lusiad-token", "x-lusiad-test-run", "x-lusiad-test-config");

    public LocalApiAccess(String clientOrigin, String token) {
        this.clientOrigin = canonicalOrigin(clientOrigin);
        this.token = LocalApiToken.validate(token).getBytes(StandardCharsets.UTF_8);
    }

    private static String canonicalOrigin(String value) {
        URI uri = OperationalSettings.origin(value, "LUSIAD_FRONTEND_URL");
        int port = uri.getPort() == -1 ? (uri.getScheme().equals("https") ? 443 : 80) : uri.getPort();
        return uri.getScheme().toLowerCase(Locale.ROOT) + "://" + uri.getHost().toLowerCase(Locale.ROOT) + ":" + port;
    }

    public boolean authorize(HttpExchange exchange) throws IOException {
        var headers = exchange.getRequestHeaders();
        try {
            List<String> hosts = headers.get("Host");
            if (hosts == null || hosts.size() != 1) return refuse(exchange, 403, "Invalid API host");
            URI host = URI.create("http://" + hosts.getFirst());
            int port = host.getPort() == -1 ? 80 : host.getPort();
            if (host.getHost() == null || !Set.of("127.0.0.1", "localhost").contains(host.getHost().toLowerCase(Locale.ROOT)) || host.getRawUserInfo() != null
                    || !host.getPath().isEmpty() || host.getQuery() != null || host.getFragment() != null
                    || port != exchange.getLocalAddress().getPort()) return refuse(exchange, 403, "Invalid API host");
            List<String> origins = headers.get("Origin");
            if (origins != null) {
                if (origins.size() != 1 || !clientOrigin.equals(canonicalOrigin(origins.getFirst()))) {
                    return refuse(exchange, 403, "Client origin is not allowed");
                }
                exchange.getResponseHeaders().set("Access-Control-Allow-Origin", origins.getFirst());
                exchange.getResponseHeaders().set("Vary", "Origin");
            }
            if ("OPTIONS".equals(exchange.getRequestMethod())) {
                String method = headers.getFirst("Access-Control-Request-Method");
                String requested = headers.getFirst("Access-Control-Request-Headers");
                boolean runtime = exchange.getRequestURI().getPath().startsWith("/_lusiad/");
                if (origins == null || !(runtime ? "GET" : "POST").equals(method)) return refuse(exchange, 403, "Invalid preflight");
                if (requested != null) for (String header : requested.split(",")) {
                    if (!HEADERS.contains(header.trim().toLowerCase(Locale.ROOT))) return refuse(exchange, 403, "Header is not allowed");
                }
                exchange.getResponseHeaders().set("Access-Control-Allow-Methods", runtime ? "GET" : "POST");
                exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, X-Lusiad-Token, X-Lusiad-Test-Run, X-Lusiad-Test-Config");
                exchange.sendResponseHeaders(204, -1); exchange.close(); return false;
            }
            List<String> supplied = headers.get(TOKEN_HEADER);
            if (supplied == null || supplied.size() != 1 || supplied.getFirst().length() > 128
                    || !MessageDigest.isEqual(token, supplied.getFirst().getBytes(StandardCharsets.UTF_8))) {
                return refuse(exchange, 403, "Local API credential required; restart plugin/frontend with the same shared configuration");
            }
            if ("POST".equals(exchange.getRequestMethod())) {
                String type = headers.getFirst("Content-Type");
                if (type == null || !"application/json".equalsIgnoreCase(type.split(";", 2)[0].trim())) {
                    RuntimeEnvironment.send(exchange, 415, ApiJson.error("unsupported_media_type", "Content-Type must be application/json"));
                    return false;
                }
            }
            return true;
        } catch (IllegalArgumentException invalid) { return refuse(exchange, 403, "Invalid client origin or API host"); }
    }

    private static boolean refuse(HttpExchange exchange, int status, String message) throws IOException {
        RuntimeEnvironment.send(exchange, status, ApiJson.error("client_not_authorized", message));
        return false;
    }
}
