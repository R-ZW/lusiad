package com.lusiad.backend.service.psi;

import com.google.gson.JsonObject;
import org.junit.Test;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantLock;
import static org.junit.Assert.*;

/** Real disposable disk, injectable persistence failures. Not presented as SQL/UI E2E. */
public class EditCoordinatorTest {
    static class Store implements EditCoordinator.Store {
        final List<EditCoordinator.Pending> pending = new ArrayList<>();
        final List<EditCoordinator.Pending> events = new ArrayList<>();
        boolean failPrepare, failCommit, loseAcknowledgement;
        long sequence;
        public List<EditCoordinator.Pending> pending() { return List.copyOf(pending); }
        public EditCoordinator.Pending prepare(EditCoordinator.Plan plan) throws Exception {
            if (failPrepare) throw new java.sql.SQLException("connection lost before prepare");
            var intent = new EditCoordinator.Pending(++sequence, UUID.randomUUID().toString(), 7, plan);
            pending.add(intent); return intent;
        }
        public long complete(EditCoordinator.Pending op, byte[] bytes) throws Exception {
            if (failCommit) throw new java.sql.SQLException("connection lost before commit");
            if (!events.contains(op)) events.add(op);
            pending.remove(op);
            if (loseAcknowledgement) throw new java.sql.SQLException("commit succeeded but acknowledgement lost");
            return events.indexOf(op) + 1;
        }
        public void abort(EditCoordinator.Pending op) { pending.remove(op); }
        public void close() {}
    }
    static class Disk implements EditCoordinator.Disk {
        final Path file;
        Disk(Path file) { this.file = file; }
        public EditCoordinator.Content read(String path) throws Exception { return new EditCoordinator.Content(Files.readString(file), Files.readAllBytes(file)); }
        public void write(EditCoordinator.Plan plan) throws Exception { Files.writeString(file, plan.after()); }
    }
    private EditCoordinator.Plan plan(String before, String after) {
        JsonObject result = new JsonObject(); result.addProperty("status", "ok"); result.addProperty("saved", true);
        var side = new com.lusiad.backend.service.change.ChangeMetadata.Side("Demo.java", null,
                new com.lusiad.backend.service.change.ChangeMetadata.Element("fragment", null), List.of());
        result.add("changeMetadata", new com.google.gson.GsonBuilder().serializeNulls().create().toJsonTree(
                new com.lusiad.backend.service.change.ChangeMetadata.Facts(1, "update", "code", side, side, List.of())));
        return new EditCoordinator.Plan("fixture", "Demo.java", "update", Map.of("newContent", after), before, after, result);
    }

    @Test public void oldRevisionAndPrepareFailureLeaveDiskAndEventsUntouched() throws Exception {
        Path file = Files.createTempFile("edit-conflict-", ".java");
        try {
            Files.writeString(file, "before"); var disk = new Disk(file); var store = new Store();
            try { EditCoordinator.execute(store, disk, EditCoordinator.hash("old"), () -> plan("before", "after")); fail(); }
            catch (EditCoordinator.Failure e) { assertEquals("revision_conflict", e.code); }
            assertTrue(store.pending.isEmpty()); assertTrue(store.events.isEmpty()); assertEquals("before", Files.readString(file));
            store.failPrepare = true;
            try { EditCoordinator.execute(store, disk, EditCoordinator.hash("before"), () -> plan("before", "after")); fail(); }
            catch (java.sql.SQLException expected) { }
            assertEquals("before", Files.readString(file)); assertTrue(store.events.isEmpty());
        } finally { Files.deleteIfExists(file); }
    }

    @Test public void disconnectedAfterDiskIsRecoveredExactlyOnceWithoutRepeatingTheEdit() throws Exception {
        Path file = Files.createTempFile("edit-recover-", ".java");
        try {
            Files.writeString(file, "before Ω😀\n"); var disk = new Disk(file); var store = new Store(); store.failCommit = true;
            try { EditCoordinator.execute(store, disk, EditCoordinator.hash("before Ω😀\n"), () -> plan("before Ω😀\n", "after\n")); fail(); }
            catch (EditCoordinator.Failure e) { assertEquals("operation_pending", e.code); assertNotNull(e.operationId); }
            assertEquals("after\n", Files.readString(file)); assertEquals(1, store.pending.size()); assertTrue(store.events.isEmpty());
            store.failCommit = false;
            assertEquals(1, EditCoordinator.recover(store, new Disk(file))); // New disk adapter, same durable store.
            assertEquals(0, EditCoordinator.recover(store, new Disk(file)));
            assertEquals(1, store.events.size()); assertEquals("after\n", Files.readString(file));
            var event = EditCoordinator.event(store.events.getFirst());
            assertEquals(2, event.get("recordVersion").getAsInt());
            assertEquals(EditCoordinator.hash("before Ω😀\n"), event.get("beforeHash").getAsString());
            assertEquals("after\n", event.get("afterText").getAsString());
            assertEquals(store.events.getFirst().plan().result().get("changeMetadata"), event.get("changeMetadata"));
        } finally { Files.deleteIfExists(file); }
    }

    @Test public void lostCommitAcknowledgementNeverDuplicatesTheEvent() throws Exception {
        Path file = Files.createTempFile("edit-ack-", ".java");
        try {
            Files.writeString(file, "before"); var store = new Store(); store.loseAcknowledgement = true;
            try { EditCoordinator.execute(store, new Disk(file), EditCoordinator.hash("before"), () -> plan("before", "after")); fail(); }
            catch (EditCoordinator.Failure e) { assertEquals("operation_pending", e.code); }
            assertEquals(0, EditCoordinator.recover(store, new Disk(file))); assertEquals(1, store.events.size());
        } finally { Files.deleteIfExists(file); }
    }

