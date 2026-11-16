package com.lusiad.backend.service.psi;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.lusiad.backend.config.OperationalSettings;
import com.lusiad.backend.repository.change.EditOperationStore;
import com.lusiad.backend.repository.sql.*;
import org.junit.*;
import java.nio.file.*;
import java.util.*;
import static org.junit.Assert.*;

/** Optional real SQL fault test. Only attaches to an explicitly marked disposable mysqld. */
public class EditSqlIntegrationTest {
    @Test public void durableIntentReceiptBaselineAndConnectionLoss() throws Exception {
        String config = System.getProperty("lusiad.edit.integration.config");
        Assume.assumeTrue("Explicit disposable MySQL fixture required; never use the author's database", config != null);
        Path context = Path.of(config).toRealPath();
        JsonObject fixture = JsonParser.parseString(Files.readString(context)).getAsJsonObject();
        assertEquals("p05.2-disposable", fixture.get("owner").getAsString());
        int port = fixture.get("port").getAsInt(); assertNotEquals(3306, port);
        Path root = context.getParent().toRealPath();
        assertEquals(root, Path.of(fixture.get("root").getAsString()).toRealPath());
        var settings = OperationalSettings.read(Map.of("LUSIAD_CONFIG_FILE", root.resolve("no-user-config.json").toString(),
                "LUSIAD_DB_HOST", "127.0.0.1", "LUSIAD_DB_PORT", "" + port, "LUSIAD_DB_NAME", "lusiad_p052",
                "LUSIAD_DB_USER", "root", "LUSIAD_DB_PASSWORD", ""), new Properties(), root, root);
        var factory = new SqlConnectionFactory(SqlConnectionConfig.from(settings));
        try (var admin = factory.openConnection(); var query = admin.createStatement()) {
            try (var rs = query.executeQuery("SELECT @@datadir,@@server_uuid")) {
                assertTrue(rs.next()); assertEquals(root.resolve("data").toRealPath(), Path.of(rs.getString(1)).toRealPath());
                assertEquals(fixture.get("uuid").getAsString(), rs.getString(2));
            }
            // All following SQL is confined to this proven disposable server/schema.
            query.executeUpdate("DELETE FROM lusiad_edit_operations"); query.executeUpdate("DELETE FROM changes");
            Path file = root.resolve("Demo.java"); Files.writeString(file, "before\n");
            var disk = new EditCoordinatorTest.Disk(file);
            JsonObject result = new JsonObject(); result.addProperty("status", "ok"); result.addProperty("saved", true);
            var side = new com.lusiad.backend.service.change.ChangeMetadata.Side("Demo.java", null,
                    new com.lusiad.backend.service.change.ChangeMetadata.Element("fragment", null), List.of());
            result.add("changeMetadata", new com.google.gson.GsonBuilder().serializeNulls().create().toJsonTree(
                    new com.lusiad.backend.service.change.ChangeMetadata.Facts(1, "update", "code", side, side, List.of())));
            var plan = new EditCoordinator.Plan(root.toString(), "Demo.java", "update", Map.of("path", "Demo.java", "newContent", "after Ω😀\n"), "before\n", "after Ω😀\n", result);
            // A durable sync intent fences a direct plugin edit even when its
            // original frontend connection (and advisory lock) no longer exists.
            String synchronization = UUID.randomUUID().toString();
            query.executeUpdate("INSERT INTO lusiad_sync_operations(operation_id,project_id,state,payload) VALUES('" + synchronization + "',1,'prepared','{}')");
            try (var store = new EditOperationStore(factory, 1, root.toString())) {
                try { store.prepare(plan); fail("An unresolved sync operation must block editing"); }
                catch (EditCoordinator.Failure blocked) { assertEquals("recovery_conflict", blocked.code); }
            }
            assertEquals("before\n", Files.readString(file));
            try (var rs = query.executeQuery("SELECT COUNT(*) FROM lusiad_edit_operations")) {
                assertTrue(rs.next()); assertEquals(0, rs.getInt(1));
            }
            query.executeUpdate("UPDATE lusiad_sync_operations SET state='aborted' WHERE operation_id='" + synchronization + "'");
            try (var store = new EditOperationStore(factory, 1, root.toString())) { store.prepare(plan); }
            try (var store = new EditOperationStore(factory, 1, root.toString())) { assertEquals(0, EditCoordinator.recover(store, disk)); assertTrue(store.pending().isEmpty()); }
            try (var store = new EditOperationStore(factory, 1, root.toString())) {
                var pending = store.prepare(plan); disk.write(plan);
                // Simulate loss between the verified disk save and SQL confirmation.
                long connectionId;
                try (var rs = query.executeQuery("SELECT ID FROM information_schema.PROCESSLIST WHERE DB='lusiad_p052' AND ID<>CONNECTION_ID()")) {
                    assertTrue(rs.next()); connectionId = rs.getLong(1); assertFalse(rs.next());
                }
                query.execute("KILL " + connectionId);
                try (var competing = new EditOperationStore(factory, 1, root.toString())) { fail("SQL disconnect must not release the filesystem writer lock"); }
                catch (EditCoordinator.Failure busy) { assertEquals("operation_busy", busy.code); }
                try { store.complete(pending, Files.readAllBytes(file)); fail("Killed connection cannot confirm an edit"); }
                catch (java.sql.SQLException expected) { }
            }
            try (var store = new EditOperationStore(factory, 1, root.toString())) {
                var pending = store.pending().getFirst();
                assertEquals(1, EditCoordinator.recover(store, disk));
                assertEquals(0, EditCoordinator.recover(store, disk));
                assertTrue(store.complete(pending, Files.readAllBytes(file)) > 0); // Receipt makes completion idempotent.
            }
            try (var rs = query.executeQuery("SELECT COUNT(*),MAX(req_body->>'$.recordVersion'),MAX(req_body->>'$.afterText') FROM changes WHERE project_id=1")) {
                assertTrue(rs.next()); assertEquals(1, rs.getInt(1)); assertEquals("2", rs.getString(2)); assertEquals(plan.after(), rs.getString(3));
            }
            try (var rs = query.executeQuery("SELECT req_body FROM changes WHERE project_id=1")) {
                assertTrue(rs.next());
                assertEquals(result.getAsJsonObject("changeMetadata"), com.google.gson.JsonParser.parseString(rs.getString(1)).getAsJsonObject().getAsJsonObject("changeMetadata"));
            }
            try (var rs = query.executeQuery("SELECT content FROM external_sync_files WHERE project_id=1 AND path='Demo.java'")) {
                assertTrue(rs.next()); assertArrayEquals(Files.readAllBytes(file), rs.getBytes(1));
            }
            // Receipt and reconstructed event remain linked after restarting the store/connection.
            try (var rs = query.executeQuery("SELECT COUNT(*) FROM lusiad_edit_operations op JOIN changes ch ON ch.id=op.change_id AND ch.project_id=op.project_id WHERE op.state='applied' AND op.payload IS NULL")) {
                assertTrue(rs.next()); assertEquals(1, rs.getInt(1));
            }
        }
    }
}
