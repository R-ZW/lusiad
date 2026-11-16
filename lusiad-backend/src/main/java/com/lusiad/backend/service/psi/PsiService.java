package com.lusiad.backend.service.psi;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.intellij.lang.ASTNode;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.application.ReadAction;
import com.intellij.openapi.command.WriteCommandAction;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.editor.Document;
import com.intellij.openapi.editor.EditorFactory;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.TextRange;
import com.intellij.openapi.util.text.StringUtil;
import com.intellij.openapi.vfs.LocalFileSystem;
import com.intellij.openapi.vfs.VirtualFile;
import com.intellij.psi.*;
import com.intellij.ide.highlighter.JavaFileType;
import com.lusiad.backend.service.change.ChangeLogService;
import com.lusiad.backend.service.fs.FsDirService;

import java.util.Map;

public class PsiService {

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    private static final Logger LOG = Logger.getInstance(PsiService.class);
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Formats the file at {@code filePath} (relative to {@code basePath}).
     */
    public static String format(Project project, String basePath, String filePath) {
        return runEdit(project, basePath, filePath, context -> successJson("format requested"));
    }

    /**
     * Reads the PSI structure of the Java file at {@code filePath} (relative to {@code basePath}).
     */
    public static String readJavaPsiStructure(Project project, String basePath, String filePath) {
        final String[] result = new String[1];
        String absPath = FsDirService.resolve(basePath, filePath);
        refreshFileFromDisk(project, absPath);

        ApplicationManager.getApplication().runReadAction(() -> {
            PsiJavaFile javaFile = getJavaFile(project, absPath);
            if (javaFile == null) {
                JsonObject missing = new JsonObject();
                missing.addProperty("code", "psi_file_not_found");
                missing.addProperty("error", "Java file not found");
                result[0] = GSON.toJson(missing);
                return;
            }

            Document document = PsiDocumentManager.getInstance(project).getDocument(javaFile);

            JsonObject root = new JsonObject();
            root.addProperty("file", filePath);
            root.addProperty("revision", EditCoordinator.hash(document.getText()));
            root.add("tree", serializePsiElement(javaFile, document));
            result[0] = GSON.toJson(root);
        });

        return result[0];
    }

    /** Parses an immutable Git blob in memory, without touching the live project or VFS. */
    public static String parseJavaSource(Project project, String fileName, String source) {
        // IntelliJ documents use LF even when the snapshot on disk uses CRLF.
        // Both PSI and Document must see the same text so their offsets agree.
        String normalizedSource = StringUtil.convertLineSeparators(source);
        return ReadAction.compute(() -> {
            PsiFile file = PsiFileFactory.getInstance(project).createFileFromText(
                    fileName, JavaFileType.INSTANCE, normalizedSource);
            if (!(file instanceof PsiJavaFile)) return errorJson("Java source could not be parsed");

            Document document = EditorFactory.getInstance().createDocument(normalizedSource);
            JsonObject root = new JsonObject();
            root.addProperty("file", fileName);
            root.add("tree", serializePsiElement(file, document));
            return GSON.toJson(root);
        });
    }

    /**
     * Deletes a range of text from the file at {@code filePath} (relative to {@code basePath}).
     *
     * <p>Accepted keys in {@code req}:
     * <ul>
     *   <li>{@code startOffset} / {@code endOffset} (preferred)</li>
     *   <li>OR {@code startLine} / {@code startColumn} / {@code endLine} / {@code endColumn} (1-based)</li>
     *   <li>{@code expectedType} (optional) – PSI element type name to verify</li>
     *   <li>{@code strictType} (optional, default {@code false}) – fail if type mismatches</li>
     * </ul>
     */
    public static String delete(Project project, int projectId, String basePath,
                                String filePath, Map<String, String> req, boolean needRecord) {
        return runTrackedEdit(project, projectId, basePath, filePath, req, "delete", needRecord, context -> deleteEdit(project, projectId, basePath, filePath, req, context));
    }

    private static String deleteEdit(Project project, int projectId, String basePath,
                                String filePath, Map<String, String> req, EditContext context) {
        try {
            Document doc = context.document;
            PsiFile psiFile = PsiDocumentManager.getInstance(project).getPsiFile(doc);

            Range range = resolveRange(doc, req);
            if (range == null) {
                return errorJson("invalid range: provide startOffset/endOffset or line/column");
            }

            String rangeError = validateRange(range.start, range.end, doc.getTextLength());
            if (rangeError != null) return errorJson(rangeError);

            String expectedType = trimToNull(req.get("expectedType"));
            boolean strictType  = parseBooleanOrDefault(req.get("strictType"), false);
            String actualType   = null;
            boolean typeMatched = true;

            if (expectedType != null) {
                PsiElement container = findSmallestCoveringElement(psiFile, range.start, range.end);
                actualType  = elementTypeName(container);
                typeMatched = expectedType.equals(actualType);

                if (strictType && !typeMatched) {
                    return errorJson("expected type mismatch: expected=" + expectedType + ", actual=" + actualType);
                }
            }

            final int removedChars  = range.end - range.start;
            final boolean whitespaceOnly = doc.getText(new TextRange(range.start, range.end)).isBlank();
            final int finalStart    = range.start;
            final int finalEnd      = range.end;
            final PsiDocumentManager pdm = PsiDocumentManager.getInstance(project);

            doc.deleteString(finalStart, finalEnd);
            pdm.commitDocument(doc);


            JsonObject resp = buildRangeResponse("generic delete applied", filePath, finalStart, finalEnd);
            resp.addProperty("removedChars", removedChars);
            if (expectedType != null) {
                resp.addProperty("expectedType", expectedType);
                resp.addProperty("actualType", actualType);
                resp.addProperty("expectedTypeMatched", typeMatched);
            }

            context.whitespaceOnly = whitespaceOnly;
            return GSON.toJson(resp);

        } catch (Exception e) {
            LOG.warn("PsiService.delete failed", e);
            return errorJson(e.getMessage());
        }
    }

