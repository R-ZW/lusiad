package com.lusiad.backend.util;

import com.google.gson.Gson;
import junit.framework.TestCase;
import java.util.Map;

public class JsonUtilTest extends TestCase {
    public void testCodeAndPathsSurviveEscapesSeparatorsAndUnicode() {
        String source = "System.out.println(\"alteração Ω: a,b / \\\"quoted\\\"\");\r\n// next: café 😀\n";
        Map<String, String> expected = Map.of("newContent", source, "path", "D:\\projects\\a,b\\Demo.java");
        assertEquals(expected, JsonUtil.parseSimpleJson(new Gson().toJson(expected)));
        assertEquals("Ω", JsonUtil.parseSimpleJson("{\"content\":\"\\u03a9\"}").get("content"));
    }

    public void testLegacyNumbersBooleansAndNullRemainCompatible() {
        Map<String, String> values = JsonUtil.parseSimpleJson("{\"projectId\":11,\"recursive\":true,\"path\":\"\",\"column\":null}");
        assertEquals("11", values.get("projectId"));
        assertEquals("true", values.get("recursive"));
        assertEquals("", values.get("path"));
        assertNull(values.get("column"));
    }

    public void testBundleMetadataRemainsReadableAndMalformedRequestsAreRejected() {
        assertEquals("[\"Demo.java\"]", JsonUtil.parseSimpleJson("{\"paths\":[\"Demo.java\"]}").get("paths"));
        for (String invalid : new String[]{"[]", "null", "{\"content\":\"unfinished}"}) {
            try {
                JsonUtil.parseSimpleJson(invalid);
                fail("Invalid flat request accepted");
            } catch (IllegalArgumentException expected) {
                assertEquals("Expected a valid JSON object", expected.getMessage());
            }
        }
    }
}
