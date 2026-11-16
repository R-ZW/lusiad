package com.lusiad.backend.service.undo;

import com.google.gson.*;
import com.lusiad.backend.service.psi.EditCoordinator;
import java.util.*;

/** Run-local navigation only. SQL events/receipts remain the durable truth for interrupted operations. */
public final class UndoRegistry {
    public static volatile String RUN = UUID.randomUUID().toString();
    public static final int MAX_STEPS = 50;
    public record Step(String id, long originalChangeId, long lastChangeId, ResourceImage before, ResourceImage after,
                       JsonObject metadata, String path) {
        public Step applied(long changeId) { return new Step(id, originalChangeId, changeId, before, after, metadata, path); }
        public long size() { return before.size() + after.size(); }
    }
    private static final class State {
        String boundary; String epoch = UUID.randomUUID().toString(); long version, lastChange; int evicted;
        final Deque<Step> undo = new ArrayDeque<>(), redo = new ArrayDeque<>();
    }
    private static final Map<String, State> STATES = new HashMap<>();
    private UndoRegistry() {}
    private static String key(int project, String root) { return project + ":" + root; }
    private static State state(int project, String root, String boundary) {
        State state = STATES.computeIfAbsent(key(project, root), ignored -> new State());
        if (!Objects.equals(state.boundary, boundary)) {
            state.undo.clear(); state.redo.clear(); state.lastChange = 0; state.boundary = boundary;
            state.epoch = UUID.randomUUID().toString(); state.version++; state.evicted = 0;
        }
        return state;
    }
    public static synchronized void clear() { STATES.clear(); RUN = UUID.randomUUID().toString(); }
    public static synchronized void clearProject(int project) { STATES.keySet().removeIf(key -> key.startsWith(project + ":")); }
    /** A destructive history cut is a boundary, not a new undo step. */
    public static synchronized void discardThrough(int project, String root, String boundary, long retainedChangeId) {
        State current = state(project, root, boundary);
        current.undo.clear(); current.redo.clear(); current.evicted = 0;
        current.lastChange = retainedChangeId;
        current.epoch = UUID.randomUUID().toString(); current.version++;
    }
    public static synchronized long lastChange(int project, String root, String boundary) { return state(project, root, boundary).lastChange; }
    /** Background readers never revive/reset a cursor based on an out-of-order SQL observation. */
    public static synchronized JsonObject projectedStatus(int project, String root, String boundary) {
        State current = STATES.get(key(project, root));
        if (current == null || Objects.equals(current.boundary, boundary)) return status(project, root, boundary);
        JsonObject result = status(project, root, current.boundary);
        result.addProperty("undoCount", 0); result.addProperty("redoCount", 0); result.addProperty("evicted", 0);
        result.add("undo", JsonNull.INSTANCE); result.add("redo", JsonNull.INSTANCE); return result;
    }
    public static synchronized JsonObject status(int project, String root, String boundary) {
        State state = state(project, root, boundary); JsonObject result = new JsonObject();
        result.addProperty("status", "ok"); result.addProperty("version", 1); result.addProperty("epoch", state.epoch);
        result.addProperty("revision", state.version); result.addProperty("undoCount", state.undo.size()); result.addProperty("redoCount", state.redo.size());
        result.addProperty("evicted", state.evicted);
        result.add("undo", summary(state.undo.peekLast())); result.add("redo", summary(state.redo.peekLast())); return result;
    }
    private static JsonElement summary(Step step) {
        if (step == null) return JsonNull.INSTANCE;
        JsonObject value = new JsonObject(); value.addProperty("id", step.id); value.addProperty("path", step.path);
        value.addProperty("originalChangeId", step.originalChangeId); value.add("metadata", step.metadata.deepCopy()); return value;
    }
    public static synchronized Step top(int project, String root, String boundary, String direction, String epoch, long revision) {
        State state = state(project, root, boundary);
        if (!state.epoch.equals(epoch) || state.version != revision) throw new EditCoordinator.Failure("undo_conflict", "Undo state changed in another client; refresh before continuing", null, null);
        Step step = (direction.equals("undo") ? state.undo : state.redo).peekLast();
        if (step == null) throw new EditCoordinator.Failure("undo_empty", "There is no operation in this direction", null, null);
        return step;
    }
    public static synchronized void acknowledge(int project, String root, String boundary, String operationId, long changeId,
                                                 ResourceImage before, ResourceImage after, JsonObject metadata, String path, JsonObject navigation) {
        State state = state(project, root, boundary);
        if (changeId <= state.lastChange) return;
        if (before.equals(after)) { state.lastChange = changeId; return; }
        if (navigation != null) {
            // A pending operation may be recovered in another Run: retain its event, never revive its old stack.
            if (!state.epoch.equals(navigation.get("epoch").getAsString())) { state.lastChange = changeId; return; }
            boolean undo = navigation.get("direction").getAsString().equals("undo");
            Deque<Step> from = undo ? state.undo : state.redo, to = undo ? state.redo : state.undo;
            Step step = from.peekLast();
            if (step == null || !step.id.equals(navigation.get("logicalId").getAsString()))
                throw new IllegalStateException("Confirmed operation does not match the navigation cursor");
            from.removeLast(); to.addLast(step.applied(changeId));
        } else {
            state.redo.clear();
            Step step = new Step(operationId, changeId, changeId, before, after, metadata.deepCopy(), path);
            if (step.size() > ResourceImage.MAX_BYTES) { state.undo.clear(); state.epoch = UUID.randomUUID().toString(); state.evicted++; }
            else state.undo.addLast(step);
        }
        state.lastChange = changeId; state.version++;
        while (state.undo.size() + state.redo.size() > MAX_STEPS || bytes(state) > ResourceImage.MAX_BYTES) {
            if (!state.undo.isEmpty()) state.undo.removeFirst(); else state.redo.removeFirst(); state.evicted++;
        }
    }
    private static long bytes(State state) { return state.undo.stream().mapToLong(Step::size).sum() + state.redo.stream().mapToLong(Step::size).sum(); }
}