    /**
     * Inserts content into the file at {@code filePath} (relative to {@code basePath}).
     *
     * <p>Accepted keys in {@code req}:
     * <ul>
     *   <li>{@code line} (required, 1-based) – target line</li>
     *   <li>{@code lineEnd} (optional) – must equal {@code line + 1}; BETWEEN_LINES mode</li>
     *   <li>{@code column} (optional, 1-based) – MINIMIZED_CODE_BLOCK mode</li>
     *   <li>{@code content} (required) – text to insert</li>
     * </ul>
     */
    public static String create(Project project, int projectId, String basePath,
                                String filePath, Map<String, String> req, boolean needRecord) {
        return runTrackedEdit(project, projectId, basePath, filePath, req, "create", needRecord, context -> createEdit(project, projectId, basePath, filePath, req, context));
    }

    private static String createEdit(Project project, int projectId, String basePath,
                                String filePath, Map<String, String> req, EditContext context) {
        try {
            Document doc = context.document;

            PsiDocumentManager pdm = PsiDocumentManager.getInstance(project);

            String content = req.get("content");
            if (content == null) return errorJson("content is required");

            Integer lineBase1   = parseIntOrNull(req.get("line"));
            Integer lineEnd1    = parseIntOrNull(req.get("lineEnd"));
            Integer columnBase1 = parseIntOrNull(req.get("column"));

            if (lineBase1 == null) return errorJson("line is required (1-based)");

            int lineCount = doc.getLineCount();
            if (lineBase1 < 1) return errorJson("line out of bounds: " + lineBase1);
            if (lineCount > 0 && lineBase1 > lineCount) return errorJson("line out of bounds: " + lineBase1);

            if (columnBase1 != null && lineEnd1 != null) {
                return errorJson("column and lineEnd cannot be used together");
            }

            final int insertOffset;
            final String mode;

            if (columnBase1 != null) {
                int lineIndex0       = lineBase1 - 1;
                int lineStart        = doc.getLineStartOffset(lineIndex0);
                int lineEndExclusive = doc.getLineEndOffset(lineIndex0);
                int lineLength       = lineEndExclusive - lineStart;

                if (columnBase1 < 1 || columnBase1 > lineLength + 1) {
                    return errorJson("column out of bounds for line " + lineBase1 + ": " + columnBase1
                            + " (valid: 1.." + (lineLength + 1) + ")");
                }

                insertOffset = lineStart + (columnBase1 - 1);
                mode = "MINIMIZED_CODE_BLOCK";
            } else if (lineEnd1 == null) {
                insertOffset = (lineCount == 0) ? 0 : doc.getLineStartOffset(lineBase1 - 1);
                mode = "AT_LINE";
            } else {
                if (lineEnd1 != lineBase1 + 1) return errorJson("lineEnd must be line + 1");
                if (lineEnd1 < 1 || lineEnd1 > lineCount) return errorJson("lineEnd out of bounds: " + lineEnd1);
                insertOffset = doc.getLineStartOffset(lineEnd1 - 1);
                mode = "BETWEEN_LINES";
            }

            final String toInsert = componentContent(doc.getText(), insertOffset, normalizeInsertionContent(content, mode), req);
            final Integer finalLineEnd = lineEnd1;
            final Integer finalColumn  = columnBase1;

            doc.insertString(insertOffset, toInsert);
            pdm.commitDocument(doc);


            JsonObject resp = new JsonObject();
            resp.addProperty("status", "ok");
            resp.addProperty("message", "generic create applied");
            resp.addProperty("path", filePath);
            resp.addProperty("mode", mode);
            resp.addProperty("line", lineBase1);
            if (finalLineEnd != null) resp.addProperty("lineEnd", finalLineEnd);
            if (finalColumn != null)  resp.addProperty("column", finalColumn);
            resp.addProperty("offset", insertOffset);
            resp.addProperty("insertedChars", toInsert.length());
            if ("true".equals(req.get("componentPlacement"))) resp.addProperty("insertedContent", toInsert);

            context.whitespaceOnly = toInsert.isBlank();
            return GSON.toJson(resp);

        } catch (Exception e) {
            LOG.warn("PsiService.create failed", e);
            return errorJson(e.getMessage());
        }
    }

