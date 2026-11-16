package com.lusiad.backend.service.project;

import com.google.gson.*;
import com.lusiad.backend.config.OperationalSettings;
import com.lusiad.backend.repository.sql.SqlConnectionFactory;
import com.lusiad.backend.service.psi.EditCoordinator;
import com.lusiad.backend.service.psi.ProjectEditLock;
import com.lusiad.backend.service.undo.ResourceEdits;
import com.lusiad.backend.service.undo.UndoRegistry;
import java.nio.file.*;
import java.sql.*;
import java.util.*;

/** Registration administration. Source deletion is explicitly staged, never a cascading filesystem delete. */
public final class ProjectManagementService {
    private static final com.intellij.openapi.diagnostic.Logger LOG=com.intellij.openapi.diagnostic.Logger.getInstance(ProjectManagementService.class);
    public static final class Failure extends RuntimeException {
        public final String code;
        public Failure(String code) { super(code); this.code = code; }
    }
    private final SqlConnectionFactory factory;
    private final String hostRoot;
    public ProjectManagementService(SqlConnectionFactory factory, String hostRoot) { this.factory = factory; this.hostRoot = hostRoot; }
    private record Registration(int id, String name, String description, String path, String temporary) {}
    public JsonObject read(int id) throws Exception {
        try (var c = factory.openConnection()) { return view(c, registration(c, id)); }
    }
    public JsonObject update(int id, String revision, String name, String description) throws Exception {
        name = name == null ? "" : name.trim(); description = description == null ? "" : description.trim();
        if (name.isEmpty() || name.length() > 255 || description.length() > 16384) throw new Failure("project_invalid_fields");
        try (var locks = new Locks(id)) {
            Registration project = registration(locks.c, id);
            requireRevision(view(locks.c, project).get("revision").getAsString(), revision);
            try (var s = locks.c.prepareStatement("UPDATE projects SET name=?,description=? WHERE id=?")) {
                s.setString(1, name); s.setString(2, description); s.setInt(3,id); s.executeUpdate();
            }
            return view(locks.c, registration(locks.c,id));
        }
    }
    public JsonObject preview(int id, String kind, String destination) throws Exception {
        try (var locks = new Locks(id)) {
            Registration project = registration(locks.c,id);
            Path root = ProjectFiles.root(project.path);
            try (var disk = Files.isDirectory(root) ? ProjectEditLock.acquire(root.toString()) : null) {
                return plan(locks.c,project,kind,destination);
            }
        }
    }
    public JsonObject apply(int id, String kind, String destination, String revision, String confirmation, String requestId) throws Exception {
        UUID.fromString(requestId);
        try (var locks = new Locks(id,true)) {
            JsonObject existing = operation(locks.c,requestId);
            if (existing != null) {
                if (existing.get("projectId").getAsInt()!=id || !kind.equals(existing.get("kind").getAsString())
                    || !EditCoordinator.hash(kind+"\n"+revision).equals(existing.get("requestHash").getAsString())) throw new Failure("project_stale");
                return recoverLocked(locks.c,existing);
            }
            Registration project=registration(locks.c,id);
            if (!Objects.equals(project.name,confirmation)) throw new Failure("project_confirmation_required");
            Path original=ProjectFiles.root(project.path);
            Path lockRoot=kind.equals("relink") ? ProjectFiles.root(destination) : original;
            try (var disk=Files.isDirectory(lockRoot) ? ProjectEditLock.acquire(lockRoot.toString()) : null) {
                JsonObject plan=plan(locks.c,project,kind,destination);
                requireRevision(plan.get("revision").getAsString(),revision);
                JsonObject payload=plan.deepCopy(); payload.add("settings",ProjectJavaSettings.capture(original,Set.of("relink","move").contains(kind) ? ProjectFiles.root(plan.get("newPath").getAsString()) : null));
                try (var s=locks.c.prepareStatement("INSERT INTO lusiad_project_operations(operation_id,project_id,kind,state,payload,request_hash) VALUES(?,?,?,'prepared',?,?)")) {
                    s.setString(1,requestId);s.setInt(2,id);s.setString(3,kind);s.setString(4,payload.toString());s.setString(5,EditCoordinator.hash(kind+"\n"+revision));s.executeUpdate();
                }
                try {
                    if (kind.equals("move")) ProjectDirectoryMove.apply(original,ProjectFiles.root(plan.get("newPath").getAsString()),plan.get("treeRevision").getAsString());
                    if (kind.equals("delete")) Files.move(original,ProjectFiles.trash(original,requestId),StandardCopyOption.ATOMIC_MOVE);
                    ProjectJavaSettings.apply(payload.getAsJsonObject("settings"),true);
                    locks.c.setAutoCommit(false);
                    if (Set.of("relink","move").contains(kind)) {
                        try (var s=locks.c.prepareStatement("UPDATE projects SET path=? WHERE id=?")) {
                            s.setString(1,plan.get("newPath").getAsString());s.setInt(2,id);s.executeUpdate();
                        }
                    } else ProjectRemovalSql.remove(locks.c,id);
                    setState(locks.c,requestId,"applied",false);
                    locks.c.commit();
                    locks.c.setAutoCommit(true);
                } catch (Exception failure) {
                    // Do not guess rollback after losing COMMIT. Release this session, then reconcile
                    // the durable receipt under fresh locks via the explicit recovery action.
                    try { locks.c.rollback(); } catch (Exception ignored) { }
                    throw new Failure("project_recovery_required");
                }
                UndoRegistry.clearProject(id);
                return finish(locks.c,operation(locks.c,requestId));
            }
        }
    }
    public JsonObject recover(int id,String requestId) throws Exception {
        UUID.fromString(requestId);
        try (var locks=new Locks(id,true)) {
            JsonObject op=operation(locks.c,requestId);
            if(op==null || op.get("projectId").getAsInt()!=id)throw new Failure("project_not_found");
            return recoverLocked(locks.c,op);
        }
    }
    private JsonObject recoverLocked(Connection c,JsonObject op) throws Exception {
        if(op.get("state").getAsString().equals("prepared")) {
            var payload=op.getAsJsonObject("payload");
            Registration project=registration(c,op.get("projectId").getAsInt());
            if(!project.path.equals(payload.get("path").getAsString()))throw new Failure("project_recovery_required");
            Path root=ProjectFiles.root(project.path);
            boolean moving=payload.get("kind").getAsString().equals("move");
            Path target=moving ? ProjectFiles.root(payload.get("newPath").getAsString()) : null;
            Path diskRoot=Files.exists(root) ? root : moving ? target : ProjectFiles.trash(root,op.get("operationId").getAsString());
            try(var disk=Files.isDirectory(diskRoot) ? ProjectEditLock.acquire(diskRoot.toString()) : null) {
                if(payload.get("kind").getAsString().equals("delete") && Files.exists(ProjectFiles.trash(root,op.get("operationId").getAsString())))
                    distinct(c,project.id,ProjectFiles.trash(root,op.get("operationId").getAsString()));
                if(moving) { distinct(c,project.id,root); distinct(c,project.id,target); }
                rollback(payload,op.get("operationId").getAsString());
                refreshPaths(root,target);
                setState(c,op.get("operationId").getAsString(),"aborted",true);
            }
            op=operation(c,op.get("operationId").getAsString());
        }
        return finish(c,op);
    }
    private void rollback(JsonObject payload,String requestId) throws Exception {
        Path original=ProjectFiles.root(payload.get("path").getAsString());
        if(payload.get("kind").getAsString().equals("move"))
            ProjectDirectoryMove.rollback(original,ProjectFiles.root(payload.get("newPath").getAsString()),payload.get("treeRevision").getAsString());
        if(payload.get("kind").getAsString().equals("delete")) {
            Path staged=ProjectFiles.trash(original,requestId);
            if(Files.exists(staged,LinkOption.NOFOLLOW_LINKS)) {
                if(Files.exists(original,LinkOption.NOFOLLOW_LINKS))throw new Failure("project_recovery_required");
                ProjectFiles.inspect(staged);
                Files.move(staged,original,StandardCopyOption.ATOMIC_MOVE);
            } else if(!Files.isDirectory(original))throw new Failure("project_recovery_required");
        }
        ProjectJavaSettings.apply(payload.getAsJsonObject("settings"),false);
    }
    private JsonObject finish(Connection c,JsonObject op) throws Exception {
        String state=op.get("state").getAsString(),id=op.get("operationId").getAsString();
        if(state.equals("applied")) {
            UndoRegistry.clearProject(op.get("projectId").getAsInt());
            try {
                JsonObject payload=op.getAsJsonObject("payload");
                Path root=ProjectFiles.root(payload.get("path").getAsString());
                if(op.get("kind").getAsString().equals("delete")) {
                    distinct(c,op.get("projectId").getAsInt(),ProjectFiles.trash(root,id));
                    ProjectFiles.purge(root,ProjectFiles.trash(root,id),id);
                }
                boolean relocating=Set.of("relink","move").contains(op.get("kind").getAsString());
                Path target=relocating ? ProjectFiles.root(payload.get("newPath").getAsString()) : null;
                if(op.get("kind").getAsString().equals("move")) {
                    Registration published=registration(c,op.get("projectId").getAsInt());
                    if(!ProjectFiles.key(ProjectFiles.root(published.path)).equals(ProjectFiles.key(target)) || Files.exists(root,LinkOption.NOFOLLOW_LINKS))
                        throw new Failure("project_recovery_required");
                    distinct(c,published.id,target);
                    ProjectDirectoryMove.verify(target,payload.get("treeRevision").getAsString());
                    ProjectJavaSettings.apply(payload.getAsJsonObject("settings"),true);
                }
                refreshPaths(root,target);
                setState(c,id,"completed",true);state="completed";
            } catch(Exception failure) {
                LOG.warn("Project operation "+id+" is published but cleanup is incomplete",failure);
                JsonObject result=ok();result.addProperty("operationId",id);result.addProperty("state","applied");
                result.addProperty("completed",false);result.addProperty("code","project_cleanup_pending");return result;
            }
        }
        JsonObject result=ok();result.addProperty("operationId",id);result.addProperty("state",state);
        result.addProperty("completed",state.equals("completed"));return result;
    }
    public JsonObject operations() throws Exception {
        try(var c=factory.openConnection()) {
            schema(c);JsonArray items=new JsonArray();
            try(var s=c.prepareStatement("SELECT operation_id,project_id,kind,state,payload FROM lusiad_project_operations WHERE state IN ('prepared','applied') ORDER BY created_at,operation_id");var rows=s.executeQuery()) {
                while(rows.next()) {
                    JsonObject item=new JsonObject();item.addProperty("operationId",rows.getString(1));item.addProperty("projectId",rows.getInt(2));item.addProperty("kind",rows.getString(3));item.addProperty("state",rows.getString(4));
                    var payload=JsonParser.parseString(rows.getString(5)).getAsJsonObject();String path=payload.get("path").getAsString();item.addProperty("path",path);
                    if(rows.getString(3).equals("move"))item.addProperty("newPath",payload.get("newPath").getAsString());
                    if(rows.getString(3).equals("delete"))item.addProperty("stagedPath",ProjectFiles.trash(ProjectFiles.root(path),rows.getString(1)).toString());
                    items.add(item);
                }
            }
            var result=ok();result.add("operations",items);return result;
        }
    }
    private JsonObject plan(Connection c,Registration p,String kind,String destination) throws Exception {
        if(!Set.of("remove","delete","relink","move").contains(kind))throw new Failure("project_invalid_fields");
        if(kind.equals("move")) requireMoveSchema(c);
        ready(c,p,kind.equals("relink"));
        Path root=ProjectFiles.root(p.path);
        requireSavedDocuments(root);
        JsonObject result=view(c,p);result.addProperty("kind",kind);
        if(kind.equals("relink")) {
            Path target=ProjectFiles.root(destination);
            if(Files.exists(root,LinkOption.NOFOLLOW_LINKS))throw new Failure("project_original_exists");
            if(!Files.isDirectory(target) || Files.isSymbolicLink(target))throw new Failure("project_invalid_path");
            target=target.toRealPath();distinct(c,p.id,target);
            if(p.temporary!=null && ProjectFiles.overlap(target,ProjectFiles.physical(Path.of(p.temporary))))throw new Failure("project_protected_path");
            verifyGitIdentity(c,p.id,target);
            result.addProperty("newPath",target.toString());
            result.addProperty("treeRevision",ProjectFiles.inspect(target).revision());
            result.addProperty("contextRevision",EditCoordinator.hash(ProjectJavaSettings.capture(root,target).toString()));
        } else if(kind.equals("move")) {
            protect(c,p,root,true);
            Path target=ProjectDirectoryMove.destination(root,ProjectFiles.root(destination));
            distinct(c,p.id,target);
            if(hostRoot!=null && ProjectFiles.overlap(target,ProjectFiles.physical(Path.of(hostRoot))))throw new Failure("project_host_path");
            if(p.temporary!=null && ProjectFiles.overlap(target,ProjectFiles.physical(Path.of(p.temporary))))throw new Failure("project_protected_path");
            if(ProjectFiles.overlap(target,ProjectFiles.physical(OperationalSettings.load().configFile)))throw new Failure("project_protected_path");
            verifyGitIdentity(c,p.id,root);
            var tree=ProjectFiles.inspect(root);
            result.addProperty("newPath",target.toString());
            result.addProperty("destinationDirectory",target.getParent().toString());
            result.addProperty("treeRevision",tree.revision());
            result.addProperty("files",tree.files());result.addProperty("bytes",tree.bytes());
            result.addProperty("contextRevision",EditCoordinator.hash(ProjectJavaSettings.capture(root,target).toString()));
        } else if(kind.equals("delete")) {
            protect(c,p,root);
            var tree=ProjectFiles.inspect(root);result.addProperty("treeRevision",tree.revision());
            result.addProperty("files",tree.files());result.addProperty("bytes",tree.bytes());
        }
        // Unregister keeps snapshots for explicit manual inspection; never guess ownership from a saved path.
        result.addProperty("snapshotsRetained",p.temporary==null ? "" : p.temporary);
        result.addProperty("revision",EditCoordinator.hash(result.toString()));return result;
    }
    private void ready(Connection c,Registration p,boolean relink) throws Exception {
        requireNoPendingAdministration(c,p.id);
        if(!relink && (count(c,"SELECT COUNT(*) FROM changes WHERE project_id=? AND commit_id IS NULL",p.id)>0
            ||count(c,"SELECT COUNT(*) FROM external_sync_projects WHERE project_id=? AND pending_bundle_change_id IS NOT NULL",p.id)>0))
            throw new Failure("project_pending_changes");
        for(String table:List.of("lusiad_edit_operations","lusiad_git_operations","lusiad_sync_operations"))
            if(count(c,"SELECT COUNT(*) FROM "+table+" WHERE project_id=? AND state='prepared'",p.id)>0)throw new Failure("project_recovery_required");
        if(!relink && Files.isDirectory(Path.of(p.path)) && count(c,"SELECT COUNT(*) FROM external_sync_projects WHERE project_id=?",p.id)>0) {
            Map<String,String> expected=new TreeMap<>();
            try(var s=c.prepareStatement("SELECT path,kind,sha256 FROM external_sync_files WHERE project_id=?")) {s.setInt(1,p.id);try(var rows=s.executeQuery()){while(rows.next())expected.put(rows.getString(1),rows.getString(2)+":"+rows.getString(3));}}
            if(!expected.equals(ResourceEdits.projectHashes(p.path)))throw new Failure("project_external_changes");
        }
        ProjectRemovalSql.checkReferences(c,p.id);
    }
    private void protect(Connection c,Registration p,Path root) throws Exception { protect(c,p,root,false); }
    private void protect(Connection c,Registration p,Path root,boolean moving) throws Exception {
        Path actual=root.toRealPath();
        if(root.getParent()==null || (!moving && root.getNameCount()<2) || ProjectFiles.key(actual).equals(ProjectFiles.key(Path.of(System.getProperty("user.home")))))throw new Failure("project_protected_path");
        if(hostRoot!=null && ProjectFiles.overlap(actual,ProjectFiles.physical(Path.of(hostRoot))))throw new Failure("project_host_path");
        if(Files.isRegularFile(root.resolve(".git")))throw new Failure("project_linked_path");
        distinct(c,p.id,actual);
        if(p.temporary!=null && ProjectFiles.overlap(actual,ProjectFiles.physical(Path.of(p.temporary))))throw new Failure("project_protected_path");
        if(OperationalSettings.load().configFile.toAbsolutePath().normalize().startsWith(actual))throw new Failure("project_protected_path");
    }
    private static void requireSavedDocuments(Path root) {
        boolean unsaved=com.intellij.openapi.application.ReadAction.compute(()->{
            var manager=com.intellij.openapi.fileEditor.FileDocumentManager.getInstance();
            for(var document:manager.getUnsavedDocuments()) {
                var file=manager.getFile(document);
                if(file!=null && Path.of(file.getPath()).toAbsolutePath().normalize().startsWith(root))return true;
            }
            return false;
        });
        if(unsaved)throw new Failure("project_unsaved_documents");
    }
    private static void refreshPaths(Path oldRoot,Path newRoot) {
        List<java.io.File> roots=new ArrayList<>();
        if(oldRoot.getParent()!=null)roots.add(oldRoot.getParent().toFile());
        if(newRoot!=null && newRoot.getParent()!=null)roots.add(newRoot.getParent().toFile());
        com.intellij.openapi.vfs.LocalFileSystem.getInstance().refreshIoFiles(roots,true,true,null);
    }
    private static void distinct(Connection c,int id,Path target) throws Exception {
        try(var s=c.prepareStatement("SELECT id,path,temp_path FROM projects WHERE id<>?")) {s.setInt(1,id);try(var rows=s.executeQuery()){while(rows.next()){
            if(ProjectFiles.overlap(target,ProjectFiles.physical(Path.of(rows.getString(2)))))throw new Failure("project_path_conflict");
            if(rows.getString(3)!=null && ProjectFiles.overlap(target,ProjectFiles.physical(Path.of(rows.getString(3)))))throw new Failure("project_protected_path");
        }}}
    }
    private static void verifyGitIdentity(Connection c,int id,Path root) throws Exception {
        String sha=null,branch=null;
        try(var s=c.prepareStatement("SELECT c.git_id,b.name FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=? AND b.selected='1' ORDER BY c.id DESC LIMIT 1")) {
            s.setInt(1,id);try(var rows=s.executeQuery()){if(rows.next()){sha=rows.getString(1);branch=rows.getString(2);}}
        }
        if(sha==null) {
            if(count(c,"SELECT COUNT(*) FROM changes WHERE project_id=?",id)>0) {
                if(count(c,"SELECT COUNT(*) FROM external_sync_projects WHERE project_id=?",id)==0)throw new Failure("project_identity_unverified");
                Map<String,String> expected=new TreeMap<>();
                try(var s=c.prepareStatement("SELECT path,kind,sha256 FROM external_sync_files WHERE project_id=?")){s.setInt(1,id);try(var rows=s.executeQuery()){while(rows.next())expected.put(rows.getString(1),rows.getString(2)+":"+rows.getString(3));}}
                if(!expected.equals(ResourceEdits.projectHashes(root.toString())))throw new Failure("project_identity_unverified");
            }
            return;
        }
        for(var command:List.of(new String[]{"rev-parse","--verify","HEAD"},new String[]{"symbolic-ref","--quiet","--short","HEAD"})) {
            List<String> args=new ArrayList<>(List.of("git","-C",root.toString()));args.addAll(Arrays.asList(command));
            ProcessBuilder builder=new ProcessBuilder(args).redirectErrorStream(true);
            builder.environment().keySet().removeIf(key->key.startsWith("GIT_") && !key.equals("GIT_EXEC_PATH"));
            Process process=builder.start();
            try {
                if(!process.waitFor(5,java.util.concurrent.TimeUnit.SECONDS))throw new Failure("project_identity_unverified");
                String output=new String(process.getInputStream().readNBytes(4096),java.nio.charset.StandardCharsets.UTF_8).trim();
                if(process.exitValue()!=0 || !output.equals(command[0].equals("rev-parse")?sha:branch))throw new Failure("project_identity_unverified");
            } finally {process.destroyForcibly();}
        }
    }
    private static Registration registration(Connection c,int id) throws Exception {
        try(var s=c.prepareStatement("SELECT id,name,description,path,temp_path FROM projects WHERE id=?")){s.setInt(1,id);try(var rows=s.executeQuery()){
            if(!rows.next())throw new Failure("project_not_found");
            return new Registration(id,Objects.toString(rows.getString(2),""),Objects.toString(rows.getString(3),""),rows.getString(4),rows.getString(5));
        }}
    }
    private static JsonObject view(Connection c,Registration p) throws Exception {
        JsonObject value=ok();value.addProperty("id",p.id);value.addProperty("name",p.name);value.addProperty("description",p.description);value.addProperty("path",p.path);
        value.addProperty("pending",count(c,"SELECT COUNT(*) FROM changes WHERE project_id=? AND commit_id IS NULL",p.id));
        value.addProperty("changes",count(c,"SELECT COUNT(*) FROM changes WHERE project_id=?",p.id));
        value.addProperty("commits",count(c,"SELECT COUNT(*) FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=?",p.id));
        value.addProperty("tags",count(c,"SELECT COUNT(*) FROM lusiad_history_tags WHERE project_id=?",p.id));
        value.addProperty("revision",EditCoordinator.hash(value.toString()));return value;
    }
    public static void requireNoPendingAdministration(Connection c,int id) throws SQLException {
        try { if(count(c,"SELECT COUNT(*) FROM lusiad_project_operations WHERE project_id=? AND state IN ('prepared','applied')",id)>0)throw new Failure("project_recovery_required"); }
        catch(SQLException missing) { if(missing.getErrorCode()!=1146)throw missing; } // Existing features remain usable until manual migration.
    }
    private static void requireMoveSchema(Connection c) throws SQLException {
        try(var s=c.prepareStatement("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='lusiad_project_operations' AND COLUMN_NAME='kind'");var rows=s.executeQuery()) {
            if(!rows.next() || !rows.getString(1).contains("'move'"))throw new Failure("project_move_migration_required");
        }
    }
    private static void schema(Connection c) throws SQLException {
        try(var s=c.prepareStatement("SELECT operation_id FROM lusiad_project_operations LIMIT 0")){s.executeQuery().close();}
        catch(SQLException missing){if(missing.getErrorCode()==1146)throw new Failure("project_migration_required");throw missing;}
    }
    private static long count(Connection c,String sql,int id) throws SQLException {
        try(var s=c.prepareStatement(sql)){s.setInt(1,id);try(var rows=s.executeQuery()){rows.next();return rows.getLong(1);}}
    }
    private static JsonObject operation(Connection c,String id) throws SQLException {
        try(var s=c.prepareStatement("SELECT project_id,kind,state,payload,request_hash FROM lusiad_project_operations WHERE operation_id=?")){s.setString(1,id);try(var rows=s.executeQuery()){
            if(!rows.next())return null;JsonObject result=ok();result.addProperty("operationId",id);result.addProperty("projectId",rows.getInt(1));result.addProperty("kind",rows.getString(2));result.addProperty("state",rows.getString(3));
            result.addProperty("requestHash",rows.getString(5));
            if(rows.getString(4)!=null)result.add("payload",JsonParser.parseString(rows.getString(4)));return result;
        }}
    }
    private static void setState(Connection c,String id,String state,boolean clear) throws SQLException {
        try(var s=c.prepareStatement("UPDATE lusiad_project_operations SET state=?"+(clear?",payload=NULL":"")+" WHERE operation_id=?")){s.setString(1,state);s.setString(2,id);s.executeUpdate();}
    }
    private static void requireRevision(String actual,String expected){if(!actual.equals(expected))throw new Failure("project_stale");}
    private static JsonObject ok(){JsonObject v=new JsonObject();v.addProperty("status","ok");return v;}
    private final class Locks implements AutoCloseable {
        final Connection c; final ProjectActivity.Lease activity; final List<String> held=new ArrayList<>();
        Locks(int id) throws Exception {this(id,false);}
        Locks(int id,boolean recovery) throws Exception {
            activity=ProjectActivity.administer(id);
            Connection opened=null;
            try {
                opened=factory.openConnection();c=opened;schema(c);
                String database;try(var s=c.createStatement();var r=s.executeQuery("SELECT DATABASE()")){r.next();database=r.getString(1);}
                for(String lock:List.of("lusiad:registry","lusiad:external-sync:"+id,"lusiad:edit:"+EditCoordinator.hash(database+":"+id).substring(0,40))) {
                    try(var s=c.prepareStatement("SELECT GET_LOCK(?,5)")){s.setString(1,lock);try(var r=s.executeQuery()){if(!r.next()||r.getInt(1)!=1)throw new Failure("project_busy");}}
                    held.add(lock);
                }
                if(!recovery)requireNoPendingAdministration(c,id);
            } catch(Exception error){if(opened!=null)opened.close();activity.close();throw error;}
        }
        public void close() throws Exception {
            try {for(int i=held.size()-1;i>=0;i--)try(var s=c.prepareStatement("SELECT RELEASE_LOCK(?)")){s.setString(1,held.get(i));s.execute();}}
            finally{try{c.close();}finally{activity.close();}}
        }
    }
}
