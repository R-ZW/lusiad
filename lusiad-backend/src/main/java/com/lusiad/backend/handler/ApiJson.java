package com.lusiad.backend.handler;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.Strictness;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/** HTTP boundary only. Historical req_body decoding deliberately remains in JsonUtil. */
public final class ApiJson {
    private static final Gson JSON = new GsonBuilder().setStrictness(Strictness.STRICT).create();
    private static final Set<String> TEXT = Set.of("path", "sourcePath", "destPath", "name", "fileName",
            "content", "newContent", "sourceContent", "operation", "expectedType", "changeDescription", "snapshotId", "expectedHash",
            "requestId", "contextRevision", "configurationRevision", "channel", "direction", "epoch", "main", "runId", "gitId", "pendingRevision", "selectionRevision",
            "description", "newPath", "registryRevision", "adminAction", "confirmation");
    private static final Set<String> INTEGER = Set.of("projectId", "changeId", "startOffset", "endOffset",
            "line", "lineEnd", "column", "startLine", "startColumn", "endLine", "endColumn", "branchId");
    private static final Set<String> BOOLEAN = Set.of("safe", "overwrite", "recursive", "strictType", "componentPlacement", "semantic", "allowWithoutUndo");

    private ApiJson() {}

    public static Map<String, String> request(String route, String body) {
        JsonObject object;
        try {
            object = JSON.fromJson(body, JsonObject.class);
            if (object == null) throw new IllegalArgumentException();
        } catch (RuntimeException invalid) {
            throw new IllegalArgumentException("Expected a valid JSON object");
        }
        Map<String, String> values = new HashMap<>();
        for (var entry : object.entrySet()) {
            String key = entry.getKey();
            JsonElement value = entry.getValue();
            if (value.isJsonNull()) continue; // Optional nulls keep their existing default.
            if (TEXT.contains(key) && (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString())) {
                throw invalid(key + " must be a string");
            }
            if (INTEGER.contains(key)) {
                if (!value.isJsonPrimitive() || value.getAsJsonPrimitive().isBoolean()) {
                    throw invalid(key + " must be an integer");
                }
                String text = value.getAsString().trim();
                int minimum = key.endsWith("Offset") || (key.equals("changeId") && route.startsWith("/restore/rewind/")) ? 0 : 1;
                try {
                    if (!text.matches("-?\\d+")) throw new NumberFormatException();
                    int number = Integer.parseInt(text);
                    if (number < minimum) throw new NumberFormatException();
                    values.put(key, Integer.toString(number));
                } catch (NumberFormatException outOfRange) {
                    throw invalid(key + " must be an integer >= " + minimum);
                }
            } else if (BOOLEAN.contains(key)) {
                if (!value.isJsonPrimitive() || !(value.getAsJsonPrimitive().isBoolean()
                        || value.getAsJsonPrimitive().isString())
                        || !("true".equalsIgnoreCase(value.getAsString().trim())
                        || "false".equalsIgnoreCase(value.getAsString().trim()))) {
                    throw invalid(key + " must be a boolean");
                }
                values.put(key, value.getAsString().trim().toLowerCase(java.util.Locale.ROOT));
            } else {
                // Unknown metadata is retained for compatibility, never used as a known typed field.
                values.put(key, value.isJsonPrimitive() ? value.getAsString() : value.toString());
            }
        }

        if (route.equals("/ide/projects")) {
            if(!Set.of("status","presence").contains(values.getOrDefault("action","")))throw invalid("Invalid IDE status action");
            if("presence".equals(values.get("action"))){required(values,"projectId",false);required(values,"tabId",false);if(!values.get("tabId").matches("[a-zA-Z0-9-]{16,64}") || object.has("close") && (!object.get("close").isJsonPrimitive() || !object.get("close").getAsJsonPrimitive().isBoolean()))throw invalid("Invalid presence");}
            return values;
        }
        if (route.equals("/fs/directory-picker")) {
            required(values, "requestId", false);
            if (!values.get("requestId").matches("[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")) throw invalid("Invalid directory selection id");
            if (!Set.of("start", "status", "cancel").contains(values.getOrDefault("operation", ""))) throw invalid("Invalid directory selection operation");
            if (!Set.of("en", "pt-BR").contains(values.getOrDefault("locale", ""))) throw invalid("Invalid directory selection locale");
            String path = values.getOrDefault("path", "");
            if (path.length() > 4096 || path.indexOf(0) >= 0) throw invalid("Invalid initial folder");
            return values; // Registration does not yet have a project id; selection alone grants no write authority.
        }
        if (route.startsWith("/projects/")) {
            if (!Set.of("read","update","preview","apply","operations","recover").contains(route.substring(10))) throw invalid("Unknown project action");
            if (!route.equals("/projects/operations")) required(values,"projectId",false);
            if (route.endsWith("/update") || route.endsWith("/apply")) {
                required(values,"registryRevision",false);
                if(!values.get("registryRevision").matches("[a-f0-9]{64}"))throw invalid("Invalid registration revision");
            }
            if(route.endsWith("/update")){required(values,"name",false);if(values.get("name").length()>255 || values.getOrDefault("description","").length()>16384)throw invalid("Project text is too long");}
            if(route.endsWith("/preview") || route.endsWith("/apply")) {
                if(!Set.of("remove","delete","relink","move").contains(values.getOrDefault("adminAction","")))throw invalid("Invalid project action");
                if(Set.of("relink","move").contains(values.getOrDefault("adminAction","")))required(values,"newPath",false);
            }
            if(route.endsWith("/apply") || route.endsWith("/recover")) {
                required(values,"requestId",false);
                if(!values.get("requestId").matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}"))throw invalid("Invalid project operation id");
            }
            if(route.endsWith("/apply"))required(values,"confirmation",false);
            return values;
        }
        if (route.equals("/restore/apply") || route.equals("/restore/pending")) {
            required(values, "changeId", false);
            required(values, "snapshotId", false);
            if (values.containsKey("snapshotId") && !values.get("snapshotId").matches("compare-[a-f0-9-]{36}")) {
                throw invalid("Invalid comparison snapshot id");
            }
            if (route.equals("/restore/pending")) {
                for (String key : new String[]{"projectId", "branchId", "gitId", "pendingRevision"}) required(values, key, false);
                if (!values.get("gitId").matches("[a-fA-F0-9]{40,64}")
                        || !values.get("pendingRevision").matches("[0-9]+:[0-9]+"))
                    throw invalid("Invalid pending preview revision");
            }
            return values;
        }
        if (route.equals("/restore/rewind/preview") || route.equals("/restore/rewind/apply")) {
            for (String key : new String[]{"projectId", "changeId", "branchId", "gitId", "pendingRevision", "snapshotId"}) required(values, key, false);
            if (!values.get("gitId").matches("[a-fA-F0-9]{40,64}")
                    || !values.get("pendingRevision").matches("[0-9]+:[0-9]+")
                    || !values.get("snapshotId").matches("compare-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}"))
                throw invalid("Invalid pending rewind identity");
            if (route.endsWith("/apply")) {
                required(values, "requestId", false);
                required(values, "selectionRevision", false);
                if (!values.get("requestId").matches("[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")) throw invalid("Invalid rewind request id");
                if (!values.get("selectionRevision").matches("[a-f0-9]{64}")) throw invalid("Invalid rewind selection");
            }
            return values;
        }
        required(values, "projectId", false);
        if (Set.of("/restore/commit/check", "/restore/commit/refresh").contains(route)) return values;
        if (route.startsWith("/run/")) {
            if (!Set.of("/run/list", "/run/start", "/run/status", "/run/stop").contains(route)) throw invalid("Unknown Java run action");
            if (route.equals("/run/start")) {
                required(values, "main", false); required(values, "contextRevision", false);
                if (!values.get("contextRevision").matches("[a-f0-9]{64}") || values.get("main").length() > 512)
                    throw invalid("Invalid Java run selection");
            }
            if (route.equals("/run/stop")) {
                required(values, "runId", false);
                if (!values.get("runId").matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")) throw invalid("Invalid Java run id");
            }
            return values;
        }
        if (route.startsWith("/undo/")) {
            if (!Set.of("/undo/status", "/undo/preview", "/undo/analyze", "/undo/apply", "/undo/receipt", "/undo/cancel").contains(route)) throw invalid("Unknown undo operation");
            if (!route.equals("/undo/status")) {
                required(values, "requestId", false);
                if (!values.get("requestId").matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")) throw invalid("Invalid undo request id");
            }
            if (!Set.of("/undo/status", "/undo/cancel").contains(route)) {
                if (!Set.of("undo", "redo").contains(values.getOrDefault("direction", ""))) throw invalid("Invalid undo direction");
                required(values, "epoch", false); required(values, "revision", false);
                if (!values.get("epoch").matches("[a-f0-9-]{36}") || !values.get("revision").matches("\\d{1,15}")) throw invalid("Invalid undo cursor");
                if (object.has("corrections") && (!object.get("corrections").isJsonObject() || object.getAsJsonObject("corrections").entrySet().stream().anyMatch(item -> !item.getValue().isJsonPrimitive() || !item.getValue().getAsJsonPrimitive().isString()))) throw invalid("Correction draft must contain source strings");
            }
            return values;
        }
        if (route.startsWith("/java/")) {
            if (!Set.of("/java/context", "/java/analyze", "/java/analyze-edit", "/java/check", "/java/cancel").contains(route)) throw invalid("Unknown Java operation");
            if (values.containsKey("channel") && !Set.of("saved", "proposal", "context", "check").contains(values.get("channel"))) throw invalid("Invalid analysis channel");
            if (route.equals("/java/cancel") && !Set.of("saved", "proposal").contains(values.getOrDefault("channel", ""))) throw invalid("Invalid cancel channel");
            if (route.equals("/java/context") && object.has("settings")) {
                if (!object.get("settings").isJsonObject()) throw invalid("settings must be an object");
                com.lusiad.backend.service.diagnostics.JavaAnalysisContext.parseSettings(object.getAsJsonObject("settings"));
                required(values, "configurationRevision", false);
            }
            if (route.equals("/java/check")) {
                required(values, "contextRevision", false);
                if (!values.get("contextRevision").matches("[a-f0-9]{64}")) throw invalid("Invalid Java context revision");
            }
            if (route.equals("/java/analyze") || route.equals("/java/analyze-edit") || route.equals("/java/cancel")) {
                required(values, "requestId", false);
                if (!values.get("requestId").matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")) throw invalid("Invalid analysis request id");
            }
            if (route.equals("/java/analyze-edit")) request("/psi/diagnose-edit", body);
            return values;
        }
        if (route.equals("/uml/render")) {
            for (String key : new String[]{"beforeFiles", "afterFiles", "operation", "locale"}) required(values, key, false);
            return values; // The isolated UML boundary validates its structured fields, never raw PUML.
        }
        if (route.equals("/uml/current")) {
            for (String key : new String[]{"files", "locale"}) required(values, key, false);
            return values;
        }
        if (route.equals("/psi/recover")) return values;
        if (route.equals("/psi/diagnose-edit")) {
            required(values, "sourceContent", true);
            required(values, "operation", false);
            String operation = values.get("operation");
            if (!Set.of("create", "update", "move", "delete").contains(operation)) throw invalid("Invalid proposed operation");
            // Reuse the mutation boundary, including required revision and destination validation.
            request("/psi/" + operation, body);
            return values;
        }
        if (Set.of("/psi/create", "/psi/update", "/psi/delete", "/psi/move").contains(route)) {
            required(values, "expectedHash", false);
            if (!values.get("expectedHash").matches("[a-f0-9]{64}")) throw invalid("expectedHash must be a SHA-256 revision");
        }
        switch (route) {
            case "/psi/diagnose" -> {
                required(values, "path", false);
                required(values, "content", true);
                if (!values.get("path").toLowerCase(java.util.Locale.ROOT).endsWith(".java")) throw invalid("path must identify a Java file");
                if (object.has("startOffset") || object.has("endOffset") || object.has("newContent")) {
                    range(values);
                    required(values, "newContent", true);
                    if (Integer.parseInt(values.get("endOffset")) > values.get("content").length()) throw invalid("proposal range exceeds content");
                }
            }
            case "/psi/parse" -> {
                required(values, "fileName", false);
                required(values, "content", true);
                if (!values.get("fileName").matches("(?:[\\p{L}_$][\\p{L}\\p{N}_$]*|package-info|module-info)\\.java")) {
                    throw invalid("Invalid Java file name");
                }
            }
            case "/psi/read", "/psi/format" -> required(values, "path", false);
            case "/psi/create", "/psi/move" -> {
                required(values, "path", false);
                required(values, "line", false);
                if (route.endsWith("create")) required(values, "content", true);
                else range(values);
                if (values.containsKey("column") && values.containsKey("lineEnd")) {
                    throw invalid("column and lineEnd cannot be used together");
                }
                if (values.containsKey("lineEnd") && Long.parseLong(values.get("lineEnd"))
                        != Long.parseLong(values.get("line")) + 1) throw invalid("lineEnd must be line + 1");
            }
            case "/psi/update" -> {
                required(values, "path", false);
                required(values, "newContent", true);
                range(values);
            }
            case "/psi/delete" -> {
                required(values, "path", false);
                if (values.containsKey("startOffset") || values.containsKey("endOffset")) range(values);
                else {
                    for (String key : new String[]{"startLine", "startColumn", "endLine", "endColumn"}) {
                        required(values, key, false);
                    }
                    int startLine = Integer.parseInt(values.get("startLine"));
                    int endLine = Integer.parseInt(values.get("endLine"));
                    if (endLine < startLine || endLine == startLine && Integer.parseInt(values.get("endColumn"))
                            < Integer.parseInt(values.get("startColumn"))) throw invalid("end position must be >= start position");
                }
            }
            case "/fs/file/create", "/fs/dir/create" -> {
                required(values, "path", true);
                required(values, "name", false);
                if (route.equals("/fs/file/create") && !javaFileName(values.get("name")))
                    throw invalid("Only .java files can be created");
            }
            case "/fs/reveal" -> required(values, "path", true);
            case "/fs/file/rename", "/fs/dir/rename" -> {
                required(values, "path", false);
                required(values, "name", false);
            }
            case "/fs/file/delete", "/fs/dir/delete" -> required(values, "path", false);
            case "/fs/file/move", "/fs/dir/move" -> {
                required(values, "sourcePath", false);
                required(values, "destPath", true);
            }
            default -> throw invalid("Unknown JSON operation");
        }
        if (Set.of("/psi/create", "/psi/update", "/psi/delete", "/psi/move", "/psi/format").contains(route)
                && !values.getOrDefault("path", "").toLowerCase(java.util.Locale.ROOT).endsWith(".java"))
            throw invalid("Non-Java files are read only");
        return values;
    }

    public static boolean javaFileName(String name) {
        return name != null && name.trim().length() > 5 && !name.contains("/") && !name.contains("\\")
                && name.trim().toLowerCase(java.util.Locale.ROOT).endsWith(".java");
    }

    private static void range(Map<String, String> values) {
        required(values, "startOffset", false);
        required(values, "endOffset", false);
        if (Integer.parseInt(values.get("endOffset")) < Integer.parseInt(values.get("startOffset"))) {
            throw invalid("endOffset must be >= startOffset");
        }
    }

    private static void required(Map<String, String> values, String key, boolean allowEmpty) {
        if (!values.containsKey(key) || (!allowEmpty && values.get(key).isBlank())) {
            throw invalid(key + " is required");
        }
    }

    private static IllegalArgumentException invalid(String message) { return new IllegalArgumentException(message); }

    public static String error(String code, String message) {
        JsonObject error = new JsonObject();
        error.addProperty("status", "error");
        error.addProperty("code", code);
        error.addProperty("error", message == null ? "unknown error" : message);
        return JSON.toJson(error);
    }

    public record Response(int status, String body) {}

    /** Keep successful payloads intact; legacy service errors must not travel as HTTP success. */
    public static Response response(String route, String body) {
        try {
            JsonObject result = JSON.fromJson(body, JsonObject.class);
            if (result == null) throw new IllegalArgumentException();
            if (result.has("error")) {
                if (!result.get("error").isJsonPrimitive() || !result.get("error").getAsJsonPrimitive().isString()) {
                    throw new IllegalArgumentException();
                }
                String message = result.get("error").getAsString();
                String code = result.has("code") && result.get("code").isJsonPrimitive()
                        && result.get("code").getAsJsonPrimitive().isString()
                        ? result.get("code").getAsString() : "operation_failed";
                boolean missing = route.equals("/psi/read") && "psi_file_not_found".equals(code);
                int status = missing ? 404 : Set.of("revision_conflict", "recovery_conflict", "operation_pending", "operation_busy").contains(code) ? 409
                        : "record_unavailable".equals(code) ? 503 : 422;
                result.addProperty("status", "error"); result.addProperty("code", code);
                return new Response(status, result.toString());
            }
            if (route.equals("/psi/diagnose") || route.equals("/psi/diagnose-edit")) {
                if (!isSyntaxResult(result)) throw new IllegalArgumentException();
                if (route.equals("/psi/diagnose-edit") && (!stringField(result, "proposedContent") || !stringField(result, "operation")
                        || !Set.of("create", "update", "move", "delete").contains(result.get("operation").getAsString()))) throw new IllegalArgumentException();
                return new Response(200, body);
            }
            if (route.equals("/java/analyze") || route.equals("/java/analyze-edit")) {
                if (!stringField(result, "status") || !result.get("status").getAsString().equals("ok")
                        || !stringField(result, "source") || !result.get("source").getAsString().equals("javac")
                        || !stringField(result, "requestId") || !stringField(result, "contextRevision")
                        || !result.get("contextRevision").getAsString().matches("[a-f0-9]{64}")
                        || !result.has("files") || !result.get("files").isJsonArray()
                        || !result.has("diagnostics") || !result.get("diagnostics").isJsonArray()) throw new IllegalArgumentException();
                return new Response(200, body);
            }
            if (result.has("status") && "partial".equals(result.get("status").getAsString())) {
                result.addProperty("code", "incomplete_restore");
                result.addProperty("error", "Change reconstruction is incomplete");
                return new Response(409, JSON.toJson(result));
            }
            if (result.has("status") && !"ok".equals(result.get("status").getAsString())) {
                throw new IllegalArgumentException();
            }
            if (route.startsWith("/psi/") && !Set.of("/psi/read", "/psi/parse", "/psi/recover").contains(route)) {
                if (!result.has("saved") || !result.get("saved").isJsonPrimitive()
                        || !result.get("saved").getAsJsonPrimitive().isBoolean() || !result.get("saved").getAsBoolean()
                        || !result.has("formatting") || !result.get("formatting").isJsonObject()
                        || !stringField(result.getAsJsonObject("formatting"), "status")
                        || !Set.of("formatted", "skipped_whitespace", "rejected", "failed")
                        .contains(result.getAsJsonObject("formatting").get("status").getAsString()))
                    throw new IllegalArgumentException();
                if (!route.equals("/psi/format") && !(result.has("noOp") && result.get("noOp").getAsBoolean()) && (!stringField(result, "revision") || !result.get("revision").getAsString().matches("[a-f0-9]{64}")
                        || !stringField(result, "operationId") || !result.get("operationId").getAsString().matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")
                        || !positiveInteger(result, "operationOrder") || !positiveInteger(result, "changeId")
                        || !positiveInteger(result, "recordVersion") || result.get("recordVersion").getAsInt() != 2)) throw new IllegalArgumentException();
            }
            boolean psi = route.equals("/psi/read") || route.equals("/psi/parse");
            if (psi ? isPsiResult(result)
                    : result.has("status") && "ok".equals(result.get("status").getAsString())) {
                return new Response(200, body);
            }
        } catch (RuntimeException invalid) {
            // A service contract defect is an internal error, never a successful empty payload.
        }
        return new Response(500, error("invalid_response", "Invalid service response"));
    }

    private static boolean isPsiResult(JsonObject result) {
        if (!stringField(result, "file") || !result.has("tree") || !result.get("tree").isJsonObject()) return false;
        JsonObject tree = result.getAsJsonObject("tree");
        return !tree.has("error") && stringField(tree, "type");
    }

    private static boolean isSyntaxResult(JsonObject result) {
        if (!stringField(result, "status") || !result.get("status").getAsString().equals("ok")
                || !positiveInteger(result, "version") || !result.get("version").getAsString().equals("1")
                || !stringField(result, "source") || !result.get("source").getAsString().equals("psi-syntax")
                || !stringField(result, "file") || result.get("file").getAsString().isBlank()
                || !stringField(result, "languageLevel") || !result.get("languageLevel").getAsString().matches("JDK_(1_[3-9]|[1-9][0-9]*)")
                || !stringField(result, "revision") || !result.get("revision").getAsString().matches("[a-f0-9]{64}")
                || !stringField(result, "baseRevision") || !result.get("baseRevision").getAsString().matches("[a-f0-9]{64}")
                || !nonnegativeInteger(result, "sourceLength") || !result.has("diagnostics") || !result.get("diagnostics").isJsonArray()) return false;
        int length = result.get("sourceLength").getAsInt();
        for (JsonElement item : result.getAsJsonArray("diagnostics")) {
            if (!item.isJsonObject()) return false;
            JsonObject problem = item.getAsJsonObject();
            if (!stringField(problem, "severity") || !problem.get("severity").getAsString().equals("error")
                    || !stringField(problem, "message") || problem.get("message").getAsString().isBlank() || !problem.has("range")) return false;
            if (problem.get("range").isJsonNull()) continue;
            if (!problem.get("range").isJsonObject()) return false;
            JsonObject range = problem.getAsJsonObject("range");
            if (!nonnegativeInteger(range, "startOffset") || !nonnegativeInteger(range, "endOffset")
                    || range.get("startOffset").getAsInt() > range.get("endOffset").getAsInt()
                    || range.get("endOffset").getAsInt() > length) return false;
            for (String key : new String[]{"startLine", "startColumn", "endLine", "endColumn"})
                if (!nonnegativeInteger(range, key) || range.get(key).getAsInt() == 0) return false;
            int first = range.get("startLine").getAsInt(), last = range.get("endLine").getAsInt();
            if (last < first || last == first && range.get("endColumn").getAsInt() < range.get("startColumn").getAsInt()) return false;
        }
        return true;
    }

    private static boolean nonnegativeInteger(JsonObject object, String key) {
        return object.has(key) && object.get(key).isJsonPrimitive() && object.get(key).getAsJsonPrimitive().isNumber()
                && object.get(key).getAsString().matches("0|[1-9][0-9]*") && Integer.parseInt(object.get(key).getAsString()) >= 0;
    }

    private static boolean stringField(JsonObject object, String key) {
        return object.has(key) && object.get(key).isJsonPrimitive() && object.get(key).getAsJsonPrimitive().isString();
    }

    private static boolean positiveInteger(JsonObject object, String key) {
        return object.has(key) && object.get(key).isJsonPrimitive() && object.get(key).getAsJsonPrimitive().isNumber()
                && object.get(key).getAsString().matches("[1-9][0-9]*");
    }
}