    /**
     * Replaces a text range in the file at {@code filePath} (relative to {@code basePath}).
     */
    public static String update(Project project, int projectId, String basePath,
                                String filePath, String startOffsetStr, String endOffsetStr,
                                String newContent, Map<String, String> req, boolean needRecord) {
        return runTrackedEdit(project, projectId, basePath, filePath, req, "update", needRecord, context -> updateEdit(project, projectId, basePath, filePath, startOffsetStr, endOffsetStr, newContent, req, context));
    }

    private static String updateEdit(Project project, int projectId, String basePath,
                                String filePath, String startOffsetStr, String endOffsetStr,
                                String newContent, Map<String, String> req, EditContext context) {
        try {
            Document doc = context.document;
            PsiDocumentManager pdm = PsiDocumentManager.getInstance(project);

            Integer startOffset = parseIntOrNull(startOffsetStr);
            Integer endOffset   = parseIntOrNull(endOffsetStr);
            if (startOffset == null || endOffset == null) {
                return errorJson("startOffset/endOffset must be valid integers");
            }

            String rangeError = validateRange(startOffset, endOffset, doc.getTextLength());
            if (rangeError != null) return errorJson(rangeError);

            if (newContent == null) return errorJson("newContent is required");
            final String normalizedContent = StringUtil.convertLineSeparators(newContent);
            final boolean whitespaceOnly = normalizedContent.isBlank()
                    && doc.getText(new TextRange(startOffset, endOffset)).isBlank();
            final int removedChars  = endOffset - startOffset;
            final int insertedChars = normalizedContent.length();

            doc.replaceString(startOffset, endOffset, normalizedContent);
            pdm.commitDocument(doc);


            JsonObject resp = buildRangeResponse("generic edit applied", filePath, startOffset, endOffset);
            resp.addProperty("removedChars", removedChars);
            resp.addProperty("insertedChars", insertedChars);

            context.whitespaceOnly = whitespaceOnly;
            return GSON.toJson(resp);

        } catch (Exception e) {
            LOG.warn("PsiService.update failed", e);
            return errorJson(e.getMessage());
        }
    }

    /**
     * Moves a text range within the file at {@code filePath} (relative to {@code basePath}).
     */
    public static String move(Project project, int projectId, String basePath,
                              String filePath, Map<String, String> req, boolean needRecord) {
        return runTrackedEdit(project, projectId, basePath, filePath, req, "move", needRecord, context -> moveEdit(project, projectId, basePath, filePath, req, context));
    }

