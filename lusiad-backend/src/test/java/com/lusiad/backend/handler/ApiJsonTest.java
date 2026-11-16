package com.lusiad.backend.handler;

import com.google.gson.Gson;
import com.google.gson.JsonParser;
import junit.framework.TestCase;
import java.util.Map;

public class ApiJsonTest extends TestCase {
    public void testDirectorySelectionIsTypedAndNeedsNoRegisteredProject() {
        String id = "3ae6ec66-4114-49a1-a7d0-99395fa84f65";
        var body = new Gson().toJsonTree(Map.of("requestId", id, "operation", "start", "locale", "pt-BR", "path", "D:/Projetos/Árvore")).getAsJsonObject();
        assertEquals("D:/Projetos/Árvore", ApiJson.request("/fs/directory-picker", body.toString()).get("path"));
        for (String operation : new String[]{"status", "cancel"}) {
            body.addProperty("operation", operation);
            assertEquals(id, ApiJson.request("/fs/directory-picker", body.toString()).get("requestId"));
        }
        for (String key : new String[]{"requestId", "operation", "locale"}) {
            var invalid = body.deepCopy(); invalid.remove(key);
            assertInvalid("/fs/directory-picker", invalid.toString());
        }
        body.addProperty("operation", "read-directory"); assertInvalid("/fs/directory-picker", body.toString());
        body.addProperty("operation", "start"); body.add("path", new com.google.gson.JsonArray());
        assertInvalid("/fs/directory-picker", body.toString());
    }

    public void testCommitRestorationIdeRequestsRequireAValidProject() {
        for (String route : new String[]{"/restore/commit/check", "/restore/commit/refresh"}) {
            assertEquals("11", ApiJson.request(route, "{\"projectId\":11}").get("projectId"));
            for (String body : new String[]{"{}", "{\"projectId\":0}", "{\"projectId\":true}", "{\"projectId\":[]}"}) {
                assertInvalid(route, body);
            }
            assertEquals(200, ApiJson.response(route, "{\"status\":\"ok\"}").status());
            assertEquals(422, ApiJson.response(route, ApiJson.error("operation_failed", "Unsaved document")).status());
        }
        assertInvalid("/restore/commit/unknown", "{\"projectId\":11}");
    }

