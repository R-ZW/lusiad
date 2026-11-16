package com.lusiad.backend.repository.change;

import com.google.gson.Gson;
import com.intellij.openapi.application.ApplicationManager;
import com.lusiad.backend.repository.sql.SqlConnectionFactory;
import com.lusiad.backend.service.psi.EditCoordinator;
import java.sql.*;
import java.util.*;
import com.lusiad.backend.service.undo.*;
import com.google.gson.*;

/** One connection/project advisory lock; all calls take place outside IDE read/write actions. */
public final class EditOperationStore implements EditCoordinator.Store {
    private static final Gson JSON = new com.google.gson.GsonBuilder().serializeNulls().create();
    private final Connection connection;
    private final int projectId;
    private final String root, lock;
    private final com.lusiad.backend.service.psi.ProjectEditLock fileLock;
    private final String boundary;

    public EditOperationStore(SqlConnectionFactory factory, int projectId, String root) throws Exception {
        var app = ApplicationManager.getApplication();
        if (app != null && (app.isWriteAccessAllowed() || app.isReadAccessAllowed() || app.isDispatchThread()))
            throw new IllegalStateException("Edit SQL must run on the request worker outside IDE locks");
        this.projectId = projectId; this.root = root;
        fileLock = com.lusiad.backend.service.psi.ProjectEditLock.acquire(root);
        try { connection = factory.openConnection(); }
        catch (Exception failure) { fileLock.close(); throw failure; }
        try {
            // Use the server's catalog name, exactly as Next's SELECT DATABASE().
            // JDBC may retain the configured spelling on case-insensitive Windows databases.
            String catalog;
            try (var s = connection.prepareStatement("SELECT DATABASE()"); var rows = s.executeQuery()) {
                if (!rows.next() || rows.getString(1) == null) throw new SQLException("Missing project database");
                catalog = rows.getString(1);
            }
            lock = "lusiad:edit:" + EditCoordinator.hash(catalog + ":" + projectId).substring(0, 40);
            try (var s = connection.prepareStatement("SELECT GET_LOCK(?, 5)")) {
                s.setString(1, lock);
                try (var rows = s.executeQuery()) { if (!rows.next() || rows.getInt(1) != 1) throw new SQLException("Project edit is busy"); }
            }
            com.lusiad.backend.service.project.ProjectManagementService.requireNoPendingAdministration(connection,projectId);
            try(var s=connection.prepareStatement("SELECT path FROM projects WHERE id=?")) {
                s.setInt(1,projectId);try(var rows=s.executeQuery()) {
                    if(!rows.next() || !com.lusiad.backend.service.project.ProjectFiles.key(java.nio.file.Path.of(rows.getString(1))).equals(com.lusiad.backend.service.project.ProjectFiles.key(java.nio.file.Path.of(root))))
                        throw new IllegalStateException("Project registration changed; reload before editing");
                }
            }
            boundary = boundaryValue();
            reconcileUndo();
        } catch (Exception failure) { try { connection.close(); } finally { fileLock.close(); } throw failure; }
    }