    private static String moveEdit(Project project, int projectId, String basePath,
                              String filePath, Map<String, String> req, EditContext context) {
        try {
            Document doc = context.document;
            PsiDocumentManager pdm = PsiDocumentManager.getInstance(project);

            Integer start       = parseIntOrNull(req.get("startOffset"));
            Integer end         = parseIntOrNull(req.get("endOffset"));
            Integer lineBase1   = parseIntOrNull(req.get("line"));
            Integer lineEnd1    = parseIntOrNull(req.get("lineEnd"));
            Integer columnBase1 = parseIntOrNull(req.get("column"));

            if (start == null || end == null) return errorJson("startOffset/endOffset must be valid integers");
            if (end <= start) return errorJson("move requires a nonempty source range");
            if (lineBase1 == null)             return errorJson("line is required (1-based)");

            String rangeError = validateRange(start, end, doc.getTextLength());
            if (rangeError != null) return errorJson(rangeError);

            int lineCount = doc.getLineCount();
            if (lineCount <= 0)                           return errorJson("empty document");
            if (lineBase1 < 1 || lineBase1 > lineCount)  return errorJson("line out of bounds: " + lineBase1);

            if (columnBase1 != null && lineEnd1 != null) {
                return errorJson("column and lineEnd cannot be used together");
            }

            final int targetOriginal;
            final String mode;

            if (columnBase1 != null) {
                int lineIndex0       = lineBase1 - 1;
                int lineStart        = doc.getLineStartOffset(lineIndex0);
                int lineEndExclusive = doc.getLineEndOffset(lineIndex0);
                int lineLength       = lineEndExclusive - lineStart;

                if (columnBase1 < 1 || columnBase1 > lineLength + 1) {
                    return errorJson("column out of bounds for line " + lineBase1 + ": " + columnBase1
                            + " (valid: 1.." + (lineLength + 1) + ")");
                }

                targetOriginal = lineStart + (columnBase1 - 1);
                mode = "MINIMIZED_CODE_BLOCK";
            } else if (lineEnd1 == null) {
                targetOriginal = doc.getLineStartOffset(lineBase1 - 1);
                mode = "AT_LINE";
            } else {
                if (lineEnd1 != lineBase1 + 1) return errorJson("lineEnd must be line + 1");
                if (lineEnd1 < 1 || lineEnd1 > lineCount) return errorJson("lineEnd out of bounds: " + lineEnd1);
                targetOriginal = doc.getLineStartOffset(lineEnd1 - 1);
                mode = "BETWEEN_LINES";
            }

            if (targetOriginal >= start && targetOriginal <= end) {
                return errorJson("target position is inside source range");
            }

            final int sourceLen      = end - start;
            final String movedText   = doc.getText(new TextRange(start, end));
            final int finalStart     = start;
            final int finalEnd       = end;
            final Integer finalLineEnd   = lineEnd1;
            final Integer finalColumn    = columnBase1;

            doc.deleteString(finalStart, finalEnd);

            int targetAfterDelete = targetOriginal > finalEnd
                    ? targetOriginal - sourceLen
                    : targetOriginal;

            targetAfterDelete = Math.max(0, Math.min(targetAfterDelete, doc.getTextLength()));
            String insertedContent = componentContent(doc.getText(), targetAfterDelete, movedText, req);
            doc.insertString(targetAfterDelete, insertedContent);
            pdm.commitDocument(doc);


            JsonObject resp = buildRangeResponse("generic move applied", filePath, start, end);
            resp.addProperty("mode", mode);
            resp.addProperty("movedChars", sourceLen);
            if ("true".equals(req.get("componentPlacement"))) resp.addProperty("insertedContent", insertedContent);
            resp.addProperty("targetOriginalOffset", targetOriginal);
            resp.addProperty("targetOffset", targetAfterDelete);
            resp.addProperty("insertedChars", insertedContent.length());
            resp.addProperty("line", lineBase1);
            if (finalLineEnd != null) resp.addProperty("lineEnd", finalLineEnd);
            if (finalColumn != null)  resp.addProperty("column", finalColumn);

            context.whitespaceOnly = movedText.isBlank();
            return GSON.toJson(resp);

        } catch (Exception e) {
            LOG.warn("PsiService.move failed", e);
            return errorJson(e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers – resolution
    // -------------------------------------------------------------------------

    private static Document resolveDocument(Project project, String absFilePath, PsiFile[] psiOut) {
        VirtualFile vf = LocalFileSystem.getInstance().findFileByPath(absFilePath);
        if (vf == null) throw new IllegalArgumentException("file not found: " + absFilePath);

        PsiFile psiFile = PsiManager.getInstance(project).findFile(vf);
        if (psiFile == null) throw new IllegalArgumentException("psi file not found for: " + absFilePath);

        PsiDocumentManager pdm = PsiDocumentManager.getInstance(project);
        Document doc = pdm.getDocument(psiFile);
        if (doc == null) throw new IllegalArgumentException("document not found for: " + absFilePath);

        if (psiOut != null) psiOut[0] = psiFile;
        return doc;
    }

    /** Refresh outside read locks; external writes must reach VFS, Document and PSI. */
    public static void refreshFileFromDisk(Project project, String absFilePath) {
        Runnable refresh = () -> {
            VirtualFile vf = LocalFileSystem.getInstance().refreshAndFindFileByPath(absFilePath);
            if (vf == null) return;
            FileDocumentManager files = FileDocumentManager.getInstance();
            Document document = files.getCachedDocument(vf);
            // The IDE owns unsaved edits. Never replace them with older disk content.
            if (document == null || !files.isDocumentUnsaved(document)) {
                vf.refresh(false, false);
                if (document == null) document = files.getDocument(vf);
                if (document != null) {
                    try {
                        String disk = PsiEditPersistence.diskText(vf);
                        if (!document.getText().equals(disk)) {
                            // Equal mtime/size can leave persisted VFS bytes stale after NIO replacement.
                            // Evict only this file; reload updates Document/PSI without touching disk.
                            if (vf instanceof com.intellij.openapi.vfs.VirtualFileWithId id
                                    && com.intellij.openapi.vfs.newvfs.persistent.PersistentFS.getInstance()
                                    instanceof com.intellij.openapi.vfs.newvfs.persistent.PersistentFSImpl persistent) {
                                persistent.cleanPersistedContent(id.getId());
                            }
                        }
                        files.reloadFromDisk(document);
                        if (!document.getText().equals(disk)) throw new IllegalStateException("PSI document differs from disk after refresh");
                    } catch (java.io.IOException error) { throw new IllegalStateException("Could not refresh document from disk", error); }
                }
            }
            if (document != null) PsiDocumentManager.getInstance(project).commitDocument(document);
        };
        var application = ApplicationManager.getApplication();
        if (application.isDispatchThread()) refresh.run();
        else application.invokeAndWait(refresh);
    }

    private static PsiJavaFile getJavaFile(Project project, String absFilePath) {
        VirtualFile vf = LocalFileSystem.getInstance().findFileByPath(absFilePath);
        if (vf == null) return null;

        PsiFile psiFile = PsiManager.getInstance(project).findFile(vf);
        if (!(psiFile instanceof PsiJavaFile)) return null;

        return (PsiJavaFile) psiFile;
    }

    private static Range resolveRange(Document doc, Map<String, String> req) {
        Integer startOffset = parseIntOrNull(req.get("startOffset"));
        Integer endOffset   = parseIntOrNull(req.get("endOffset"));

        if (startOffset != null && endOffset != null) {
            return new Range(startOffset, endOffset);
        }

        Integer startLine1 = parseIntOrNull(req.get("startLine"));
        Integer startCol1  = parseIntOrNull(req.get("startColumn"));
        Integer endLine1   = parseIntOrNull(req.get("endLine"));
        Integer endCol1    = parseIntOrNull(req.get("endColumn"));

        if (startLine1 == null || startCol1 == null || endLine1 == null || endCol1 == null) {
            return null;
        }

        int start = lineCol1BasedToOffset(doc, startLine1, startCol1);
        int end   = lineCol1BasedToOffset(doc, endLine1, endCol1);
        return new Range(start, end);
    }

    private static int lineCol1BasedToOffset(Document doc, int line1, int col1) {
        int line = line1 - 1;
        int col  = col1 - 1;

        if (line < 0 || line >= doc.getLineCount()) {
            throw new IllegalArgumentException("line out of bounds: " + line1);
        }

        int lineStart = doc.getLineStartOffset(line);
        int lineLen   = doc.getLineEndOffset(line) - lineStart;

        if (col < 0 || col > lineLen) {
            throw new IllegalArgumentException("column out of bounds at line " + line1 + ": " + col1);
        }

        return lineStart + col;
    }

    private static PsiElement findSmallestCoveringElement(PsiFile psiFile, int start, int end) {
        PsiElement e    = psiFile.findElementAt(start);
        if (e == null) return psiFile;

        PsiElement best = e;
        while (e != null) {
            TextRange r = e.getTextRange();
            if (r != null && r.getStartOffset() <= start && r.getEndOffset() >= end) {
                best = e;
                e    = e.getParent();
            } else {
                break;
            }
        }
        return best;
    }

    // -------------------------------------------------------------------------
    // Private helpers – serialization
    // -------------------------------------------------------------------------

    private static JsonObject serializePsiElement(PsiElement element, Document document) {
        JsonObject obj      = new JsonObject();
        PsiElement[] children = element.getChildren();

        obj.addProperty("type", element.getClass().getSimpleName());

        TextRange range = element.getTextRange();
        if (range != null) {
            int startOffset = range.getStartOffset();
            int endOffset   = range.getEndOffset();

            obj.addProperty("startOffset", startOffset);
            obj.addProperty("endOffset", endOffset);

            if (document != null) {
                int startLine = document.getLineNumber(startOffset);
                int startCol  = startOffset - document.getLineStartOffset(startLine);

                int safeEndOffset = Math.max(startOffset, endOffset - 1);
                int endLine       = document.getLineNumber(safeEndOffset);
                int endCol        = safeEndOffset - document.getLineStartOffset(endLine);

                obj.addProperty("startLine", startLine + 1);
                obj.addProperty("startColumn", startCol + 1);
                obj.addProperty("endLine", endLine + 1);
                obj.addProperty("endColumn", endCol + 1);
            }
        }

        if (children.length == 0) {
            String text = element.getText();
            obj.addProperty("text", text != null ? text : "");
        } else {
            JsonArray childArray = new JsonArray();
            for (PsiElement child : children) {
                childArray.add(serializePsiElement(child, document));
            }
            obj.add("children", childArray);
        }

        return obj;
    }

    private static JsonObject buildRangeResponse(String message, String filePath, int start, int end) {
        JsonObject resp = new JsonObject();
        resp.addProperty("status", "ok");
        resp.addProperty("message", message);
        resp.addProperty("path", filePath);
        resp.addProperty("startOffset", start);
        resp.addProperty("endOffset", end);
        return resp;
    }

    // -------------------------------------------------------------------------
    // Private helpers – formatting
    // -------------------------------------------------------------------------

    @FunctionalInterface private interface Edit { String run(EditContext context); }

    private static final class EditContext {
        Document document;
        boolean whitespaceOnly;
    }

    private static com.lusiad.backend.repository.change.EditOperationStore operationStore(int projectId, String root) throws Exception {
        return new com.lusiad.backend.repository.change.EditOperationStore(
                new com.lusiad.backend.repository.sql.SqlConnectionFactory(ChangeLogService.databaseConfiguration()), projectId, root);
    }

    /** Used by reads/scans before they classify a pending Lusiad edit as an external change. */
    public static String recoverEdits(Project project, int projectId, String basePath) {
        try (var store = operationStore(projectId, basePath)) {
            int count = EditCoordinator.recover(store, operationDisk(project, basePath));
            JsonObject result = new JsonObject(); result.addProperty("status", "ok"); result.addProperty("recovered", count);
            return GSON.toJson(result);
        } catch (Exception failure) { return operationError(failure); }
    }

    private static String runTrackedEdit(Project project, int projectId, String basePath, String filePath,
                                          Map<String, String> request, String type, boolean record, Edit edit) {
        if (!record) return runEdit(project, basePath, filePath, edit); // Legacy replay remains compatible.
        try (var store = operationStore(projectId, basePath)) {
            var disk = operationDisk(project, basePath);
            return GSON.toJson(EditCoordinator.execute(store, disk, request.get("expectedHash"), () -> prepareEdit(project, basePath, filePath, request, type, edit)));
        } catch (Exception failure) { return operationError(failure); }
    }

    static EditCoordinator.Plan prepareRecordedEdit(Project project, String root, String path, Map<String, String> req, String type) throws Exception {
        return prepareEdit(project, root, path, req, type, editFor(project, root, path, req, type));
    }

    private static Edit editFor(Project project, String root, String path, Map<String, String> req, String type) {
        return switch (type) {
            case "create" -> context -> createEdit(project, 0, root, path, req, context);
            case "delete" -> context -> deleteEdit(project, 0, root, path, req, context);
            case "move" -> context -> moveEdit(project, 0, root, path, req, context);
            case "update" -> context -> updateEdit(project, 0, root, path, req.get("startOffset"), req.get("endOffset"), req.get("newContent"), req, context);
            default -> throw new IllegalArgumentException("Unknown edit type");
        };
    }

    /** Same edit rules as saving, on caller-owned PSI text only. No formatting, disk, SQL or recovery. */
    public static String proposedEdit(Project project, String path, String source, Map<String, String> req, String type) {
        new SyntaxDiagnostics.Request(path, source, null);
        if (!source.equals(StringUtil.convertLineSeparators(source)))
            throw new IllegalArgumentException("Editor context must use Document LF offsets");
        String[] proposed = new String[1];
        Edit edit = editFor(project, "", path, req, type);
        WriteCommandAction.runWriteCommandAction(project, () -> {
            // A detached LightVirtualFile supplies a Document, as in prepareEdit; it has no disk target.
            PsiFile copy = PsiFileFactory.getInstance(project).createFileFromText("Proposal.java", JavaFileType.INSTANCE, source, 0, true);
            EditContext context = new EditContext();
            context.document = PsiDocumentManager.getInstance(project).getDocument(copy);
            if (context.document == null) throw new IllegalStateException("Cannot prepare syntax proposal");
            JsonObject result = com.google.gson.JsonParser.parseString(edit.run(context)).getAsJsonObject();
            if (result.has("error")) throw new IllegalArgumentException(result.get("error").getAsString());
            proposed[0] = context.document.getText();
        });
        return proposed[0];
    }

    private static EditCoordinator.Plan prepareEdit(Project project, String basePath, String filePath, Map<String, String> request, String type, Edit edit) throws Exception {
        String relative = FsDirService.relativize(basePath, FsDirService.resolveEntry(basePath, filePath));
        EditCoordinator.Content original = operationDisk(project, basePath).read(relative);
        String before = original.text();
        var live = LocalFileSystem.getInstance().refreshAndFindFileByPath(FsDirService.resolveEntry(basePath, relative));
        if (live == null) throw new IllegalArgumentException("File no longer exists");
        java.nio.charset.Charset charset = live.getCharset();
        String separator = FileDocumentManager.getInstance().getLineSeparator(live, project);
        byte[] bom = live.getBOM();
        EditContext context = new EditContext();
        EditCoordinator.Plan[] plan = new EditCoordinator.Plan[1];
        WriteCommandAction.runWriteCommandAction(project, () -> {
            // Validate/mutate/format a detached PSI file; SQL preparation never exposes half an edit.
            PsiFile copy = PsiFileFactory.getInstance(project).createFileFromText("Edit.java", JavaFileType.INSTANCE, before, 0, true);
            context.document = PsiDocumentManager.getInstance(project).getDocument(copy);
            if (context.document == null) throw new IllegalStateException("Cannot prepare PSI document");
            JsonObject result = com.google.gson.JsonParser.parseString(edit.run(context)).getAsJsonObject();
            if (result.has("error")) throw new EditCoordinator.Failure("invalid_request", result.get("error").getAsString(), null, null);
            String unformatted = context.document.getText();
            var formatting = PsiEditPersistence.format(context.document, context.whitespaceOnly,
                    source -> new com.google.googlejavaformat.java.Formatter().formatSource(source));
            long predictedSize = context.document.getText().replace("\n", separator == null ? "\n" : separator).getBytes(charset).length + (bom == null ? 0 : bom.length);
            if (predictedSize > com.lusiad.backend.service.undo.ResourceImage.MAX_BYTES) throw new EditCoordinator.Failure("resource_limit", "Result exceeds the supported single-resource capture limit", null, null);
            if (original.bytes().length + predictedSize > com.lusiad.backend.service.undo.ResourceImage.MAX_BYTES && !"true".equals(request.get("allowWithoutUndo"))) throw com.lusiad.backend.service.undo.ResourceImage.capacity();
            result.addProperty("saved", true); result.addProperty("path", relative);
            JsonObject format = new JsonObject(); format.addProperty("status", formatting.status()); result.add("formatting", format);
            Map<String, String> req = relativizeReq(basePath, request);
            if (result.has("insertedContent")) req.put("insertedContent", result.get("insertedContent").getAsString());
            for (String key : new String[]{"content", "newContent"}) if (req.get(key) != null) req.put(key, StringUtil.convertLineSeparators(req.get(key)));
            result.add("changeMetadata", com.lusiad.backend.service.change.ChangeMetadata.code(
                    project, relative, type, before, unformatted, context.document.getText(), result));
            result.add("_undoBefore", com.lusiad.backend.service.undo.ResourceImage.file(relative, original.bytes()).json());
            plan[0] = new EditCoordinator.Plan(basePath, relative, type, req, before, context.document.getText(), result);
        });
        return plan[0];
    }

    private static String operationError(Exception failure) {
        LOG.warn("Recorded PSI edit not confirmed", failure);
        JsonObject result = new JsonObject();
        result.addProperty("error", failure.getMessage() == null ? "Edit recording unavailable" : failure.getMessage());
        result.addProperty("code", failure instanceof EditCoordinator.Failure f ? f.code : "record_unavailable");
        if (failure instanceof EditCoordinator.Failure f && f.operationId != null) result.addProperty("operationId", f.operationId);
        return GSON.toJson(result);
    }

    public static EditCoordinator.Disk recordedDisk(Project project, String root) { return operationDisk(project, root); }
    private static EditCoordinator.Disk operationDisk(Project project, String root) {
        return new EditCoordinator.Disk() {
            @Override public EditCoordinator.Content read(EditCoordinator.Plan plan) throws Exception {
                return plan.result().has("resourceImage") ? com.lusiad.backend.service.undo.ResourceEdits.read(root, plan) : read(plan.path());
            }
            public EditCoordinator.Content read(String path) throws Exception {
                String absolute = FsDirService.resolveEntry(root, path);
                refreshFileFromDisk(project, absolute);
                return ReadAction.compute(() -> {
                    Document doc = resolveDocument(project, absolute, null);
                    VirtualFile file = FileDocumentManager.getInstance().getFile(doc);
                    try {
                        byte[] bytes = java.nio.file.Files.readAllBytes(java.nio.file.Path.of(absolute));
                        String disk = PsiEditPersistence.diskText(file, bytes);
                        if (!doc.getText().equals(disk)) throw new EditCoordinator.Failure("revision_conflict", "Save or discard unsaved IntelliJ changes before editing in Lusiad", null, null);
                        return new EditCoordinator.Content(disk, bytes);
                    } catch (java.io.IOException failure) { throw new EditCoordinator.Failure("save_failed", "Cannot inspect edit file", null, failure); }
                });
            }
            public void write(EditCoordinator.Plan plan) {
                if (plan.result().has("resourceImage")) {
                    try { com.lusiad.backend.service.undo.ResourceEdits.apply(project, root, plan); return; }
                    catch (Exception failure) { if (failure instanceof RuntimeException runtime) throw runtime; throw new EditCoordinator.Failure("save_failed", "Resource save failed; inspect the durable operation", null, failure); }
                }
                String absolute = FsDirService.resolveEntry(root, plan.path());
                WriteCommandAction.runWriteCommandAction(project, () -> {
                    Document doc = resolveDocument(project, absolute, null);
                    VirtualFile file = FileDocumentManager.getInstance().getFile(doc);
                    boolean modified = false;
                    try {
                        if (!doc.getText().equals(plan.before()) || !PsiEditPersistence.diskText(file).equals(plan.before()))
                            throw new EditCoordinator.Failure("revision_conflict", "File changed before saving the prepared edit", null, null);
                        doc.setText(plan.after());
                        modified = true;
                        PsiEditPersistence.persist(project, doc, file, d -> FileDocumentManager.getInstance().saveDocument(d));
                    } catch (Exception failure) {
                        try { if (modified && doc.isWritable()) doc.setText(PsiEditPersistence.diskText(file)); }
                        catch (Exception unreadable) { /* Intent remains durable and blocks further edits. */ }
                        PsiDocumentManager.getInstance(project).commitDocument(doc);
                        if (failure instanceof EditCoordinator.Failure typed) throw typed;
                        throw new EditCoordinator.Failure(failure instanceof PsiEditPersistence.SaveFailure save ? save.code : "save_failed",
                                "Could not save the prepared edit; its intent remains available for inspection/recovery", null, failure);
                    }
                });
            }
        };
    }

    /** Version-2 replay uses the actual formatted states, not a second execution of the formatter. */
    public static String replayRecordedEdit(Project project, String root, Map<String, String> req) {
        try {
            String before = req.get("beforeText"), after = req.get("afterText");
            if (before == null || after == null || !EditCoordinator.hash(before).equals(req.get("beforeHash"))
                    || !EditCoordinator.hash(after).equals(req.get("afterHash"))) return errorJson("Invalid version-2 edit states");
            var disk = operationDisk(project, root);
            if (!disk.read(req.get("path")).text().equals(before)) return errorJson("Historical edit preimage differs from snapshot");
            disk.write(new EditCoordinator.Plan(root, req.get("path"), "update", req, before, after, new JsonObject()));
            return successJson("version-2 edit restored");
        } catch (Exception failure) { return errorJson(failure.getMessage()); }
    }

    private static String runEdit(Project project, String basePath, String filePath, Edit edit) {
        try {
            String absolute = FsDirService.resolveEntry(basePath, filePath);
            refreshFileFromDisk(project, absolute); // Never refresh while holding a write/read lock.
            EditContext context = new EditContext();
            JsonObject[] response = new JsonObject[1];
            WriteCommandAction.runWriteCommandAction(project, () -> {
                context.document = resolveDocument(project, absolute, null);
                Document document = context.document;
                String before = document.getText();
                boolean previouslyUnsaved = FileDocumentManager.getInstance().isDocumentUnsaved(document);
                try {
                    if (!document.isWritable()) throw new PsiEditPersistence.SaveFailure("save_failed", "Document is read-only", null);
                    JsonObject result = com.google.gson.JsonParser.parseString(edit.run(context)).getAsJsonObject();
                    if (result.has("error")) {
                        if (!document.getText().equals(before)) document.setText(before);
                        PsiDocumentManager.getInstance(project).commitDocument(document);
                        response[0] = result;
                        return;
                    }
                    VirtualFile file = FileDocumentManager.getInstance().getFile(document);
                    var formatting = PsiEditPersistence.finish(project, document, file, context.whitespaceOnly);
                    result.addProperty("saved", true);
                    result.addProperty("path", FsDirService.relativize(basePath, absolute));
                    JsonObject format = new JsonObject(); format.addProperty("status", formatting.status());
                    result.add("formatting", format);
                    response[0] = result;
                } catch (RuntimeException failure) {
                    // Keep pre-existing unsaved IDE work. Otherwise return the Document to actual disk content.
                    String rollback = before;
                    if (!previouslyUnsaved) {
                        try { rollback = PsiEditPersistence.diskText(FileDocumentManager.getInstance().getFile(document)); }
                        catch (Exception unreadable) { /* The explicit save error remains; never invent a saved state. */ }
                    }
                    if (document.isWritable() && !document.getText().equals(rollback)) document.setText(rollback);
                    PsiDocumentManager.getInstance(project).commitDocument(document);
                    JsonObject error = new JsonObject();
                    error.addProperty("error", failure.getMessage() == null ? "Edit could not be saved" : failure.getMessage());
                    error.addProperty("code", failure instanceof PsiEditPersistence.SaveFailure save ? save.code : "operation_failed");
                    error.addProperty("saved", false);
                    response[0] = error;
                }
            });
            return GSON.toJson(response[0]);
        } catch (Exception failure) {
            LOG.warn("PSI edit failed", failure);
            return errorJson(failure.getMessage());
        }
    }

    /** Separate whole components without changing whitespace-only operations or legacy replay. */
    private static String componentContent(String source, int offset, String content, Map<String, String> request) {
        if (!"true".equals(request.get("componentPlacement")) || content.isBlank()) return content;
        int lineStart = source.lastIndexOf('\n', offset - 1) + 1;
        String prefix = source.substring(lineStart, offset).isBlank() || content.startsWith("\n") ? "" : "\n";
        return prefix + content + (content.endsWith("\n") ? "" : "\n");
    }

    private static String normalizeInsertionContent(String content, String mode) {
        content = StringUtil.convertLineSeparators(content);
        if (content.isEmpty()) return content;
        if ("BETWEEN_LINES".equals(mode) && !content.endsWith("\n")) {
            return content + "\n";
        }
        return content;
    }

    /**
     * Returns a copy of {@code req} where every path field ({@code path},
     * {@code sourcePath}, {@code destPath}) has been replaced by its value
     * relativized against {@code basePath}.  Non-path entries are copied unchanged.
     * The original map is never mutated.
     */
    private static Map<String, String> relativizeReq(String basePath, Map<String, String> req) {
        Map<String, String> copy = new java.util.HashMap<>(req);
        for (String key : new String[]{"path", "sourcePath", "destPath"}) {
            String val = copy.get(key);
            if (val != null && !val.isEmpty()) {
                copy.put(key, FsDirService.relativize(basePath, val));
            }
        }
        return copy;
    }

    // -------------------------------------------------------------------------
    // Private helpers – JSON
    // -------------------------------------------------------------------------

    private static String errorJson(String message) {
        JsonObject obj = new JsonObject();
        obj.addProperty("error", message != null ? message : "unknown error");
        return GSON.toJson(obj);
    }

    private static String successJson(String message) {
        JsonObject obj = new JsonObject();
        obj.addProperty("status", "ok");
        obj.addProperty("message", message);
        return GSON.toJson(obj);
    }

    // -------------------------------------------------------------------------
    // Private helpers – parsing & misc
    // -------------------------------------------------------------------------

    private static String validateRange(int start, int end, int docLength) {
        if (start < 0 || end < start || end > docLength) {
            return "range out of bounds [start=" + start + ", end=" + end + ", docLen=" + docLength + "]";
        }
        return null;
    }

    private static Integer parseIntOrNull(String v) {
        if (v == null) return null;
        String s = v.trim();
        if (s.isEmpty()) return null;
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static boolean parseBooleanOrDefault(String v, boolean def) {
        if (v == null) return def;
        String s = v.trim();
        if (s.isEmpty()) return def;
        return "true".equalsIgnoreCase(s) || "1".equals(s);
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static String elementTypeName(PsiElement e) {
        if (e == null) return "null";
        ASTNode node = e.getNode();
        return (node != null && node.getElementType() != null)
                ? node.getElementType().toString()
                : e.getClass().getSimpleName();
    }

    // -------------------------------------------------------------------------
    // Internal types
    // -------------------------------------------------------------------------

    private static final class Range {
        final int start;
        final int end;

        Range(int start, int end) {
            this.start = start;
            this.end   = end;
        }
    }
}