    @Test public void unappliedIntentIsAbortedAndThirdStateIsBlockedWithoutOverwrite() throws Exception {
        Path file = Files.createTempFile("edit-third-state-", ".java");
        try {
            Files.writeString(file, "before"); var disk = new Disk(file); var store = new Store();
            var failingDisk = new Disk(file) {
                @Override public void write(EditCoordinator.Plan plan) {
                    throw new EditCoordinator.Failure("save_failed", "controlled write refusal", null, null);
                }
            };
            try { EditCoordinator.execute(store, failingDisk, EditCoordinator.hash("before"), () -> plan("before", "after")); fail(); }
            catch (EditCoordinator.Failure error) { assertEquals("save_failed", error.code); assertNotNull(error.operationId); }
            assertEquals(0, EditCoordinator.recover(store, disk)); assertTrue(store.pending.isEmpty()); assertTrue(store.events.isEmpty());
            store.prepare(plan("before", "after")); Files.writeString(file, "external");
            try { EditCoordinator.recover(store, disk); fail(); }
            catch (EditCoordinator.Failure e) { assertEquals("recovery_conflict", e.code); }
            assertEquals("external", Files.readString(file)); assertEquals(1, store.pending.size());
        } finally { Files.deleteIfExists(file); }
    }

    @Test public void concurrentCommandsBasedOnOneRevisionOnlyApplyOnceUnderTheProjectLock() throws Exception {
        Path file = Files.createTempFile("edit-concurrent-", ".java");
        ExecutorService workers = Executors.newFixedThreadPool(2);
        try {
            Files.writeString(file, "before"); var store = new Store(); var lock = new ReentrantLock();
            Callable<Boolean> command = () -> {
                lock.lock();
                try { EditCoordinator.execute(store, new Disk(file), EditCoordinator.hash("before"), () -> plan(Files.readString(file), "after")); return true; }
                catch (EditCoordinator.Failure failure) { assertEquals("revision_conflict", failure.code); return false; }
                finally { lock.unlock(); }
            };
            var first = workers.submit(command); var second = workers.submit(command);
            assertNotEquals(first.get(5, TimeUnit.SECONDS), second.get(5, TimeUnit.SECONDS));
            assertEquals(1, store.events.size()); assertEquals("after", Files.readString(file));
        } finally { workers.shutdownNow(); Files.deleteIfExists(file); }
    }
    @Test public void completedWriteWithRefreshFailureIsConfirmedWithoutWritingAgain() throws Exception {
        Path file=Files.createTempFile("edit-refresh-", ".java"); int[] writes={0};
        try {
            Files.writeString(file,"before"); var store=new Store();
            var disk=new Disk(file){ @Override public void write(EditCoordinator.Plan p) throws Exception {
                writes[0]++; super.write(p); throw new java.io.IOException("refresh failed after saving");
            }};
            var result=EditCoordinator.execute(store,disk,EditCoordinator.hash("before"),()->plan("before","after"));
            assertTrue(result.get("recovered").getAsBoolean()); assertEquals(1,writes[0]);
            assertEquals(1,store.events.size()); assertTrue(store.pending.isEmpty()); assertEquals("after",Files.readString(file));
        } finally { Files.deleteIfExists(file); }
    }
    @Test public void transientLostAcknowledgementReadsTheSameIntentWithoutDuplicatingItsEvent() throws Exception {
        Path file=Files.createTempFile("edit-transient-ack-", ".java"); int[] writes={0};
        try {
            Files.writeString(file,"before"); var store=new Store(){
                boolean first=true;
                @Override public long complete(EditCoordinator.Pending op,byte[] bytes) throws Exception {
                    loseAcknowledgement=first; first=false;
                    return super.complete(op,bytes);
                }
            };
            var disk=new Disk(file){ @Override public void write(EditCoordinator.Plan p) throws Exception { writes[0]++; super.write(p); }};
            var result=EditCoordinator.execute(store,disk,EditCoordinator.hash("before"),()->plan("before","after"));
            assertTrue(result.get("recovered").getAsBoolean()); assertEquals(1,result.get("changeId").getAsLong());
            assertEquals(1,writes[0]); assertEquals(1,store.events.size()); assertTrue(store.pending.isEmpty());
        } finally { Files.deleteIfExists(file); }
    }
    @Test public void attemptedWriteCannotAcknowledgeAnUnrelatedThirdState() throws Exception {
        Path file=Files.createTempFile("edit-attempt-third-", ".java");
        try {
            Files.writeString(file,"before"); var store=new Store();
            var disk=new Disk(file){ @Override public void write(EditCoordinator.Plan p) throws Exception {
                Files.writeString(file,"external third state"); throw new java.io.IOException("interrupted write");
            }};
            try { EditCoordinator.execute(store,disk,EditCoordinator.hash("before"),()->plan("before","after")); fail(); }
            catch(EditCoordinator.Failure failure){ assertEquals("operation_pending",failure.code); }
            assertEquals("external third state",Files.readString(file)); assertTrue(store.events.isEmpty()); assertEquals(1,store.pending.size());
        } finally { Files.deleteIfExists(file); }
    }
}
