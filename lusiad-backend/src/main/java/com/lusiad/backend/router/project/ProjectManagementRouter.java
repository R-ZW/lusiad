package com.lusiad.backend.router.project;

import com.intellij.openapi.project.Project;
import com.lusiad.backend.config.LocalApiAccess;
import com.lusiad.backend.handler.*;
import com.lusiad.backend.repository.sql.*;
import com.lusiad.backend.router.Router;
import com.lusiad.backend.service.project.ProjectManagementService;
import java.util.List;

public final class ProjectManagementRouter extends Router {
    private final Handler handler;
    public ProjectManagementRouter(Project host,LocalApiAccess access){super(access);handler=new Handler(host);}
    public void register(com.sun.net.httpserver.HttpServer server){
        for(String action:List.of("read","update","preview","apply","operations","recover"))server.createContext("/projects/"+action,exchange->{if(!handleCors(exchange))handler.handle(exchange);});
    }
    private static final class Handler extends BaseHandler {
        private static final com.intellij.openapi.diagnostic.Logger LOG=com.intellij.openapi.diagnostic.Logger.getInstance(Handler.class);
        final ProjectManagementService service;
        Handler(Project host){service=new ProjectManagementService(new SqlConnectionFactory(SqlConnectionConfig.load()),host.getBasePath());}
        void handle(com.sun.net.httpserver.HttpExchange exchange){handleSafely(exchange,LOG,()->{
            requirePost(exchange);var req=parseBody(exchange);String action=exchange.getRequestURI().getPath().substring(10);
            try {
                int id=req.containsKey("projectId")?Integer.parseInt(req.get("projectId")):0;
                var result=switch(action){
                    case "read"->service.read(id);
                    case "update"->service.update(id,req.get("registryRevision"),req.get("name"),req.get("description"));
                    case "preview"->service.preview(id,req.get("adminAction"),req.get("newPath"));
                    case "apply"->service.apply(id,req.get("adminAction"),req.get("newPath"),req.get("registryRevision"),req.get("confirmation"),req.get("requestId"));
                    case "operations"->service.operations();
                    case "recover"->service.recover(id,req.get("requestId"));
                    default->throw new IllegalArgumentException("Unknown project administration action");
                };
                send(exchange,200,result.toString());
            }catch(ProjectManagementService.Failure failure){send(exchange,failure.code.equals("project_not_found")?404:409,ApiJson.error(failure.code,failure.code));}
            catch(Exception failure){LOG.warn("Project administration failed",failure);send(exchange,503,ApiJson.error("project_operation_failed","Project operation could not be confirmed. Inspect or recover its receipt before retrying."));}
        });}
    }
}
