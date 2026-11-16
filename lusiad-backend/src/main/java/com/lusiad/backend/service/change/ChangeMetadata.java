package com.lusiad.backend.service.change;

import com.google.gson.*;
import com.intellij.ide.highlighter.JavaFileType;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.TextRange;
import com.intellij.psi.*;
import com.intellij.psi.util.PsiTreeUtil;
import java.util.*;

/** Presentation facts only. Never mutates/resolves the live project or participates in replay. */
public final class ChangeMetadata {
    private static final Gson JSON = new GsonBuilder().serializeNulls().create();
    public record Range(int start, int end, int startLine, int endLine, int startColumn, int endColumn) {}
    public record Element(String kind, String name) {}
    public record Side(String path, Range range, Element element, List<Element> context) {}
    public record Difference(String field, String before, String after) {}
    public record Facts(int version, String action, String kind, Side before, Side after, List<Difference> differences) {}
    private record Span(int start, int end) {}
    private record Token(int start, int end, String text) {}
    private record Located(Side side, PsiElement node) {}
    private record Property(String field, TextRange range) {}
    private ChangeMetadata() {}

    public static JsonObject code(Project project, String path, String action, String before, String unformatted,
                                  String after, JsonObject result) {
        PsiFile previous = file(project, before), raw = file(project, unformatted), current = file(project, after);
        Span source = action.equals("create") ? null : span(result, "startOffset", "endOffset");
        Span inserted = switch (action) {
            case "create" -> inserted(result, "offset");
            case "update" -> inserted(result, "startOffset");
            case "move" -> inserted(result, "targetOffset");
            default -> null;
        };
        Span destination = inserted == null ? null : mapped(raw, current, inserted);
        Located b = action.equals("create") ? null : locate(path, previous, source);
        Located a = action.equals("delete") ? null : locate(path, current, destination);
        List<Difference> differences = action.equals("update") && b != null && a != null
                ? differences(b.node(), a.node()) : List.of();
        return JSON.toJsonTree(new Facts(1, action, "code", b == null ? null : b.side(),
                a == null ? null : a.side(), differences)).getAsJsonObject();
    }

    /** Paths are captured from the actual filesystem result, not the original parent/destination request. */
    public static JsonObject paths(String action, String before, String after) {
        String kind = action.startsWith("dir_") ? "directory" : "file";
        return JSON.toJsonTree(new Facts(1, action, kind, pathSide(before, kind), pathSide(after, kind), List.of())).getAsJsonObject();
    }

    private static Side pathSide(String path, String kind) {
        if (path == null) return null;
        path = path.replace('\\', '/');
        return new Side(path, null, new Element(kind, path.substring(path.lastIndexOf('/') + 1)), List.of());
    }

    private static PsiFile file(Project project, String text) {
        return PsiFileFactory.getInstance(project).createFileFromText("Change.java", JavaFileType.INSTANCE, text, 0, false);
    }
    private static Span span(JsonObject result, String start, String end) {
        return result.has(start) && result.has(end) ? new Span(result.get(start).getAsInt(), result.get(end).getAsInt()) : null;
    }
    private static Span inserted(JsonObject result, String start) {
        return result.has(start) && result.has("insertedChars")
                ? new Span(result.get(start).getAsInt(), result.get(start).getAsInt() + result.get("insertedChars").getAsInt()) : null;
    }

    private static List<Token> tokens(PsiElement node) {
        List<Token> out = new ArrayList<>();
        collectTokens(node, out);
        return out;
    }
    private static void collectTokens(PsiElement node, List<Token> out) {
        if (node instanceof PsiWhiteSpace) return;
        if (node instanceof PsiComment || node.getFirstChild() == null) {
            TextRange r = node.getTextRange();
            if (r != null && !node.getText().isBlank()) out.add(new Token(r.getStartOffset(), r.getEndOffset(), node.getText()));
        } else for (PsiElement child : node.getChildren()) collectTokens(child, out);
    }

