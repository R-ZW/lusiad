package com.lusiad.toolwindow;

import com.google.gson.*;
import com.intellij.openapi.application.ReadAction;
import com.intellij.openapi.project.ProjectManager;
import com.lusiad.backend.repository.sql.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Live IDE state plus expiring browser-tab leases, never SQL history. */
public final class ProjectPresence {
    private record Lease(int project,long seen,boolean closed){}
    private record IdeProject(String name,String path){}
    private static final Map<String,Lease> WEB=new ConcurrentHashMap<>();
    private ProjectPresence(){}
    public static void heartbeat(int id,String tab,boolean close){
        if(id<=0||tab==null||!tab.matches("[a-zA-Z0-9-]{16,64}"))throw new IllegalArgumentException("Invalid presence");
        WEB.entrySet().removeIf(e->System.currentTimeMillis()-e.getValue().seen()>45000);
        if(WEB.size()>=512&&!WEB.containsKey(tab))throw new IllegalStateException("Presence capacity reached");
        if(close){WEB.compute(tab,(key,value)->value==null||value.project()==id?new Lease(id,System.currentTimeMillis(),true):value);return;}
        WEB.compute(tab,(key,value)->value!=null&&value.closed()?value:new Lease(id,System.currentTimeMillis(),false));
    }
    public static boolean webOpen(int id){return WEB.values().stream().anyMatch(v->!v.closed()&&v.project()==id&&System.currentTimeMillis()-v.seen()<45000);}
    public static String key(String value){try{var p=Path.of(value);String s=(Files.exists(p)?p.toRealPath():p.toAbsolutePath().normalize()).toString();return System.getProperty("os.name","").startsWith("Windows")?s.toLowerCase(Locale.ROOT):s;}catch(Exception e){return value;}}
    public static boolean ideOpen(String path){return openProjects().stream().anyMatch(p->key(p.path()).equals(key(path)));}
    private static List<IdeProject> openProjects(){return ReadAction.compute(()->{
        List<IdeProject> result=new ArrayList<>();for(var p:ProjectManager.getInstance().getOpenProjects())if(!p.isDisposed()&&p.getBasePath()!=null)result.add(new IdeProject(p.getName(),p.getBasePath()));return List.copyOf(result);
    });}
    public static JsonObject snapshot()throws Exception{
        var ide=openProjects();var rows=new JsonArray();Set<String> registered=new HashSet<>();
        try(var c=new SqlConnectionFactory(SqlConnectionConfig.load()).openConnection(3000,3000);var s=c.prepareStatement("SELECT id,path FROM projects");var r=s.executeQuery()){
            while(r.next()){int id=r.getInt(1);String path=r.getString(2),key=key(path);registered.add(key);var row=new JsonObject();row.addProperty("projectId",id);row.addProperty("ideOpen",ide.stream().anyMatch(p->key(p.path()).equals(key)));row.addProperty("webOpen",webOpen(id));row.addProperty("directoryExists",Files.isDirectory(Path.of(path)));rows.add(row);}
        }
        var missing=new JsonArray();for(var p:ide)if(!registered.contains(key(p.path()))){var row=new JsonObject();row.addProperty("name",p.name());row.addProperty("path",p.path());missing.add(row);}
        var result=new JsonObject();result.addProperty("status","ok");result.addProperty("version",1);result.add("projects",rows);result.add("unregisteredIdeProjects",missing);return result;
    }
}
