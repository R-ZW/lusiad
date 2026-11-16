package com.lusiad.backend.service.psi;

import com.google.gson.JsonObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** SQL intent -> verified disk write -> atomic SQL event/receipt. No IDE or SQL work is hidden here. */
public final class EditCoordinator {
    public record Plan(String root, String path, String type, Map<String, String> request,
                       String before, String after, JsonObject result) {}
    public record Pending(long order, String id, Integer branch, Plan plan) {}
    public record Content(String text, byte[] bytes) {}
    public interface Store extends AutoCloseable {
        List<Pending> pending() throws Exception;
        Pending prepare(Plan plan) throws Exception;
        long complete(Pending pending, byte[] bytes) throws Exception;
        void abort(Pending pending) throws Exception;
        void close() throws Exception;
    }
    public interface Disk {
        Content read(String path) throws Exception;
        default Content read(Plan plan) throws Exception { return read(plan.path()); }
        void write(Plan plan) throws Exception;
    }
    @FunctionalInterface public interface Planner { Plan plan() throws Exception; }
    public static final class Failure extends RuntimeException {
        public final String code, operationId;
        public Failure(String code, String message, String id, Throwable cause) {
            super(message, cause); this.code = code; this.operationId = id;
        }
    }
    private EditCoordinator() {}

    public static String hash(String text) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    /** Store must hold the project's database lock for the whole call. */
    public static JsonObject execute(Store store, Disk disk, String expectedHash, Planner planner) throws Exception {
        recover(store, disk);
        Plan plan = planner.plan();
        if (!hash(plan.before()).equals(expectedHash))
            throw new Failure("revision_conflict", "The model is older than the current file; reload before editing", null, null);
        if (plan.before().equals(plan.after())) {
            var result = plan.result().deepCopy(); result.addProperty("noOp", true);
            for (String key : new String[]{"resources", "_undoBefore", "resourceImage", "changeMetadata"}) result.remove(key);
            result.keySet().removeIf(key -> key.startsWith("_"));
            result.addProperty("revision", hash(plan.before())); return result;
        }
        Pending pending = store.prepare(plan); // Durable before touching the real document.
        boolean writeStarted = false;
        try {
            if (!disk.read(plan).text().equals(plan.before()))
                throw new Failure("revision_conflict", "The file changed while preparing the edit", pending.id(), null);
            writeStarted = true;
            disk.write(plan);
            Content content = disk.read(plan);
            if (!content.text().equals(plan.after())) throw new Failure("save_verification_failed", "Saved content differs from the prepared edit", pending.id(), null);
            long changeId = store.complete(pending, content.bytes());
            return confirmed(pending, changeId);
        } catch (Exception failure) {
            // Reconcile this same durable intent, never repeat the document/filesystem write.
            // A pre-write refusal or a third state cannot authorize an acknowledgement.
            if (writeStarted && !(failure instanceof Failure f && Set.of("revision_conflict", "undo_capacity").contains(f.code))) {
                try {
                    Content current = disk.read(plan);
                    if (current.text().equals(plan.after())) {
                        long changeId = store.complete(pending, current.bytes());
                        JsonObject result = confirmed(pending, changeId); result.addProperty("recovered", true);
                        com.intellij.openapi.diagnostic.Logger.getInstance(EditCoordinator.class).warn("Confirmed saved operation " + pending.id() + " by readback without repeating its write", failure);
                        return result;
                    }
                } catch (Exception recovery) { failure.addSuppressed(recovery); }
            }
            if (failure instanceof Failure typed) throw new Failure(typed.code.equals("undo_capacity") ? "operation_pending" : typed.code, typed.getMessage(), pending.id(), failure);
            // A lost SQL acknowledgement is not proof of rollback. Keep the intent for reconciliation.
            throw new Failure("operation_pending", "Edit not confirmed; reload to recover operation " + pending.id(), pending.id(), failure);
        }
    }