    /** Map by token ordinal in this exact edit, never by a global first occurrence of repeated text. */
    private static Span mapped(PsiFile raw, PsiFile formatted, Span range) {
        String original = raw.getText(), result = formatted.getText();
        if (range.start < 0 || range.end < range.start || range.end > original.length()) return null;
        if (original.equals(result)) return range;
        List<Token> a = tokens(raw), b = tokens(formatted);
        if (a.size() != b.size()) return null;
        for (int i = 0; i < a.size(); i++) if (!a.get(i).text.equals(b.get(i).text)) return null;
        int first = -1, last = -1;
        for (int i = 0; i < a.size(); i++) if (a.get(i).start < range.end && a.get(i).end > range.start) {
            if (first < 0) first = i;
            last = i;
        }
        // A whitespace-only range cannot be inferred through a whole-document formatter rewrite.
        if (first < 0) return null;
        Token f = a.get(first), l = a.get(last), bf = b.get(first), bl = b.get(last);
        return new Span(bf.start + Math.max(0, range.start - f.start), bl.end - Math.max(0, l.end - range.end));
    }

    private static Located locate(String path, PsiFile file, Span requested) {
        if (requested == null || requested.start < 0 || requested.end < requested.start || requested.end > file.getTextLength())
            return new Located(new Side(path, null, new Element("fragment", null), List.of()), null);
        String text = file.getText();
        int start = requested.start, end = requested.end;
        boolean whitespace = text.substring(start, end).isBlank();
        if (!whitespace) {
            while (start < end && Character.isWhitespace(text.charAt(start))) start++;
            while (end > start && Character.isWhitespace(text.charAt(end - 1))) end--;
        }
        PsiElement leaf = start < text.length() ? file.findElementAt(start) : null;
        PsiElement exact = null, owner = leaf;
        for (PsiElement node = leaf; node != null; node = node.getParent()) {
            TextRange r = node.getTextRange();
            if (r == null) continue;
            if (r.getStartOffset() <= start && r.getEndOffset() >= end) {
                if (owner == leaf) owner = node;
                if (r.getStartOffset() == start && r.getEndOffset() == end && meaningful(node)) { exact = node; break; }
            }
        }
        // Whitespace remains whitespace, even when it happens to coincide with a file/container range.
        Element element = whitespace ? new Element("whitespace", null)
                : exact == null ? new Element(multiple(file, start, end) ? "elements" : "fragment", null) : element(exact);
        PsiElement context = whitespace || exact == null ? owner : exact.getParent();
        return new Located(new Side(path, range(text, start, end), element, context(context, start, end)), exact);
    }

    private static boolean meaningful(PsiElement node) {
        if (node instanceof PsiCodeBlock && node.getParent() instanceof PsiClassInitializer) return false;
        return node instanceof PsiClass || node instanceof PsiMethod || node instanceof PsiVariable
                || node instanceof PsiStatement || node instanceof PsiExpression || node instanceof PsiComment
                || node instanceof PsiPackageStatement || node instanceof PsiImportStatementBase
                || node instanceof PsiCodeBlock || node instanceof PsiClassInitializer || node instanceof PsiIdentifier;
    }
    private static boolean multiple(PsiElement node, int start, int end) {
        int count = 0;
        for (PsiElement child : node.getChildren()) {
            TextRange r = child.getTextRange();
            if (r == null || r.getEndOffset() <= start || r.getStartOffset() >= end) continue;
            if (r.getStartOffset() >= start && r.getEndOffset() <= end && meaningful(child)) count++;
            else if (multiple(child, start, end)) return true;
            if (count > 1) return true;
        }
        return false;
    }

