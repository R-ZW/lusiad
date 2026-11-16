package com.lusiad.backend.router;

import com.sun.net.httpserver.HttpServer;

public interface RouterInterface {
    void register(HttpServer server);
}