    public String boundary() { return boundary; }
    /** The rewind service shares this project's filesystem and SQL advisory locks. */
    public Connection rewindConnection() { return connection; }
    public int rewindProjectId() { return projectId; }
    public void requireRewindBaseline() throws Exception {
        for (String table : List.of("lusiad_edit_operations", "lusiad_git_operations", "lusiad_sync_operations")) {
            try (var query = connection.prepareStatement("SELECT 1 FROM " + table + " WHERE project_id=? AND state='prepared' LIMIT 1")) {
                query.setInt(1, projectId);
                try (var rows = query.executeQuery()) {
                    if (rows.next()) throw new EditCoordinator.Failure("operation_pending", "Recover the pending operation before returning to a change", null, null);
                }
            }
        }
        try (var query = connection.prepareStatement("SELECT path,kind,sha256 FROM external_sync_files WHERE project_id=?")) {
            query.setInt(1, projectId);
            Map<String,String> expected = new TreeMap<>();
            try (var rows = query.executeQuery()) {
                while (rows.next()) expected.put(rows.getString(1), rows.getString(2) + ":" + rows.getString(3));
            }
            try (var state = connection.prepareStatement("SELECT 1 FROM external_sync_projects WHERE project_id=?")) {
                state.setInt(1, projectId);
                try (var rows = state.executeQuery()) {
                    if (!rows.next()) throw new EditCoordinator.Failure("sync_review_required", "Initialize synchronization before returning to a change", null, null);
                }
            }
            if (!expected.equals(ResourceEdits.projectHashes(root)))
                throw new EditCoordinator.Failure("sync_review_required", "Review external changes before returning to a change", null, null);
        }
    }
    /** A toolbar poll is read-only and must never hold a filesystem/advisory writer lock. */
    public static JsonObject readUndoStatus(SqlConnectionFactory factory, int projectId, String root) throws Exception {
        try (var connection = factory.openConnection(); var query = connection.prepareStatement("SELECT (SELECT id FROM branches WHERE project_id=? AND selected='1'), (SELECT COALESCE(MAX(c.id),0) FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=?), (SELECT COUNT(*) FROM lusiad_sync_operations WHERE project_id=? AND state='applied' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.undoBoundary'))='true'), (SELECT COUNT(*) FROM lusiad_edit_operations WHERE project_id=? AND state='prepared') + (SELECT COUNT(*) FROM lusiad_git_operations WHERE project_id=? AND state='prepared') + (SELECT COUNT(*) FROM lusiad_sync_operations WHERE project_id=? AND state='prepared'), (SELECT pending_bundle_change_id FROM external_sync_projects WHERE project_id=?)")) {
            for (int i=1;i<=7;i++) query.setInt(i, projectId);
            try (var row = query.executeQuery()) {
                row.next(); String boundary = root + ":" + row.getObject(1) + ":" + row.getLong(2) + ":" + row.getLong(3);
                JsonObject result = UndoRegistry.projectedStatus(projectId, root, boundary);
                if (row.getLong(4) != 0 || row.getObject(5) != null) {
                    result.addProperty("blockedCode", row.getLong(4) != 0 ? "operation_pending" : "sync_review_required");
                    result.addProperty("blockedMessage", row.getLong(4) != 0 ? "Wait for the current operation or recover its receipt" : "Resolve the external bundle before undo/redo");
                }
                return result;
            }
        }
    }
    private String boundaryValue() throws Exception {
        try (var s = connection.prepareStatement("SELECT (SELECT COALESCE(MAX(c.id),0) FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=?), (SELECT COUNT(*) FROM lusiad_sync_operations WHERE project_id=? AND state='applied' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.undoBoundary'))='true')")) {
            s.setInt(1, projectId); s.setInt(2, projectId);
            try (var row = s.executeQuery()) { row.next(); return root + ":" + branch() + ":" + row.getLong(1) + ":" + row.getLong(2); }
        }
    }
    /** Reconcile same-Run acknowledgements lost after COMMIT; never reconstruct another Run's stack. */
    public void reconcileUndo() throws Exception {
        try (var s = connection.prepareStatement("SELECT id,req_body FROM changes WHERE project_id=? AND id>? AND JSON_UNQUOTE(JSON_EXTRACT(req_body,'$.undoSession'))=? AND JSON_UNQUOTE(JSON_EXTRACT(req_body,'$.undoBoundary'))=? ORDER BY id")) {
            s.setInt(1, projectId); s.setLong(2, UndoRegistry.lastChange(projectId, root, boundary)); s.setString(3, UndoRegistry.RUN); s.setString(4, boundary);
            try (var rows = s.executeQuery()) { while (rows.next()) {
                JsonObject body = JsonParser.parseString(rows.getString(2)).getAsJsonObject();
                JsonObject images = body.getAsJsonObject("resources");
                if (images == null) throw new IllegalStateException("Confirmed edit is missing its reversible images");
                UndoRegistry.acknowledge(projectId, root, boundary, body.get("operationId").getAsString(), rows.getLong(1),
                        ResourceImage.decode(images.get("before").toString()), ResourceImage.decode(images.get("after").toString()),
                        body.getAsJsonObject("changeMetadata"), body.get(body.has("resourcePath") ? "resourcePath" : "path").getAsString(), body.getAsJsonObject("navigation"));
            } }
        }
    }