    private static Element element(PsiElement node) {
        if (node instanceof PsiClass c) return new Element(c.isAnnotationType() ? "annotation" : c.isInterface() ? "interface"
                : c.isEnum() ? "enum" : c.isRecord() ? "record" : "class", c.getName());
        if (node instanceof PsiMethod m) {
            String name = m.getName() + "(" + String.join(", ", Arrays.stream(m.getParameterList().getParameters())
                    .map(ChangeMetadata::parameterType).toList()) + ")";
            return new Element(m.isConstructor() ? "constructor" : "method", name);
        }
        if (node instanceof PsiEnumConstant v) return new Element("enumConstant", v.getName());
        if (node instanceof PsiField v) return new Element("field", v.getName());
        if (node instanceof PsiParameter v) return new Element("parameter", v.getName());
        if (node instanceof PsiVariable v) return new Element("variable", v.getName());
        if (node instanceof PsiDeclarationStatement d && d.getDeclaredElements().length == 1) return element(d.getDeclaredElements()[0]);
        if (node instanceof PsiDeclarationStatement) return new Element("elements", null);
        if (node instanceof PsiReturnStatement) return new Element("return", null);
        if (node instanceof PsiThrowStatement) return new Element("throw", null);
        if (node instanceof PsiBreakStatement) return new Element("break", null);
        if (node instanceof PsiContinueStatement) return new Element("continue", null);
        if (node instanceof PsiYieldStatement) return new Element("yield", null);
        if (node instanceof PsiAssertStatement) return new Element("assert", null);
        if (node instanceof PsiSynchronizedStatement) return new Element("synchronized", null);
        if (node instanceof PsiClassInitializer init) return new Element(init.hasModifierProperty(PsiModifier.STATIC)
                ? "staticInitializer" : "instanceInitializer", null);
        if (node instanceof PsiIfStatement) return new Element("if", null);
        if (node instanceof PsiSwitchLabelStatementBase c) return new Element(c.isDefaultCase() ? "default" : "case",
                c.isDefaultCase() || c.getCaseValues() == null ? null : c.getCaseValues().getText());
        if (node instanceof PsiSwitchBlock) return new Element("switch", null);
        if (node instanceof PsiForeachStatement) return new Element("foreach", null);
        if (node instanceof PsiForStatement) return new Element("for", null);
        if (node instanceof PsiWhileStatement) return new Element("while", null);
        if (node instanceof PsiDoWhileStatement) return new Element("do", null);
        if (node instanceof PsiTryStatement) return new Element("try", null);
        if (node instanceof PsiComment c) return new Element(c instanceof com.intellij.psi.javadoc.PsiDocComment ? "javadoc" : "comment", null);
        if (node instanceof PsiPackageStatement p) return new Element("package", p.getPackageName());
        if (node instanceof PsiImportStatementBase p) return new Element("import", p.getImportReference() == null ? null
                : p.getImportReference().getText() + (p.isOnDemand() ? ".*" : ""));
        if (node instanceof PsiExpressionStatement s && s.getExpression() instanceof PsiMethodCallExpression c)
            return new Element("call", c.getMethodExpression().getText());
        if (node instanceof PsiMethodCallExpression c) return new Element("call", c.getMethodExpression().getText());
        if (node instanceof PsiIdentifier) return new Element("identifier", node.getText());
        if (node instanceof PsiCodeBlock || node instanceof PsiBlockStatement) return new Element("block", null);
        return new Element(node instanceof PsiExpression ? "expression" : "statement", null);
    }

    private static String parameterType(PsiParameter parameter) {
        PsiTypeElement declared = parameter.getTypeElement();
        if (declared == null) return "?";
        // Java also allows dimensions after the parameter name: int values[]. No symbol resolution.
        int extra = Math.max(0, parameter.getType().getArrayDimensions() - declared.getType().getArrayDimensions());
        return declared.getText() + "[]".repeat(extra);
    }

    private static List<Element> context(PsiElement start, int from, int to) {
        List<Element> result = new ArrayList<>();
        for (PsiElement node = start; node != null; node = node.getParent()) {
            if (node instanceof PsiCodeBlock body && body.getParent() instanceof PsiSwitchBlock) {
                PsiSwitchLabelStatementBase active = null;
                for (PsiStatement statement : body.getStatements()) {
                    if (statement.getTextOffset() > from) break;
                    if (statement instanceof PsiSwitchLabelStatementBase label) active = label;
                }
                // Colon-style cases own following sibling statements; arrow cases are already ancestors.
                if (active != null && !(active instanceof PsiSwitchLabeledRuleStatement)) result.add(element(active));
            }
            if (node instanceof PsiClass || node instanceof PsiMethod || node instanceof PsiSwitchLabelStatementBase
                    || node instanceof PsiForStatement || node instanceof PsiForeachStatement
                    || node instanceof PsiWhileStatement || node instanceof PsiDoWhileStatement || node instanceof PsiTryStatement)
                result.add(element(node));
            if (node instanceof PsiIfStatement branch) {
                PsiStatement alternative = branch.getElseBranch();
                String arm = alternative != null && alternative.getTextRange().contains(new TextRange(from, to)) ? "else" : "then";
                result.add(new Element(arm, null));
                result.add(new Element("if", branch.getCondition() == null ? null : branch.getCondition().getText()));
            }
        }
        Collections.reverse(result);
        return result;
    }