    public void testCompilerRequestsRequireTypedRequestAndContextIdentities() {
        String id = "b3dce567-fc7c-4b82-91bd-b5723cb4a043";
        assertNotNull(ApiJson.request("/java/analyze", "{\"projectId\":1,\"requestId\":\"" + id + "\"}"));
        assertNotNull(ApiJson.request("/java/cancel", "{\"projectId\":1,\"channel\":\"saved\",\"requestId\":\"" + id + "\"}"));
        assertInvalid("/java/analyze", "{\"projectId\":1}");
        assertInvalid("/java/analyze", "{\"projectId\":1,\"requestId\":[]}");
        assertInvalid("/java/check", "{\"projectId\":1,\"contextRevision\":\"old\"}");
        assertInvalid("/java/context", "{\"projectId\":1,\"settings\":[]}");
        assertInvalid("/java/context", "{\"projectId\":1,\"settings\":{\"jdkHome\":\"jdk\",\"release\":\"21\"}}");
        assertInvalid("/java/cancel", "{\"projectId\":1,\"channel\":\"other\"}");
        String edit = "{\"projectId\":1,\"requestId\":\"" + id + "\",\"path\":\"A.java\",\"sourceContent\":\"class A {}\",\"expectedHash\":\"" + "a".repeat(64) + "\",\"operation\":\"update\",\"startOffset\":0,\"endOffset\":10,\"newContent\":\"class A {}\"}";
        assertNotNull(ApiJson.request("/java/analyze-edit", edit));
        assertInvalid("/java/analyze-edit", edit.replace("\"operation\":\"update\"", "\"operation\":\"format\""));
        assertEquals(500, ApiJson.response("/java/analyze", "{\"status\":\"ok\",\"diagnostics\":[]}").status());
    }
    public void testSyntaxOperationRequiresContextRevisionAndTheSameMutationFields() {
        String base = "{\"projectId\":1,\"path\":\"Demo.java\",\"sourceContent\":\"class Demo {}\",\"expectedHash\":\"" + "a".repeat(64) + "\",";
        assertNotNull(ApiJson.request("/psi/diagnose-edit", base + "\"operation\":\"create\",\"line\":1,\"content\":\"int n;\"}"));
        assertNotNull(ApiJson.request("/psi/diagnose-edit", base + "\"operation\":\"delete\",\"startOffset\":0,\"endOffset\":5}"));
        assertInvalid("/psi/diagnose-edit", base + "\"operation\":\"move\"}");
        assertInvalid("/psi/diagnose-edit", base + "\"operation\":\"format\"}");
        assertInvalid("/psi/diagnose-edit", base + "\"operation\":\"update\",\"startOffset\":0,\"endOffset\":5,\"newContent\":{}}");
    }
    public void testSyntaxRequestKeepsFullSourceAndValidatesTheWholeProposal() {
        String source = "class Demo {\r\n String text = \"😀\";\r\n}\r\n";
        var body = new Gson().toJsonTree(Map.of("projectId", 1, "path", "src/Demo.java", "content", source)).getAsJsonObject();
        assertEquals(source, ApiJson.request("/psi/diagnose", body.toString()).get("content"));
        body.addProperty("startOffset", source.length()); body.addProperty("endOffset", source.length()); body.addProperty("newContent", "");
        assertNotNull(ApiJson.request("/psi/diagnose", body.toString()));
        body.addProperty("endOffset", source.length() + 1);
        assertInvalid("/psi/diagnose", body.toString());
        for (String missing : new String[]{"startOffset", "endOffset", "newContent"}) {
            var invalid = body.deepCopy(); invalid.remove(missing); assertInvalid("/psi/diagnose", invalid.toString());
        }
        assertInvalid("/psi/diagnose", "{\"projectId\":1,\"path\":\"Demo.java\",\"content\":{}}");
        assertInvalid("/psi/diagnose", "{\"projectId\":1,\"path\":\"Demo.txt\",\"content\":\"\"}");
        assertInvalid("/psi/diagnose", "{\"projectId\":1,\"path\":\"Demo.java\",\"content\":\"\",\"newContent\":null}");
        assertInvalid("/psi/diagnose", "{\"projectId\":1,\"path\":\"Demo.java\",\"content\":\"\",\"startOffset\":null,\"endOffset\":null,\"newContent\":null}");
    }

    public void testSyntaxResultsAreExplicitAndNeverRequireMutationOrPsiSuccessFields() {
        var valid = new Gson().toJsonTree(Map.of("status", "ok", "version", 1, "source", "psi-syntax", "file", "Demo.java",
                "baseRevision", "a".repeat(64), "revision", "b".repeat(64), "sourceLength", 0,
                "languageLevel", "JDK_25", "diagnostics", java.util.List.of())).getAsJsonObject();
        assertEquals(200, ApiJson.response("/psi/diagnose", valid.toString()).status());
        for (String key : valid.keySet()) {
            var missing = valid.deepCopy(); missing.remove(key);
            assertEquals(key, 500, ApiJson.response("/psi/diagnose", missing.toString()).status());
        }
        for (String status : new String[]{"partial", "cancelled", "error"}) {
            var invalid = valid.deepCopy(); invalid.addProperty("status", status);
            assertEquals(500, ApiJson.response("/psi/diagnose", invalid.toString()).status());
        }
        var point = Map.of("startOffset", 0, "endOffset", 0, "startLine", 1, "startColumn", 1, "endLine", 1, "endColumn", 1);
        valid.add("diagnostics", new Gson().toJsonTree(java.util.List.of(Map.of("severity", "error", "message", "'}' expected", "range", point))));
        assertEquals(200, ApiJson.response("/psi/diagnose", valid.toString()).status());
        valid.getAsJsonArray("diagnostics").get(0).getAsJsonObject().getAsJsonObject("range").addProperty("endOffset", 1);
        assertEquals(500, ApiJson.response("/psi/diagnose", valid.toString()).status());
        assertEquals(422, ApiJson.response("/psi/diagnose", ApiJson.error("syntax_analysis_failed", "failed")).status());
        assertEquals(500, ApiJson.response("/psi/diagnose", "{\"file\":\"Demo.java\",\"tree\":{\"type\":\"PsiJavaFile\"}}").status());
        assertEquals(500, ApiJson.response("/psi/parse", new Gson().toJson(Map.of("status", "ok", "diagnostics", java.util.List.of()))).status());
    }

