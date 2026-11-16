package com.lusiad.backend.service.psi;

import com.google.googlejavaformat.java.FormatterException;
import com.intellij.openapi.editor.Document;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.text.StringUtil;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.psi.PsiDocumentManager;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** Runs inside the edit's write command. Formatting failure never suppresses saving. */
final class PsiEditPersistence {
    @FunctionalInterface interface Format { String run(String source) throws Exception; }
    @FunctionalInterface interface Save { void run(Document document); }
    record Formatting(String status) {}

    static final class SaveFailure extends RuntimeException {
        final String code;
        SaveFailure(String code, String detail, Throwable cause) { super(detail, cause); this.code = code; }
    }

    static Formatting finish(Project project, Document document, VirtualFile file, boolean whitespaceOnly) {
        return finish(project, document, file, whitespaceOnly,
                text -> new com.google.googlejavaformat.java.Formatter().formatSource(text),
                doc -> FileDocumentManager.getInstance().saveDocument(doc));
    }

    static Formatting finish(Project project, Document document, VirtualFile file, boolean whitespaceOnly, Format format, Save save) {
        Formatting result = format(document, whitespaceOnly, format);
        persist(project, document, file, save);
        return result;
    }

    static Formatting format(Document document, boolean whitespaceOnly, Format format) {
        Formatting result = new Formatting("skipped_whitespace");
        if (!whitespaceOnly) {
            try {
                String formatted = format.run(document.getText());
                document.setText(formatted);
                result = new Formatting("formatted");
            } catch (FormatterException rejected) { result = new Formatting("rejected"); }
            catch (Exception | LinkageError unavailable) { result = new Formatting("failed"); }
        }
        return result;
    }

    static void persist(Project project, Document document, VirtualFile file, Save save) {
        PsiDocumentManager.getInstance(project).commitDocument(document);
        try { save.run(document); }
        catch (RuntimeException error) { throw new SaveFailure("save_failed", "The IDE could not save the edited document", error); }
        if (FileDocumentManager.getInstance().isDocumentUnsaved(document))
            throw new SaveFailure("save_failed", "The IDE refused to save the edited document", null);
        try {
            // Independent disk read: a silent save veto or a different persisted value is never success.
            if (!document.getText().equals(diskText(file)))
                throw new SaveFailure("save_verification_failed", "Saved file differs from the edited document", null);
        } catch (IOException error) { throw new SaveFailure("save_verification_failed", "Could not verify the saved file", error); }
    }

    static String diskText(VirtualFile file) throws IOException {
        return diskText(file, Files.readAllBytes(Path.of(file.getPath())));
    }

    static String diskText(VirtualFile file, byte[] bytes) {
        String text = new String(bytes, file.getCharset());
        if (text.startsWith("\uFEFF")) text = text.substring(1); // Document excludes a file's BOM.
        return StringUtil.convertLineSeparators(text);
    }
}
