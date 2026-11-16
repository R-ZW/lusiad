package com.lusiad.backend.router.project;

import com.lusiad.backend.config.LocalApiAccess;
import com.lusiad.backend.handler.*;
import com.lusiad.backend.router.Router;
import com.lusiad.toolwindow.ProjectPresence;

public final class ProjectPresenceRouter extends Router {
    public ProjectPresenceRouter(LocalApiAccess access){super(access);}
    public void register(com.sun.net.httpserver.HttpServer server){
        server.createContext("/ide/projects",exchange->{if(handleCors(exchange))return;new Handler().handle(exchange);});
    }
    private static final class Handler extends BaseHandler {
        private static final com.intellij.openapi.diagnostic.Logger LOG=com.intellij.openapi.diagnostic.Logger.getInstance(Handler.class);
        void handle(com.sun.net.httpserver.HttpExchange exchange){handleSafely(exchange,LOG,()->{
            requirePost(exchange);var req=parseBody(exchange);
            try{
                if("presence".equals(req.get("action"))){ProjectPresence.heartbeat(Integer.parseInt(req.get("projectId")),req.get("tabId"),"true".equals(req.get("close")));send(exchange,200,"{\"status\":\"ok\"}");}
                else if("status".equals(req.get("action")))send(exchange,200,ProjectPresence.snapshot().toString());
                else send(exchange,400,ApiJson.error("invalid_request","Invalid presence action"));
            }catch(IllegalArgumentException e){send(exchange,400,ApiJson.error("invalid_request","Invalid presence"));}
            catch(Exception e){send(exchange,503,ApiJson.error("ide_status_unavailable","IDE status unavailable"));}
        });}
    }
}
