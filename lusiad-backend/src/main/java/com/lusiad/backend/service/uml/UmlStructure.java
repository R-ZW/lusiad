package com.lusiad.backend.service.uml;

import com.intellij.ide.highlighter.JavaFileType;
import com.intellij.openapi.application.ReadAction;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.text.StringUtil;
import com.intellij.psi.*;
import java.util.*;

/** Nonphysical PSI only: no resolution against the live project, VFS refresh or compilation. */
public final class UmlStructure {
    public record Source(String path, String content) {}
    public record Focus(String path, int start, int end) {}
    public record Member(String id, String label, String kind, int start, int end) {}
    public record Relation(String kind, String target, String label) {
        public Relation(String kind, String target) { this(kind, target, target); }
    }
    public record Classifier(String id, String name, String kind, String path, int start, int end,
                             List<Member> members, List<Relation> relations, String packageName,
                             Map<String, String> imports) {}
    public record Model(List<Classifier> classes, Focus focus, String sourceLocation) {}

    public static Model extract(Project project, List<Source> sources, Focus focus) {
        return ReadAction.compute(() -> {
            List<Classifier> classes = new ArrayList<>();
            String location = "";
            for (Source source : sources) {
                String text = StringUtil.convertLineSeparators(source.content());
                if (focus != null && source.path().equals(focus.path()) && focus.end() <= text.length()) {
                    int line = 1 + (int) text.substring(0, focus.start()).chars().filter(c -> c == '\n').count();
                    int column = focus.start() - text.lastIndexOf('\n', focus.start() - 1);
                    location = source.path() + ":" + line + ":" + column;
                }
                var file = (PsiJavaFile) PsiFileFactory.getInstance(project).createFileFromText(
                        source.path().substring(source.path().lastIndexOf('/') + 1), JavaFileType.INSTANCE, text);
                Map<String,String> imports = new HashMap<>();
                if (file.getImportList() != null) for (var item : file.getImportList().getImportStatements()) {
                    if (!item.isOnDemand() && item.getQualifiedName() != null) {
                        String qualified = item.getQualifiedName();
                        imports.put(qualified.substring(qualified.lastIndexOf('.') + 1), qualified);
                    }
                }
                for (PsiClass classifier : file.getClasses()) collect(classifier, source.path(), file.getPackageName(), imports, classes);
            }
            if (classes.size() > 160 || classes.stream().mapToInt(c -> c.members().size()).sum() > 2400)
                throw new IllegalArgumentException("UML view exceeds 160 classifiers or 2400 members; use the file view");
            classes.sort(Comparator.comparing(Classifier::id));
            Set<String> identities = new HashSet<>();
            for (var classifier : classes) if (!identities.add(classifier.id()))
                throw new IllegalArgumentException("Duplicate classifier in snapshot: " + classifier.name());
            return new Model(List.copyOf(classes), focus, location);
        });
    }

