package com.lusiad.backend.service.uml;

import com.google.gson.*;
import com.intellij.openapi.project.Project;
import java.util.*;
import static com.lusiad.backend.service.uml.UmlStructure.*;

public final class UmlService {
    private static final Gson JSON = new GsonBuilder().serializeNulls().setStrictness(Strictness.STRICT).create();
    public record Panel(String svg, List<String> classifiers, boolean focusFound) {}
    public record Result(String status, String engine, Panel before, Panel after, boolean noStructuralChange, String movement) {}
    public record CurrentResult(String status, String engine, Panel diagram, int fileCount) {}
    public static String renderCurrent(Project project, Map<String,String> request) throws Exception {
        String locale = request.get("locale");
        if (!Set.of("pt-BR", "en").contains(locale)) throw new IllegalArgumentException("Invalid UML locale");
        var files = sources(request.get("files"));
        var model = UmlStructure.extract(project, files, null);
        return JSON.toJson(new CurrentResult("ok", "plantuml-smetana",
                new Panel(model.classes().isEmpty() ? null : PlantUmlRenderer.render(UmlDiagram.currentSource(model, locale)),
                        model.classes().stream().map(Classifier::name).toList(), false), files.size()));
    }
    public static String render(Project project, Map<String,String> request) throws Exception {
        String operation = request.get("operation"), locale = request.get("locale");
        if (!Set.of("create", "update", "delete", "move", "unknown").contains(operation) || !Set.of("pt-BR", "en").contains(locale))
            throw new IllegalArgumentException("Invalid UML operation or locale");
        var before = UmlStructure.extract(project, sources(request.get("beforeFiles")), focus(request.get("beforeFocus")));
        var after = UmlStructure.extract(project, sources(request.get("afterFiles")), focus(request.get("afterFocus")));
        boolean same = UmlDiagram.sameStructure(before, after);
        String movement = operation.equals("move") ? (locale.equals("pt-BR") ? "Origem: " : "From: ") + UmlDiagram.location(before, locale.equals("pt-BR"))
                + (locale.equals("pt-BR") ? " → Destino: " : " → To: ") + UmlDiagram.location(after, locale.equals("pt-BR")) : "";
        return JSON.toJson(new Result("ok", "plantuml-smetana", panel(before, after, operation, "before", locale, movement, same),
                panel(after, before, operation, "after", locale, movement, same), same, movement));
    }
    private static Panel panel(Model model, Model other, String operation, String side, String locale, String movement, boolean same) throws Exception {
        return new Panel(model.classes().isEmpty() ? null : PlantUmlRenderer.render(UmlDiagram.source(model, other, operation, side, locale, movement, same)),
                model.classes().stream().map(Classifier::name).toList(), focusedClass(model) != null);
    }
    public static List<Source> sources(String json) {
        try {
            var array = JSON.fromJson(json, JsonArray.class);
            if (array == null || array.size() > 500) throw new IllegalArgumentException();
            List<Source> files = new ArrayList<>(); Set<String> paths = new HashSet<>(); int length = 0;
            for (JsonElement item : array) {
                var obj = item.getAsJsonObject();
                String path = string(obj.get("path")), content = string(obj.get("content"));
                if (path.length() > 1024 || path.contains("\\") || path.startsWith("/") || path.contains(":") || Arrays.stream(path.split("/", -1)).anyMatch(p -> p.isEmpty() || p.equals(".") || p.equals(".."))
                        || !path.toLowerCase(Locale.ROOT).endsWith(".java") || !paths.add(path) || (length += content.length()) > 1500000) throw new IllegalArgumentException();
                files.add(new Source(path, content));
            }
            return List.copyOf(files);
        } catch (RuntimeException failure) { throw new IllegalArgumentException("Invalid or oversized UML source list"); }
    }
    private static String string(JsonElement value) {
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) throw new IllegalArgumentException();
        return value.getAsString();
    }
    public static Focus focus(String json) {
        if (json == null) return null;
        try {
            var obj = JSON.fromJson(json, JsonObject.class);
            String path = string(obj.get("path"));
            for (String key : List.of("start", "end"))
                if (!obj.has(key) || !obj.get(key).isJsonPrimitive() || !obj.getAsJsonPrimitive(key).isNumber()) throw new IllegalArgumentException();
            int start = obj.get("start").getAsBigDecimal().intValueExact(), end = obj.get("end").getAsBigDecimal().intValueExact();
            if (start < 0 || end < start) throw new IllegalArgumentException();
            return new Focus(path, start, end);
        } catch (RuntimeException failure) { throw new IllegalArgumentException("Invalid UML focus"); }
    }
}
