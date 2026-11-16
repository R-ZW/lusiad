package com.lusiad.backend.service.psi;

import com.intellij.ide.highlighter.JavaFileType;
import com.intellij.openapi.application.ReadAction;
import com.intellij.openapi.progress.ProcessCanceledException;
import com.intellij.openapi.progress.ProgressManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.TextRange;
import com.intellij.pom.java.LanguageLevel;
import com.intellij.psi.*;
import com.intellij.psi.util.PsiUtil;

import java.util.*;
import java.nio.charset.StandardCharsets;

/** Read-only parser diagnostics. Coordinates belong to the original, unformatted UTF-16 source. */
public final class SyntaxDiagnostics {
    public static final LanguageLevel LANGUAGE_LEVEL = LanguageLevel.HIGHEST.getNonPreviewLevel();
    public record Edit(int startOffset, int endOffset, String newContent) {}
    public record Request(String file, String content, Edit edit) {
        public Request {
            if (file == null || file.isBlank() || !file.toLowerCase(Locale.ROOT).endsWith(".java") || content == null)
                throw new IllegalArgumentException("A Java file and its complete content are required");
            if (edit != null && (edit.newContent() == null || edit.startOffset() < 0
                    || edit.endOffset() < edit.startOffset() || edit.endOffset() > content.length()))
                throw new IllegalArgumentException("Invalid proposal range");
            String proposed = edit == null ? content : content.substring(0, edit.startOffset()) + edit.newContent() + content.substring(edit.endOffset());
            if (!StandardCharsets.UTF_8.newEncoder().canEncode(content) || !StandardCharsets.UTF_8.newEncoder().canEncode(proposed))
                throw new IllegalArgumentException("Source and proposal must contain well-formed Unicode");
        }
        public String proposedSource() {
            return edit == null ? content : content.substring(0, edit.startOffset()) + edit.newContent() + content.substring(edit.endOffset());
        }
    }
    /** The range is [startOffset, endOffset); both line/column positions use UTF-16 and start at one. */
    public record Range(int startOffset, int endOffset, int startLine, int startColumn, int endLine, int endColumn) {}
    public record Problem(String severity, String message, Range range) {}
    public record Result(String status, int version, String source, String file, String baseRevision,
                         String revision, int sourceLength, String languageLevel, List<Problem> diagnostics) {}
    public static final class Failure extends RuntimeException {
        public final String code;
        public Failure(String code, String message, Throwable cause) { super(message, cause); this.code = code; }
    }
    private SyntaxDiagnostics() {}

    public static Result analyze(Project project, Request request) {
        try {
            checkCancelled();
            if (project == null || project.isDisposed())
                throw new Failure("syntax_analysis_unavailable", "Java syntax analysis is unavailable", null);
            String proposed = request.proposedSource();
            OriginalText text = new OriginalText(proposed);
            return ReadAction.compute(() -> {
                checkCancelled();
                // A nonphysical file has no original-file/module association and never reloads a live Document.
                String name = request.file().replace('\\', '/');
                name = name.substring(name.lastIndexOf('/') + 1);
                PsiFile parsed = PsiFileFactory.getInstance(project).createFileFromText(name,
                        JavaFileType.INSTANCE, text.normalized, 0, false);
                parsed.putUserData(PsiUtil.FILE_LANGUAGE_LEVEL_KEY, LANGUAGE_LEVEL);
                if (!(parsed instanceof PsiJavaFile)) incomplete();
                if (!text.normalized.equals(parsed.getText()) || parsed.isPhysical()) incomplete();
                List<Problem> problems = collect(parsed, text);
                checkCancelled();
                return new Result("ok", 1, "psi-syntax", request.file(), EditCoordinator.hash(request.content()),
                        EditCoordinator.hash(proposed), proposed.length(), ((PsiJavaFile) parsed).getLanguageLevel().name(), List.copyOf(problems));
            });
        } catch (ProcessCanceledException cancelled) {
            throw new Failure("syntax_analysis_cancelled", "Java syntax analysis was cancelled", cancelled);
        } catch (Failure known) { throw known; }
        catch (RuntimeException | StackOverflowError failure) {
            throw new Failure("syntax_analysis_failed", "Java syntax analysis failed", failure);
        }
    }

    private static List<Problem> collect(PsiFile parsed, OriginalText text) {
        List<Problem> problems = new ArrayList<>();
        Deque<PsiElement> pending = new ArrayDeque<>();
        pending.push(parsed);
        while (!pending.isEmpty()) {
            checkCancelled();
            PsiElement element = pending.pop();
            if (element instanceof PsiErrorElement error) {
                String message = error.getErrorDescription();
                if (message == null || message.isBlank()) incomplete();
                TextRange range = error.getTextRange();
                problems.add(new Problem("error", message, range == null ? null : text.range(range)));
            }
            // Sibling traversal also visits zero-length error elements at EOF.
            for (PsiElement child = element.getLastChild(); child != null; child = child.getPrevSibling()) pending.push(child);
        }
        return problems;
    }
    private static void checkCancelled() {
        var indicator = ProgressManager.getInstance().getProgressIndicator();
        if (Thread.currentThread().isInterrupted() || indicator != null && indicator.isCanceled()) throw new ProcessCanceledException();
        ProgressManager.checkCanceled();
    }
    private static void incomplete() {
        throw new Failure("syntax_analysis_incomplete", "Java syntax analysis did not produce a complete result", null);
    }

    /** PSI requires LF. Mapping boundary positions retains original CRLF/CR and supplementary characters. */
    private static final class OriginalText {
        final String normalized;
        final int[] originalOffsets;
        final List<Integer> lineStarts = new ArrayList<>();
        OriginalText(String original) {
            originalOffsets = new int[original.length() + 1];
            StringBuilder value = new StringBuilder(original.length());
            lineStarts.add(0);
            for (int raw = 0; raw < original.length();) {
                char c = original.charAt(raw++);
                if (c == '\r') { if (raw < original.length() && original.charAt(raw) == '\n') raw++; c = '\n'; }
                value.append(c);
                originalOffsets[value.length()] = raw;
                if (c == '\n') lineStarts.add(value.length());
            }
            normalized = value.toString();
        }
        Range range(TextRange range) {
            int start = range.getStartOffset(), end = range.getEndOffset();
            if (start < 0 || end < start || end > normalized.length()) { incomplete(); }
            int a = line(start), b = line(end);
            return new Range(originalOffsets[start], originalOffsets[end], a + 1, start - lineStarts.get(a) + 1,
                    b + 1, end - lineStarts.get(b) + 1);
        }
        int line(int offset) {
            int index = Collections.binarySearch(lineStarts, offset);
            return index >= 0 ? index : -index - 2;
        }
    }
}
