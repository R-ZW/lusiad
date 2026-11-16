package com.lusiad.backend.service.undo;

import com.google.gson.*;
import com.intellij.openapi.project.Project;
import com.lusiad.backend.service.psi.*;
import java.nio.charset.*;
import java.nio.ByteBuffer;
import java.util.*;

public final class UndoService {
    private UndoService() {}
    public static JsonObject status(Project host, int projectId, String root) throws Exception {
        return com.lusiad.backend.repository.change.EditOperationStore.readUndoStatus(
                new com.lusiad.backend.repository.sql.SqlConnectionFactory(com.lusiad.backend.service.change.ChangeLogService.databaseConfiguration()), projectId, root);
    }
    public record Proposal(UndoRegistry.Step step, ResourceImage before, ResourceImage after, String boundary, JsonObject view) {}
    public static Proposal preview(Project host, int projectId, String root, Map<String,String> req) throws Exception {
        try (var store = ResourceEdits.store(projectId, root)) {
            EditCoordinator.recover(store, PsiService.recordedDisk(host, root)); store.reconcileUndo(); store.requireBaseline();
            var step = UndoRegistry.top(projectId, root, store.boundary(), req.get("direction"), req.get("epoch"), Long.parseLong(req.get("revision")));
            ResourceImage before = req.get("direction").equals("undo") ? step.after() : step.before();
            ResourceImage after = corrected(req, req.get("direction").equals("undo") ? step.before() : step.after(), before); before.requireCurrent(root);
            JsonObject view = new JsonObject(); view.addProperty("status", "ok"); view.addProperty("version", 1);
            for (String key : new String[]{"direction", "epoch", "requestId"}) view.addProperty(key, req.get(key));
            view.addProperty("revision", Long.parseLong(req.get("revision"))); view.addProperty("logicalId", step.id());
            view.addProperty("path", step.path()); view.add("metadata", step.metadata().deepCopy());
            JsonArray files = new JsonArray(); Set<String> paths = new TreeSet<>(before.entries().keySet()); paths.addAll(after.entries().keySet());
            for (String path : paths) {
                var previous = before.entries().get(path); var next = after.entries().get(path);
                if (Objects.equals(previous, next)) continue;
                JsonObject file = new JsonObject(); file.addProperty("path", path);
                file.add("beforeKind", previous == null ? JsonNull.INSTANCE : new JsonPrimitive(previous.kind()));
                file.add("afterKind", next == null ? JsonNull.INSTANCE : new JsonPrimitive(next.kind()));
                if (path.toLowerCase(Locale.ROOT).endsWith(".java")) {
                    try {
                        file.add("beforeText", previous == null || !previous.kind().equals("file") ? JsonNull.INSTANCE : new JsonPrimitive(text(previous)));
                        file.add("afterText", next == null || !next.kind().equals("file") ? JsonNull.INSTANCE : new JsonPrimitive(text(next)));
                    } catch (CharacterCodingException invalidEncoding) {
                        file.add("beforeText", JsonNull.INSTANCE); file.add("afterText", JsonNull.INSTANCE);
                        file.addProperty("analysisError", "Java source encoding cannot be analyzed; the captured bytes remain intact");
                    }
                }
                files.add(file);
            }
            view.add("files", files); return new Proposal(step, before, after, store.boundary(), view);
        }
    }
    public static JsonObject apply(Project host, int projectId, String root, Map<String,String> req) throws Exception {
        try (var store = ResourceEdits.store(projectId, root)) {
            EditCoordinator.Disk disk = PsiService.recordedDisk(host, root); EditCoordinator.recover(store, disk); store.reconcileUndo();
            JsonObject receipt = store.receipt(req.get("requestId"), requestProof(req)); if (receipt != null) { receipt.addProperty("recovered", true); return receipt; }
            store.requireBaseline();
            var step = UndoRegistry.top(projectId, root, store.boundary(), req.get("direction"), req.get("epoch"), Long.parseLong(req.get("revision")));
            boolean undo = req.get("direction").equals("undo");
            ResourceImage before = undo ? step.after() : step.before(), after = corrected(req, undo ? step.before() : step.after(), before);
            before.requireCurrent(root);
            JsonObject metadata = step.metadata().deepCopy();
            if (undo) {
                JsonElement previous = metadata.get("before"); metadata.add("before", metadata.get("after")); metadata.add("after", previous);
                String action = metadata.get("action").getAsString();
                if (action.endsWith("create")) metadata.addProperty("action", action.substring(0, action.length()-6)+"delete");
                else if (action.endsWith("delete")) metadata.addProperty("action", action.substring(0, action.length()-6)+"create");
                if (metadata.has("differences")) for (var item : metadata.getAsJsonArray("differences")) { var difference = item.getAsJsonObject(); var old = difference.get("before"); difference.add("before", difference.get("after")); difference.add("after", old); }
            }
            String type = metadata.get("action").getAsString();
            Map<String,String> request = new HashMap<>(); request.put("path", step.path());
            request.put("_scope", metadata.get("kind").getAsString().equals("code") ? "file" : metadata.get("kind").getAsString().equals("directory") ? "project" : "dir");
            JsonObject response = new JsonObject(); response.addProperty("status", "ok"); response.addProperty("path", step.path());
            JsonObject navigation = new JsonObject();
            for (String name : new String[]{"epoch", "direction", "requestId"}) navigation.addProperty(name, req.get(name));
            navigation.addProperty("logicalId", step.id()); navigation.addProperty("originalChangeId", step.originalChangeId()); navigation.addProperty("compensatedChangeId", step.lastChangeId());
            if (!req.containsKey("corrections")) response.add("navigation", navigation);
            else response.add("correctionOf", navigation);
            response.addProperty("_requestId", req.get("requestId"));
            response.addProperty("_requestProof", requestProof(req));
            if (req.containsKey("corrections") && metadata.get("kind").getAsString().equals("code")) {
                var oldText = text(before.entries().get(step.path())); var newText = text(after.entries().get(step.path()));
                JsonObject range = new JsonObject(); range.addProperty("startOffset", 0); range.addProperty("endOffset", oldText.length()); range.addProperty("insertedChars", newText.length());
                metadata = com.intellij.openapi.application.ReadAction.compute(() -> com.lusiad.backend.service.change.ChangeMetadata.code(host, step.path(), "update", oldText, newText, newText, range));
                type = "update";
            }
            var plan = ResourceEdits.imagePlan(root, step.path(), type, request, before, after, metadata, response);
            JsonObject result = EditCoordinator.execute(store, disk, EditCoordinator.hash(plan.before()), () -> plan);
            if (result.has("noOp") && result.get("noOp").getAsBoolean()) result.addProperty("requestId", req.get("requestId"));
            result.add("state", UndoRegistry.status(projectId, root, store.boundary())); return result;
        }
    }
    public static JsonObject receipt(Project host, int projectId, String root, Map<String,String> req) throws Exception {
        try (var store = ResourceEdits.store(projectId, root)) {
            EditCoordinator.recover(store, PsiService.recordedDisk(host, root)); store.reconcileUndo();
            JsonObject receipt = store.receipt(req.get("requestId"), requestProof(req));
            if (receipt == null) throw new EditCoordinator.Failure("undo_not_confirmed", "No confirmed receipt for this request; preserve the state and inspect before retrying", req.get("requestId"), null);
            receipt.addProperty("recovered", true); return receipt;
        }
    }
    private static String requestProof(Map<String,String> req) {
        var body = new TreeMap<String,String>();
        for (String key : List.of("direction", "epoch", "revision", "corrections")) if (req.containsKey(key)) body.put(key, req.get(key));
        return EditCoordinator.hash(ResourceImage.JSON.toJson(body));
    }
    private static ResourceImage corrected(Map<String,String> req, ResourceImage image, ResourceImage current) {
        if (!req.containsKey("corrections")) return image;
        JsonObject corrections = JsonParser.parseString(req.get("corrections")).getAsJsonObject();
        if (corrections.isEmpty()) throw new IllegalArgumentException("Correction draft is empty");
        var entries = new TreeMap<>(image.entries());
        for (var item : corrections.entrySet()) {
            var original = entries.get(item.getKey());
            if (original == null || !original.kind().equals("file") || !item.getKey().toLowerCase(Locale.ROOT).endsWith(".java")
                || !item.getValue().isJsonPrimitive() || !item.getValue().getAsJsonPrimitive().isString()) throw new IllegalArgumentException("Correction outside the proposed Java resources");
            var existing = current.entries().get(item.getKey());
            entries.put(item.getKey(), correctedText(existing != null && existing.kind().equals("file") ? existing : original, item.getValue().getAsString()));
        }
        return new ResourceImage(image.roots(), entries);
    }
    static ResourceImage.Entry correctedText(ResourceImage.Entry original, String proposed) {
        try {
            String normalized = proposed.replace("\r\n", "\n").replace('\r', '\n');
            if (text(original).equals(normalized)) return original;
            byte[] bytes = original.bytes(); Charset charset = StandardCharsets.UTF_8; int prefix = 0;
            if (bytes.length >= 2 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 254) { charset = StandardCharsets.UTF_16LE; prefix = 2; }
            else if (bytes.length >= 2 && (bytes[0] & 255) == 254 && (bytes[1] & 255) == 255) { charset = StandardCharsets.UTF_16BE; prefix = 2; }
            else if (bytes.length >= 3 && (bytes[0] & 255) == 239 && (bytes[1] & 255) == 187 && (bytes[2] & 255) == 191) prefix = 3;
            String previous = charset.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes, prefix, bytes.length - prefix)).toString();
            String separator = previous.contains("\r\n") ? "\r\n" : previous.contains("\r") ? "\r" : "\n";
            ByteBuffer encoded = charset.newEncoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                    .encode(java.nio.CharBuffer.wrap(normalized.replace("\n", separator)));
            byte[] result = Arrays.copyOf(bytes, prefix + encoded.remaining()); encoded.get(result, prefix, encoded.remaining());
            return ResourceImage.Entry.file(result);
        } catch (CharacterCodingException invalid) { throw new IllegalArgumentException("The correction cannot preserve the Java source encoding", invalid); }
    }
    public static String text(ResourceImage.Entry entry) throws CharacterCodingException {
        byte[] bytes = entry.bytes(); Charset charset = StandardCharsets.UTF_8;
        if (bytes.length >= 2 && ((bytes[0] & 255) == 255 && (bytes[1] & 255) == 254 || (bytes[0] & 255) == 254 && (bytes[1] & 255) == 255)) charset = StandardCharsets.UTF_16;
        String value = charset.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        if (value.startsWith("\ufeff")) value = value.substring(1);
        return value.replace("\r\n", "\n").replace('\r', '\n');
    }
}