    public void testEscapesAndLegacyScalarRepresentationsRemainIntact() {
        String source = "System.out.println(\"café 😀: a,b / \\\"Ω\\\"\");\r\n// next\n";
        var body = new Gson().toJson(Map.of("projectId", 11, "path", "src/Demo.java", "line", "1", "content", source, "expectedHash", "a".repeat(64)));
        assertEquals(source, ApiJson.request("/psi/create", body).get("content"));
        assertEquals("true", ApiJson.request("/fs/file/delete", "{\"projectId\":\"11\",\"path\":\"a.java\",\"safe\":true}").get("safe"));
        assertEquals("false", ApiJson.request("/fs/dir/delete", "{\"projectId\":11,\"path\":\"a\",\"recursive\":\"false\"}").get("recursive"));
        assertEquals("", ApiJson.request("/fs/file/create", "{\"projectId\":11,\"path\":\"\",\"name\":\"a.java\"}").get("path"));
        assertEquals("", ApiJson.request("/psi/update", "{\"expectedHash\":\"" + "a".repeat(64) + "\",\"projectId\":11,\"path\":\"a.java\",\"startOffset\":0,\"endOffset\":0,\"newContent\":\"\"}").get("newContent"));
        assertNotNull(ApiJson.request("/psi/delete", "{\"expectedHash\":\"" + "a".repeat(64) + "\",\"projectId\":11,\"path\":\"a.java\",\"startLine\":1,\"startColumn\":1,\"endLine\":1,\"endColumn\":2}"));
    }

    public void testMalformedAndWronglyTypedInputsAreRejected() {
        for (String body : new String[]{"", "null", "[]", "{", "{projectId: 1}", "{'projectId':1}", "{\"projectId\":1,}",
                "{\"projectId\":1} {}", "{\"projectId\":true}", "{\"projectId\":1.5}", "{\"projectId\":2147483648}",
                "{\"projectId\":0}", "{\"projectId\":1,\"fileName\":true,\"content\":\"\"}",
                "{\"projectId\":1,\"fileName\":\"a.java\",\"content\":{}}", "{\"projectId\":1,\"fileName\":\"a.java\",\"content\":null}"}) {
            assertInvalid("/psi/parse", body);
        }
        assertInvalid("/fs/file/create", "{\"projectId\":1,\"path\":\"\",\"name\":[]}");
        assertInvalid("/fs/file/delete", "{\"projectId\":1,\"path\":\"a\",\"safe\":1}");
        assertInvalid("/psi/update", "{\"projectId\":1,\"path\":\"a.java\",\"startOffset\":5,\"endOffset\":2,\"newContent\":\"x\"}");
        assertInvalid("/psi/move", "{\"projectId\":1,\"path\":\"a.java\",\"startOffset\":0,\"endOffset\":1,\"line\":1,\"column\":1,\"lineEnd\":2}");
        assertInvalid("/restore/apply", "{\"changeId\":\"not an id\"}");
        assertInvalid("/restore/apply", "{\"changeId\":1}");
        assertInvalid("/psi/create", "{\"projectId\":1,\"path\":\"a.java\",\"line\":1,\"content\":\"x\",\"componentPlacement\":1}");
        assertInvalid("/restore/apply", "{\"changeId\":1,\"snapshotId\":\"../other\"}");
        assertInvalid("/psi/delete", "{\"projectId\":1,\"path\":\"a.java\",\"startLine\":2,\"startColumn\":1,\"endLine\":1,\"endColumn\":1}");
    }