    private static void collect(PsiClass node, String path, String pkg, Map<String,String> imports, List<Classifier> output) {
        if (node.getName() == null || node instanceof PsiAnonymousClass) return;
        String name = node.getQualifiedName();
        if (name == null) return;
        String kind = node.isAnnotationType() ? "annotation" : node.isEnum() ? "enum" : node.isRecord() ? "record" : node.isInterface() ? "interface" : node.hasModifierProperty(PsiModifier.ABSTRACT) ? "abstract class" : "class";
        List<Member> members = new ArrayList<>();
        if (node.getRecordHeader() != null) for (var component : node.getRecordHeader().getRecordComponents())
            members.add(member(component, "record:" + component.getName(), "~ " + component.getName() + ": " + type(component.getTypeElement()), "attribute"));
        for (var field : node.getFields()) {
            if (field.getNode() == null || field.getTextRange() == null) continue;
            String label = field instanceof PsiEnumConstant ? field.getName() : visibility(field) + field.getName() + ": " + type(field.getTypeElement(), field.getType());
            if (!(field instanceof PsiEnumConstant) && field.hasModifierProperty(PsiModifier.STATIC)) label = "{static} " + label;
            members.add(member(field, "field:" + field.getName(), label, "attribute"));
        }
        for (var method : node.getMethods()) {
            // Records expose synthetic accessors/constructors without a source range. Only declarations belong here.
            if (method.getNode() == null || method.getTextRange() == null) continue;
            List<String> parameterTypes = new ArrayList<>(), parameters = new ArrayList<>();
            for (var parameter : method.getParameterList().getParameters()) {
                String parameterType = type(parameter.getTypeElement(), parameter.getType());
                parameterTypes.add(parameterType);
                parameters.add(parameter.getName() + ": " + parameterType);
            }
            String id = "method:" + method.getName() + "(" + String.join(",", parameterTypes) + ")";
            String label = visibility(method) + method.getName() + "(" + String.join(", ", parameters) + ")"
                    + (method.isConstructor() ? "" : ": " + type(method.getReturnTypeElement(), method.getReturnType()));
            if (method.hasModifierProperty(PsiModifier.STATIC)) label = "{static} " + label;
            else if (method.hasModifierProperty(PsiModifier.ABSTRACT)) label = "{abstract} " + label;
            members.add(member(method, id, label, "operation"));
        }
        List<Relation> relations = new ArrayList<>();
        references(node.getExtendsList(), "extends", relations);
        references(node.getImplementsList(), "implements", relations);
        var range = node.getTextRange();
        String displayName = name + (node.getTypeParameterList() == null ? "" : node.getTypeParameterList().getText());
        output.add(new Classifier(name, displayName, kind, path, range.getStartOffset(), range.getEndOffset(),
                List.copyOf(members), List.copyOf(relations), pkg, Map.copyOf(imports)));
        for (var inner : node.getInnerClasses()) collect(inner, path, pkg, imports, output);
    }
    private static String type(PsiTypeElement element) { return element == null ? "?" : element.getText().replaceAll("\\s+", " ").trim(); }
    private static String type(PsiTypeElement element, PsiType declared) {
        if (element == null) return declared == null ? "?" : declared.getPresentableText();
        int extraArrays = declared == null ? 0 : Math.max(0, declared.getArrayDimensions() - element.getType().getArrayDimensions());
        return type(element) + "[]".repeat(extraArrays);
    }
    private static Member member(PsiElement node, String id, String label, String kind) {
        var range = node.getTextRange();
        return new Member(id, label, kind, range.getStartOffset(), range.getEndOffset());
    }
    private static String visibility(PsiModifierListOwner node) {
        return node.hasModifierProperty(PsiModifier.PUBLIC) ? "+ " : node.hasModifierProperty(PsiModifier.PRIVATE) ? "- "
                : node.hasModifierProperty(PsiModifier.PROTECTED) ? "# " : "~ ";
    }
    private static void references(PsiReferenceList list, String kind, List<Relation> target) {
        if (list == null) return;
        for (var reference : list.getReferenceElements()) {
            // Remove type arguments structurally; never split generics by comma or resolve live PSI.
            String text = reference.getQualifiedName();
            if (text != null && !text.isBlank()) target.add(new Relation(kind, text, reference.getText().replaceAll("\\s+", " ")));
        }
    }
    public static Classifier focusedClass(Model model) {
        Focus f = model.focus();
        return f == null ? null : model.classes().stream().filter(c -> c.path().equals(f.path()) && c.start() <= f.start() && c.end() >= f.end())
                .min(Comparator.comparingInt(c -> c.end() - c.start())).orElse(null);
    }
    public static Member focusedMember(Model model, Classifier classifier) {
        Focus f = model.focus();
        return f == null || classifier == null ? null : classifier.members().stream().filter(m -> m.start() <= f.start() && m.end() >= f.end())
                .min(Comparator.comparingInt(m -> m.end() - m.start())).orElse(null);
    }
}
