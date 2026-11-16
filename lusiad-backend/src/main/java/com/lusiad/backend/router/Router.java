package com.lusiad.backend.router;

import com.lusiad.backend.config.LocalApiAccess;
import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;

public abstract class Router implements RouterInterface {
    private final LocalApiAccess access;

    protected Router(LocalApiAccess access) { this.access = access; }

    protected boolean handleCors(HttpExchange exchange) throws IOException {
        return !access.authorize(exchange) || !com.lusiad.backend.config.RuntimeEnvironment.authorize(exchange);
    }
}