    public void testServiceErrorsAndPartialRestoresCannotTravelAsSuccess() {
        String detail = "bad \"value\"\r\nΩ\\path: a,b";
        var error = ApiJson.response("/psi/update", new Gson().toJson(Map.of("error", detail)));
        assertEquals(422, error.status());
        assertEquals(detail, JsonParser.parseString(error.body()).getAsJsonObject().get("error").getAsString());
        assertEquals(404, ApiJson.response("/psi/read", "{\"code\":\"psi_file_not_found\",\"error\":\"Java file not found\"}").status());
        assertEquals(409, ApiJson.response("/restore/apply", "{\"status\":\"partial\",\"errorCount\":1}").status());
        for (String invalid : new String[]{"null", "[]", "not JSON", "{}", "{\"status\":\"unknown\"}"}) {
            assertEquals(500, ApiJson.response("/psi/update", invalid).status());
        }
        assertEquals(500, ApiJson.response("/psi/read", "{\"status\":\"ok\"}").status());
        assertEquals(500, ApiJson.response("/psi/read", "{\"file\":\"a.java\",\"tree\":{\"error\":\"failure\"}}").status());
        assertEquals(500, ApiJson.response("/psi/read", "{\"status\":\"error\",\"file\":\"a.java\",\"tree\":{\"type\":\"PsiJavaFile\"}}").status());
        assertEquals(500, ApiJson.response("/psi/update", "{\"status\":\"ok\"}").status());
        var recorded = JsonParser.parseString("{\"status\":\"ok\",\"saved\":true,\"formatting\":{\"status\":\"rejected\"}}").getAsJsonObject();
        recorded.addProperty("revision", "a".repeat(64)); recorded.addProperty("operationId", java.util.UUID.randomUUID().toString());
        recorded.addProperty("operationOrder", 1); recorded.addProperty("changeId", 1); recorded.addProperty("recordVersion", 2);
        assertEquals(200, ApiJson.response("/psi/update", recorded.toString()).status());
    }

    private void assertInvalid(String route, String body) {
        if (java.util.Set.of("/psi/create", "/psi/update", "/psi/delete", "/psi/move").contains(route)) {
            try { var json = JsonParser.parseString(body).getAsJsonObject(); json.addProperty("expectedHash", "a".repeat(64)); body = json.toString(); }
            catch (RuntimeException ignored) { }
        }
        try { ApiJson.request(route, body); fail("Invalid request accepted: " + body); }
        catch (IllegalArgumentException expected) { assertNotNull(expected.getMessage()); }
    }

    public void testRevisionIsRequiredAndPendingErrorsKeepTheirIdentity() {
        var request = new Gson().toJsonTree(Map.of("projectId", 1, "path", "Demo.java", "startOffset", 0, "endOffset", 1, "newContent", "x")).getAsJsonObject();
        for (String hash : new String[]{null, "old", "A".repeat(64)}) {
            if (hash != null) request.addProperty("expectedHash", hash);
            try { ApiJson.request("/psi/update", request.toString()); fail("Missing/invalid model revision accepted"); }
            catch (IllegalArgumentException expected) { }
        }
        request.addProperty("expectedHash", "a".repeat(64));
        assertEquals("a".repeat(64), ApiJson.request("/psi/update", request.toString()).get("expectedHash"));
        var response = ApiJson.response("/psi/update", "{\"error\":\"pending\",\"code\":\"operation_pending\",\"operationId\":\"known-id\"}");
        assertEquals(409, response.status());
        assertEquals("known-id", JsonParser.parseString(response.body()).getAsJsonObject().get("operationId").getAsString());
    }
    public void testUndoBoundaryRequiresExactCursorAndRejectsNonStringDrafts() {
        String id = "bfa0060c-24b5-4309-bd89-a8c57714fd71";
        var body = new Gson().toJsonTree(Map.of("projectId",1,"direction","undo","epoch",id,"requestId",id,"revision",0)).getAsJsonObject();
        assertEquals("0",ApiJson.request("/undo/apply",body.toString()).get("revision"));
        for (String key : new String[]{"epoch","direction","requestId","revision"}) {
            var invalid = body.deepCopy(); invalid.remove(key); assertInvalid("/undo/apply",invalid.toString());
        }
        body.add("corrections",new Gson().toJsonTree(Map.of("A.java",123))); assertInvalid("/undo/apply",body.toString());
        assertEquals("1",ApiJson.request("/undo/status","{\"projectId\":1}").get("projectId"));
    }
}