    private static Range range(String text, int start, int end) {
        int[] a = position(text, start), b = position(text, end > start ? end - 1 : end);
        return new Range(start, end, a[0], b[0], a[1], b[1]);
    }
    private static int[] position(String text, int offset) {
        int line = 1, column = 1;
        for (int i = 0; i < offset; i++) { if (text.charAt(i) == '\n') { line++; column = 1; } else column++; }
        return new int[]{line, column};
    }

    /** Report a field only when replacing that single PSI property accounts for the entire edit. */
    private static List<Difference> differences(PsiElement before, PsiElement after) {
        if (before == null || after == null || !before.getClass().equals(after.getClass())
                || PsiTreeUtil.findChildOfType(before, PsiErrorElement.class) != null
                || PsiTreeUtil.findChildOfType(after, PsiErrorElement.class) != null) return List.of();
        List<Property> a = properties(before), b = properties(after);
        for (Property property : a) {
            Property next = b.stream().filter(p -> p.field.equals(property.field)).findFirst().orElse(null);
            if (next == null) continue;
            String old = property.range.substring(before.getContainingFile().getText());
            String now = next.range.substring(after.getContainingFile().getText());
            if (old.equals(now) || tokens(before).stream().filter(t -> property.range.contains(new TextRange(t.start, t.end))).map(Token::text).toList()
                    .equals(tokens(after).stream().filter(t -> next.range.contains(new TextRange(t.start, t.end))).map(Token::text).toList())) continue;
            if (masked(before, property.range).equals(masked(after, next.range)))
                return List.of(new Difference(property.field, old, now));
        }
        return List.of();
    }
    private static List<String> masked(PsiElement node, TextRange field) {
        List<String> result = new ArrayList<>(); boolean inserted = false;
        for (Token token : tokens(node)) {
            if (token.start >= field.getStartOffset() && token.end <= field.getEndOffset()) {
                if (!inserted) { result.add("\u0000property"); inserted = true; }
            } else result.add(token.text);
        }
        return result;
    }
    private static List<Property> properties(PsiElement element) {
        if (element instanceof PsiDeclarationStatement d && d.getDeclaredElements().length == 1) element = d.getDeclaredElements()[0];
        List<Property> result = new ArrayList<>();
        if (element instanceof PsiNameIdentifierOwner named) property(result, "name", named.getNameIdentifier());
        if (element instanceof PsiVariable variable) { property(result, "type", variable.getTypeElement()); property(result, "expression", variable.getInitializer()); }
        if (element instanceof PsiMethod method) {
            property(result, "type", method.getReturnTypeElement());
            if (method.getBody() != null) result.add(new Property("signature", new TextRange(method.getTextRange().getStartOffset(), method.getBody().getTextRange().getStartOffset())));
        }
        if (element instanceof PsiIfStatement branch) property(result, "condition", branch.getCondition());
        if (element instanceof PsiWhileStatement loop) property(result, "condition", loop.getCondition());
        if (element instanceof PsiDoWhileStatement loop) property(result, "condition", loop.getCondition());
        if (element instanceof PsiForStatement loop) property(result, "condition", loop.getCondition());
        if (element instanceof PsiSwitchBlock block) property(result, "expression", block.getExpression());
        if (element instanceof PsiReturnStatement statement) property(result, "expression", statement.getReturnValue());
        if (element instanceof PsiThrowStatement statement) property(result, "expression", statement.getException());
        if (element instanceof PsiExpressionStatement statement) property(result, "expression", statement.getExpression());
        return result;
    }
    private static void property(List<Property> out, String field, PsiElement element) {
        if (element != null && element.getTextLength() > 0) out.add(new Property(field, element.getTextRange()));
    }

    /** Searchable neutral English defaults; the UI renders the same facts using its selected catalogue. */
    public static String summary(JsonObject metadata) {
        Facts facts = JSON.fromJson(metadata, Facts.class);
        Side side = facts.after != null ? facts.after : facts.before;
        String subject = side == null ? "Change" : side.element.kind + (side.element.name == null ? "" : " " + side.element.name);
        String action = facts.action.substring(facts.action.lastIndexOf('_') + 1);
        String verb = switch (action) { case "create" -> "added"; case "delete" -> "removed"; case "move" -> "moved"; case "rename" -> "renamed"; default -> "changed"; };
        String title = subject + " " + verb;
        title = Character.toUpperCase(title.charAt(0)) + title.substring(1);
        return title.codePointCount(0, title.length()) > 250 ? title.substring(0, title.offsetByCodePoints(0, 249)) + "…" : title;
    }
}
