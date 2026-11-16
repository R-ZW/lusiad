package com.lusiad.backend.service.uml;

import java.util.*;
import static com.lusiad.backend.service.uml.UmlStructure.*;

/** Describes diagrams; PlantUML owns all coordinates and routing. No caller supplies PUML. */
public final class UmlDiagram {
    private static final Map<String,String> COLORS = Map.of("create", "#DCFCE7", "delete", "#FFE4E6", "update", "#FEF3C7", "move", "#DBEAFE", "unknown", "#F1F5F9");
    private static final Map<String,String> INK = Map.of("create", "#166534", "delete", "#9F1239", "update", "#92400E", "move", "#1E40AF", "unknown", "#334155");

    /** Encode markup, preprocessing and line boundaries, including Java type-use annotations. */
    public static String text(String value) {
        StringBuilder out = new StringBuilder();
        value.codePoints().forEach(c -> {
            if (Character.isLetterOrDigit(c) || " _.,:()".indexOf(c) >= 0) out.appendCodePoint(c);
            else out.append(String.format("<U+%04X>", c));
        });
        return out.toString();
    }
    public static boolean sameStructure(Model before, Model after) { return fingerprint(before).equals(fingerprint(after)); }
    private static List<String> fingerprint(Model model) {
        return model.classes().stream().map(c -> c.id() + "|" + c.name() + "|" + c.kind() + "|" + c.members().stream().map(Member::label).sorted().toList()
                + "|" + c.relations().stream().map(r -> r.kind() + ":" + target(model, c, r.target()) + ":" + r.label()).sorted().toList()).sorted().toList();
    }
    private static String changeTone(String operation, String side) {
        return "create".equals(operation) && "before".equals(side) || "delete".equals(operation) && "after".equals(side) ? "unknown" : operation;
    }
    private static String preamble() {
        return "@startuml\n!pragma layout smetana\nskinparam backgroundColor #FFFFFF\nskinparam shadowing false\nskinparam classAttributeIconSize 0\nskinparam defaultFontName SansSerif\nskinparam defaultFontColor #0F172A\nskinparam classBackgroundColor #F8FAFC\nskinparam classBorderColor #64748B\nhide empty members\n";
    }
    /** Neutral diagram of one saved source state; no historical focus or change legend. */
    public static String currentSource(Model model, String locale) {
        boolean pt = locale.equals("pt-BR");
        StringBuilder out = new StringBuilder(preamble());
        Map<String,String> aliases = new LinkedHashMap<>();
        for (Classifier c : model.classes()) aliases.put(c.id(), "C" + aliases.size());
        for (Classifier c : model.classes()) {
            out.append(c.kind()).append(" \"").append(text(c.name())).append("\" as ").append(aliases.get(c.id())).append(" {\n");
            for (Member member : c.members()) {
                String label = member.label();
                String modifier = label.startsWith("{static} ") ? "{static} " : label.startsWith("{abstract} ") ? "{abstract} " : "";
                out.append("  ").append(modifier).append(member.kind().equals("attribute") ? "{field} " : "{method} ")
                        .append(text(label.substring(modifier.length()))).append("\n");
            }
            out.append("}\n");
        }
        for (Classifier c : model.classes()) for (Relation relation : c.relations()) {
            String identity = target(model, c, relation.target());
            if (!aliases.containsKey(identity)) {
                String alias = "C" + aliases.size(); aliases.put(identity, alias);
                String targetKind = relation.kind().equals("implements") || c.kind().equals("interface") ? "interface" : "class";
                String targetLabel = identity.startsWith("external:") ? identity.substring("external:".length()) : relation.target();
                out.append(targetKind).append(" \"").append(text(targetLabel)).append("\" as ").append(alias)
                        .append(" <<").append(pt ? "referência declarada" : "declared reference").append(">> #F1F5F9\n");
            }
            out.append(aliases.get(c.id())).append(relation.kind().equals("implements") ? " ..|> " : " --|> ")
                    .append(aliases.get(identity));
            if (!relation.label().equals(relation.target())) out.append(" : ").append(text(relation.label()));
            out.append("\n");
        }
        return out.append("@enduml\n").toString();
    }
    public static String source(Model model, Model counterpart, String operation, String side, String locale, String movement, boolean unchanged) {
        boolean pt = locale.equals("pt-BR");
        StringBuilder out = new StringBuilder(preamble());
        Map<String,Classifier> others = new HashMap<>();
        counterpart.classes().forEach(c -> others.put(c.id(), c));
        Map<String,String> aliases = new LinkedHashMap<>();
        for (var c : model.classes()) aliases.put(c.id(), "C" + aliases.size());
        Classifier focused = focusedClass(model);
        Member selectedMember = focusedMember(model, focused);
        String selectionTone = changeTone(operation, side);
        for (Classifier c : model.classes()) {
            var other = others.get(c.id());
            String tone = other == null ? (side.equals("before") ? "delete" : "create") : !c.kind().equals(other.kind()) || !c.name().equals(other.name()) ? "update" : null;
            if (c == focused) tone = selectionTone;
            out.append(c.kind()).append(" \"").append(text(c.name())).append("\" as ").append(aliases.get(c.id()));
            if (tone != null) out.append(" ").append(COLORS.get(tone));
            out.append(" {\n");
            Map<String,Member> otherMembers = new HashMap<>();
            if (other != null) other.members().forEach(m -> otherMembers.put(m.id(), m));
            for (Member m : c.members()) {
                Member om = otherMembers.get(m.id());
                String mt = other == null ? tone : om == null ? (side.equals("before") ? "delete" : "create") : !m.label().equals(om.label()) ? "update" : null;
                if (c == focused && m == selectedMember) mt = selectionTone;
                String label = m.label();
                // Only these two modifiers are emitted by our PSI extractor, never caller markup.
                String modifier = label.startsWith("{static} ") ? "{static} " : label.startsWith("{abstract} ") ? "{abstract} " : "";
                label = label.substring(modifier.length());
                out.append("  ").append(modifier).append(m.kind().equals("attribute") ? "{field} " : "{method} ");
                if (mt != null) out.append("<color:").append(INK.get(mt)).append("><b>");
                out.append(text(label));
                if (mt != null) out.append("</b></color>");
                out.append("\n");
            }
            out.append("}\n");
        }
        for (Classifier c : model.classes()) for (Relation relation : c.relations()) {
            String identity = target(model, c, relation.target());
            if (!aliases.containsKey(identity)) {
                String alias = "C" + aliases.size(); aliases.put(identity, alias);
                String targetKind = relation.kind().equals("implements") || c.kind().equals("interface") ? "interface" : "class";
                String targetLabel = identity.startsWith("external:") ? identity.substring("external:".length()) : relation.target();
                out.append(targetKind).append(" \"").append(text(targetLabel)).append("\" as ").append(alias)
                        .append(" <<").append(pt ? "referência declarada" : "declared reference").append(">> #F1F5F9\n");
            }
            Classifier oc = others.get(c.id());
            boolean same = oc != null && oc.relations().stream().anyMatch(r -> r.kind().equals(relation.kind())
                    && r.label().equals(relation.label()) && target(counterpart, oc, r.target()).equals(identity));
            String rt = same ? null : side.equals("before") ? "delete" : "create";
            out.append(aliases.get(c.id())).append(relation.kind().equals("implements") ? " ." : " -");
            if (rt != null) out.append("[").append(INK.get(rt)).append("]");
            out.append(relation.kind().equals("implements") ? ".|> " : "-|> ").append(aliases.get(identity));
            if (!relation.label().equals(relation.target())) out.append(" : ").append(text(relation.label()));
            out.append("\n");
        }
        if (focused != null) {
            out.append("note bottom of ").append(aliases.get(focused.id())).append("\n");
            if (selectedMember != null) out.append(text(selectedMember.label())).append("\n");
            if (unchanged) out.append(pt ? "Sem diferença estrutural neste diagrama.\n" : "No structural difference in this diagram.\n");
            var other = others.get(focused.id());
            if (selectedMember != null && other != null && other.members().stream().anyMatch(m -> m.id().equals(selectedMember.id()) && m.label().equals(selectedMember.label())) && !operation.equals("unknown"))
                out.append(pt ? "Elemento afetado; assinatura preservada.\n" : "Affected element; signature preserved.\n");
            if (operation.equals("move")) out.append(text(movement)).append("\n");
            out.append("end note\n");
        }
        out.append("legend bottom\n");
        String[] statuses = {"create", "delete", "update", "move"};
        String[] labels = pt ? new String[]{"Adição", "Remoção", "Alteração", "Movimento"} : new String[]{"Addition", "Removal", "Change", "Movement"};
        for (int i = 0; i < statuses.length; i++) out.append("|<").append(COLORS.get(statuses[i])).append("> ").append(labels[i]).append(" ");
        return out.append("|\nendlegend\n@enduml\n").toString();
    }
    private static String target(Model model, Classifier owner, String raw) {
        Set<String> ids = new HashSet<>(); model.classes().forEach(c -> ids.add(c.id()));
        // Lexical member types shadow imports. Only actual containing classifiers are scopes, never package prefixes.
        String lexical = owner.id();
        while (ids.contains(lexical)) {
            String candidate = lexical + "." + raw;
            if (ids.contains(candidate)) return candidate;
            int dot = lexical.lastIndexOf('.');
            lexical = dot < 0 ? "" : lexical.substring(0, dot);
        }
        String first = raw.contains(".") ? raw.substring(0, raw.indexOf('.')) : raw;
        String imported = owner.imports().get(first);
        if (imported != null) {
            String qualified = imported + raw.substring(first.length());
            return ids.contains(qualified) ? qualified : "external:" + qualified;
        }
        if (raw.contains(".") && ids.contains(raw)) return raw;
        String local = owner.packageName().isEmpty() ? raw : owner.packageName() + "." + raw;
        return ids.contains(local) ? local : "unresolved:" + owner.path() + ":" + raw;
    }
    public static String location(Model model, boolean pt) {
        Classifier c = focusedClass(model); Member m = focusedMember(model, c);
        if (c == null) return pt ? "localização não determinada" : "location undetermined";
        return c.name() + (m == null ? "" : " / " + m.label()) + " [" + model.sourceLocation() + "]";
    }
}