    private Integer branch() throws Exception {
        try (var s = connection.prepareStatement("SELECT id FROM branches WHERE project_id=? AND selected='1'")) {
            s.setInt(1, projectId);
            try (var rows = s.executeQuery()) {
                Integer branch = rows.next() ? rows.getInt(1) : null;
                if (rows.next()) throw new SQLException("Ambiguous selected branch");
                return branch;
            }
        }
    }

    public List<EditCoordinator.Pending> pending() throws Exception {
        List<EditCoordinator.Pending> result = new ArrayList<>();
        try (var s = connection.prepareStatement("SELECT id,operation_id,branch_id,payload FROM lusiad_edit_operations WHERE project_id=? AND state='prepared' ORDER BY id")) {
            s.setInt(1, projectId);
            try (var rows = s.executeQuery()) {
                while (rows.next()) {
                    var payload = com.google.gson.JsonParser.parseString(rows.getString("payload")).getAsJsonObject();
                    var plan = JSON.fromJson(payload, EditCoordinator.Plan.class);
                    if (plan == null || plan.before() == null || plan.after() == null || plan.request() == null || !root.equals(plan.root())
                            || !payload.has("recordVersion") || !Set.of(2,3).contains(payload.get("recordVersion").getAsInt())
                            || !payload.has("beforeHash") || !EditCoordinator.hash(plan.before()).equals(payload.get("beforeHash").getAsString())
                            || !payload.has("afterHash") || !EditCoordinator.hash(plan.after()).equals(payload.get("afterHash").getAsString()))
                        throw new EditCoordinator.Failure("recovery_conflict", "Invalid pending edit or project root changed; inspect operation " + rows.getString("operation_id"), rows.getString("operation_id"), null);
                    result.add(new EditCoordinator.Pending(rows.getLong("id"), rows.getString("operation_id"), (Integer) rows.getObject("branch_id"), plan));
                }
            }
        }
        return result;
    }

    public EditCoordinator.Pending prepare(EditCoordinator.Plan plan) throws Exception {
        requireNoExternalBundle();
        if (plan.result().has("_undoBefore") || plan.result().has("resourceImage")) {
            plan.result().addProperty("_undoSession", UndoRegistry.RUN);
            plan.result().addProperty("_undoBoundary", boundary);
        }
        Integer branch = branch();
        String id = plan.result().has("_requestId") ? plan.result().get("_requestId").getAsString() : UUID.randomUUID().toString();
        var payload = JSON.toJsonTree(plan).getAsJsonObject();
        payload.addProperty("recordVersion", plan.result().has("resourceImage") ? 3 : 2);
        payload.addProperty("beforeHash", EditCoordinator.hash(plan.before()));
        payload.addProperty("afterHash", EditCoordinator.hash(plan.after()));
        try (var s = connection.prepareStatement("INSERT INTO lusiad_edit_operations(operation_id,project_id,branch_id,state,payload) VALUES(?,?,?,'prepared',?)", Statement.RETURN_GENERATED_KEYS)) {
            s.setString(1, id); s.setInt(2, projectId); s.setObject(3, branch); s.setString(4, payload.toString());
            s.executeUpdate();
            try (var keys = s.getGeneratedKeys()) {
                if (!keys.next()) throw new SQLException("Missing edit operation order");
                return new EditCoordinator.Pending(keys.getLong(1), id, branch, plan);
            }
        }
    }

