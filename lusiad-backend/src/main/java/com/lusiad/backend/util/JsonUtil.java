package com.lusiad.backend.util;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import java.util.HashMap;
import java.util.Map;

public final class JsonUtil {
    private JsonUtil() {}

    /** Retains the existing flat string-map contract; JSON decoding belongs to Gson. */
    public static Map<String, String> parseSimpleJson(String json) {
        Map<String, String> values = new HashMap<>();
        if (json == null || json.isBlank()) return values;
        try {
            JsonElement root = JsonParser.parseString(json);
            if (!root.isJsonObject()) throw new IllegalArgumentException();
            for (var entry : root.getAsJsonObject().entrySet()) {
                JsonElement value = entry.getValue();
                values.put(entry.getKey(), value.isJsonNull() ? null
                        : value.isJsonPrimitive() ? value.getAsString() : value.toString());
            }
            return values;
        } catch (RuntimeException invalid) {
            // Never echo source code, paths or request values into the error response.
            throw new IllegalArgumentException("Expected a valid JSON object");
        }
    }
}