    private static JsonObject confirmed(Pending pending, long changeId) {
        Plan plan = pending.plan(); JsonObject result = plan.result().deepCopy();
        for (String key : new String[]{"resources", "_undoBefore", "_undoSession", "_undoBoundary", "_requestId", "_requestProof", "navigation", "resourceImage", "changeMetadata"}) result.remove(key);
        result.addProperty("revision", hash(plan.after())); result.addProperty("operationId", pending.id());
        result.addProperty("operationOrder", pending.order()); result.addProperty("changeId", changeId);
        result.addProperty("recordVersion", plan.result().has("resourceImage") ? 3 : 2); return result;
    }

    /** Never overwrites disk. Third states (including partial writes) need human inspection. */
    public static int recover(Store store, Disk disk) throws Exception {
        int recovered = 0;
        for (Pending pending : store.pending()) {
            Content content;
            try { content = disk.read(pending.plan()); }
            catch (Exception unreadable) { throw new Failure("recovery_conflict", "Cannot inspect pending operation " + pending.id(), pending.id(), unreadable); }
            if (content.text().equals(pending.plan().after())) {
                store.complete(pending, content.bytes()); recovered++;
            } else if (content.text().equals(pending.plan().before())) store.abort(pending);
            else throw new Failure("recovery_conflict", "File diverges from both recorded states; inspect operation " + pending.id(), pending.id(), null);
        }
        return recovered;
    }

    public static JsonObject event(Pending pending) {
        Plan plan = pending.plan();
        JsonObject body = new JsonObject();
        plan.request().forEach((key, value) -> {
            if (!key.startsWith("_") && !Set.of("projectId", "changeDescription", "expectedHash", "changeMetadata").contains(key) && value != null) body.addProperty(key, value);
        });
        body.addProperty("path", plan.result().has("resourceImage") ? plan.request().getOrDefault("path", plan.path()) : plan.path());
        if (plan.result().has("resourceImage")) body.addProperty("resourcePath", plan.path());
        body.addProperty("recordVersion", 2);
        body.addProperty("operationId", pending.id());
        body.addProperty("operationOrder", pending.order());
        body.addProperty("beforeHash", hash(plan.before()));
        body.addProperty("afterHash", hash(plan.after()));
        body.addProperty("beforeText", plan.before());
        body.addProperty("afterText", plan.after());
        if (plan.result().has("resourceImage")) {
            body.addProperty("recordVersion", 3);
            body.add("resources", com.lusiad.backend.service.undo.ResourceImage.pair(
                    com.lusiad.backend.service.undo.ResourceImage.decode(plan.before()), com.lusiad.backend.service.undo.ResourceImage.decode(plan.after())));
            body.remove("beforeText"); body.remove("afterText");
        }
        if (plan.result().has("resourceImage") && plan.result().getAsJsonObject("changeMetadata").get("kind").getAsString().equals("code")) {
            try {
                var previous = com.lusiad.backend.service.undo.ResourceImage.decode(plan.before()).entries().get(plan.path());
                var next = com.lusiad.backend.service.undo.ResourceImage.decode(plan.after()).entries().get(plan.path());
                String before = com.lusiad.backend.service.undo.UndoService.text(previous), after = com.lusiad.backend.service.undo.UndoService.text(next);
                body.addProperty("beforeText", before); body.addProperty("afterText", after);
                body.addProperty("beforeHash", hash(before)); body.addProperty("afterHash", hash(after));
            } catch (java.nio.charset.CharacterCodingException invalid) { throw new IllegalArgumentException("Cannot identify recorded Java source", invalid); }
        }
        for (String key : new String[]{"resources", "navigation"}) if (plan.result().has(key)) body.add(key, plan.result().get(key).deepCopy());
        if (plan.result().has("_undoSession")) body.add("undoSession", plan.result().get("_undoSession"));
        if (plan.result().has("_undoBoundary")) body.add("undoBoundary", plan.result().get("_undoBoundary"));
        if (plan.result().has("_requestProof")) body.add("undoRequestHash", plan.result().get("_requestProof"));
        if (plan.result().has("correctionOf")) body.add("correctionOf", plan.result().get("correctionOf"));
        if (plan.result().has("changeMetadata")) body.add("changeMetadata", plan.result().getAsJsonObject("changeMetadata").deepCopy());
        return body;
    }
}