    public long complete(EditCoordinator.Pending pending, byte[] bytes) throws Exception {
        requireNoExternalBundle();
        if (!Objects.equals(branch(), pending.branch()))
            throw new EditCoordinator.Failure("recovery_conflict", "Selected branch changed; inspect operation " + pending.id(), pending.id(), null);
        connection.setAutoCommit(false);
        try {
            try (var s = connection.prepareStatement("SELECT state,change_id FROM lusiad_edit_operations WHERE id=? AND project_id=? FOR UPDATE")) {
                s.setLong(1, pending.order()); s.setInt(2, projectId);
                try (var rows = s.executeQuery()) {
                    if (!rows.next()) throw new SQLException("Missing prepared operation");
                    if ("applied".equals(rows.getString(1))) { long id = rows.getLong(2); connection.commit(); reconcileUndo(); return id; }
                    if (!"prepared".equals(rows.getString(1))) throw new SQLException("Operation already aborted");
                }
            }
            var plan = pending.plan();
            boolean resources = plan.result().has("resourceImage");
            if (!resources && plan.result().has("_undoBefore")) {
                plan.result().add("resources", ResourceImage.pair(ResourceImage.decode(plan.result().get("_undoBefore").toString()), ResourceImage.file(plan.path(), bytes)));
            }
            long changeId;
            try (var s = connection.prepareStatement("INSERT INTO changes(commit_id,project_id,branch_id,summary,description,date_time,change_type,scope,req_body) VALUES(NULL,?,?,?,?,NOW(),?,?,?)", Statement.RETURN_GENERATED_KEYS)) {
                s.setInt(1, projectId); s.setObject(2, pending.branch());
                var metadata = plan.result().getAsJsonObject("changeMetadata");
                s.setString(3, com.lusiad.backend.service.change.ChangeMetadata.summary(metadata));
                s.setString(4, plan.request().getOrDefault("changeDescription", ""));
                s.setString(5, plan.type()); s.setString(6, plan.request().getOrDefault("_scope", "file"));
                s.setString(7, EditCoordinator.event(pending).toString()); s.executeUpdate();
                try (var keys = s.getGeneratedKeys()) { if (!keys.next()) throw new SQLException("Missing change id"); changeId = keys.getLong(1); }
            }
            // The sync baseline and the event acknowledge the same actual bytes, even after Next loses its response.
            if (resources) updateResourceBaseline(plan);
            else try (var s = connection.prepareStatement("INSERT INTO external_sync_files(project_id,path,kind,content,sha256) SELECT ?,?,'file',?,? WHERE EXISTS(SELECT 1 FROM external_sync_projects WHERE project_id=?) ON DUPLICATE KEY UPDATE kind='file',content=VALUES(content),sha256=VALUES(sha256)")) {
                s.setInt(1, projectId); s.setString(2, plan.path().replace('\\', '/')); s.setBytes(3, bytes);
                s.setString(4, java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes)));
                s.setInt(5, projectId); s.executeUpdate();
            }
            try (var s = connection.prepareStatement("UPDATE lusiad_edit_operations SET state='applied',change_id=?,payload=NULL WHERE id=? AND project_id=?")) {
                s.setLong(1, changeId); s.setLong(2, pending.order()); s.setInt(3, projectId); s.executeUpdate();
            }
            connection.commit();
            reconcileUndo();
            return changeId;
        } catch (Exception failure) { try { connection.rollback(); } catch (Exception ignored) { } throw failure; }
        finally { try { connection.setAutoCommit(true); } catch (Exception ignored) { } }
    }

    private void updateResourceBaseline(EditCoordinator.Plan plan) throws Exception {
        ResourceImage before = ResourceImage.decode(plan.before()), after = ResourceImage.decode(plan.after());
        Set<String> paths = new TreeSet<>(before.entries().keySet()); paths.addAll(after.entries().keySet());
        for (String name : paths) {
            if (Arrays.stream(name.split("/")).anyMatch(part -> part.startsWith(".") || Set.of("node_modules", "build", "dist", "out", "target").contains(part))) continue;
            if (Objects.equals(before.entries().get(name), after.entries().get(name))) continue;
            var value = after.entries().get(name);
            if (value == null) {
                try (var s = connection.prepareStatement("DELETE FROM external_sync_files WHERE project_id=? AND path=?")) { s.setInt(1, projectId); s.setString(2, name); s.executeUpdate(); }
            } else try (var s = connection.prepareStatement("INSERT INTO external_sync_files(project_id,path,kind,content,sha256) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM external_sync_projects WHERE project_id=?) ON DUPLICATE KEY UPDATE kind=VALUES(kind),content=VALUES(content),sha256=VALUES(sha256)")) {
                s.setInt(1, projectId); s.setString(2, name); s.setString(3, value.kind()); s.setBytes(4, value.kind().equals("file") ? value.bytes() : null);
                s.setString(5, HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(value.bytes()))); s.setInt(6, projectId); s.executeUpdate();
            }
        }
    }

    public JsonObject receipt(String id, String proof) throws Exception {
        try (var s = connection.prepareStatement("SELECT op.id,op.state,op.change_id,ch.req_body FROM lusiad_edit_operations op LEFT JOIN changes ch ON ch.id=op.change_id AND ch.project_id=op.project_id WHERE op.project_id=? AND op.operation_id=?")) {
            s.setInt(1, projectId); s.setString(2, id);
            try (var row = s.executeQuery()) {
                if (!row.next()) return null;
                if (!row.getString(2).equals("applied")) throw new EditCoordinator.Failure("operation_pending", "Operation requires recovery before retry", id, null);
                var body = JsonParser.parseString(row.getString(4)).getAsJsonObject();
                if (!body.has("undoRequestHash") || !proof.equals(body.get("undoRequestHash").getAsString())) throw new EditCoordinator.Failure("undo_conflict", "Request id belongs to a different operation", id, null);
                var value = new JsonObject(); value.addProperty("status", "ok"); value.addProperty("operationId", id);
                value.addProperty("operationOrder", row.getLong(1)); value.addProperty("changeId", row.getLong(3)); value.addProperty("recordVersion", 3); return value;
            }
        }
    }

    /** Detect any authorized source change, including a new file outside the top operation's paths. */
    public void requireBaseline() throws Exception {
        requireNoExternalBundle();
        try (var s = connection.prepareStatement("SELECT path,kind,sha256 FROM external_sync_files WHERE project_id=?")) {
            s.setInt(1, projectId); Map<String,String> expected = new TreeMap<>();
            try (var rows = s.executeQuery()) { while (rows.next()) expected.put(rows.getString(1), rows.getString(2) + ":" + rows.getString(3)); }
            // Before sync initialization, there is no authoritative whole-project baseline yet.
            try (var q = connection.prepareStatement("SELECT project_id FROM external_sync_projects WHERE project_id=?")) {
                q.setInt(1, projectId); try (var row = q.executeQuery()) { if (!row.next()) return; }
            }
            if (!expected.equals(ResourceEdits.projectHashes(root))) throw new EditCoordinator.Failure("sync_review_required", "Review external changes before undo/redo", null, null);
        }
    }

    public void abort(EditCoordinator.Pending pending) throws Exception {
        try (var s = connection.prepareStatement("UPDATE lusiad_edit_operations SET state='aborted',payload=NULL WHERE id=? AND project_id=? AND state='prepared'")) {
            s.setLong(1, pending.order()); s.setInt(2, projectId); s.executeUpdate();
        }
    }

    private void requireNoExternalBundle() throws Exception {
        try (var s = connection.prepareStatement("SELECT operation_id FROM lusiad_sync_operations WHERE project_id=? AND state='prepared' LIMIT 1")) {
            s.setInt(1, projectId);
            try (var rows = s.executeQuery()) {
                if (rows.next()) throw new EditCoordinator.Failure("recovery_conflict",
                        "External synchronization pending: reopen synchronization to recover " + rows.getString(1), null, null);
            }
        }
        try (var s = connection.prepareStatement("SELECT operation_id FROM lusiad_git_operations WHERE project_id=? AND state='prepared' LIMIT 1")) {
            s.setInt(1, projectId);
            try (var rows = s.executeQuery()) {
                if (rows.next()) throw new EditCoordinator.Failure("recovery_conflict",
                        "Git operation pending: reopen the commit menu to recover " + rows.getString(1), null, null);
            }
        }
        try (var s = connection.prepareStatement("SELECT pending_bundle_change_id FROM external_sync_projects WHERE project_id=?")) {
            s.setInt(1, projectId);
            try (var rows = s.executeQuery()) {
                if (rows.next() && rows.getObject(1) != null)
                    throw new EditCoordinator.Failure("recovery_conflict", "External bundle must be resolved before recording an edit", null, null);
            }
        }
    }

    public void close() throws Exception {
        try (var s = connection.prepareStatement("SELECT RELEASE_LOCK(?)")) { s.setString(1, lock); s.execute(); }
        catch (Exception failure) { com.intellij.openapi.diagnostic.Logger.getInstance(EditOperationStore.class).warn("Could not release edit lock; closing its connection", failure); }
        finally {
            try { connection.close(); }
            catch (Exception failure) { com.intellij.openapi.diagnostic.Logger.getInstance(EditOperationStore.class).warn("Could not close edit connection", failure); }
            finally {
                try { fileLock.close(); }
                catch (Exception failure) { com.intellij.openapi.diagnostic.Logger.getInstance(EditOperationStore.class).warn("Could not close edit file lock", failure); }
            }
        }
    }
}
