package com.lusiad.backend.service.fs;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.intellij.openapi.command.WriteCommandAction;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vfs.LocalFileSystem;
import com.intellij.openapi.vfs.VirtualFile;
import com.lusiad.backend.service.change.ChangeLogService;

import java.io.IOException;
import java.util.Map;

public class FsFileService {

    private static final Logger LOG = Logger.getInstance(FsFileService.class);
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    // -------------------------------------------------------------------------
    // Public API — path parameters are RELATIVE to basePath (or absolute)
    // -------------------------------------------------------------------------

    /**
     * Creates a new file inside {@code dirPath} (relative to {@code basePath}) with the given {@code name}.
     *
     * @param project     IntelliJ project context
     * @param projectId   database project id (used for change logging)
     * @param basePath    absolute project root
     * @param dirPath     relative (or absolute) path of the parent directory
     * @param name        file name
     * @param content     initial content (may be null for an empty file)
     * @param req         original request map (stored in the change log)
     * @param needRecord  whether to persist a change-log entry
     */
    public static String create(Project project, int projectId, String basePath,
                                String dirPath, String name, String content,
                                Map<String, String> req, boolean needRecord) {
        try {
            String absDir = FsDirService.resolve(basePath, dirPath);
            ContainedPaths.name(name);
            FsDirService.resolve(basePath, absDir + "/" + name);

            VirtualFile dir = refreshAndFind(absDir);
            if (dir == null)             return errorJson("directory not found: " + dirPath);
            if (!dir.isDirectory())      return errorJson("path is not a directory: " + dirPath);
            if (dir.findChild(name) != null) return errorJson("file already exists: " + dirPath + "/" + name);

            final String[] out = new String[1];
            final Runnable[] record = new Runnable[1];
            final String safeContent = content != null ? content : "";

            WriteCommandAction.runWriteCommandAction(project, () -> {
                try {
                    FsDirService.resolve(basePath, absDir + "/" + name);
                    VirtualFile newFile = SafeVfsFiles.create(dir, name,
                            safeContent.getBytes(java.nio.charset.StandardCharsets.UTF_8));

                    if (needRecord) {
                        var metadata = com.lusiad.backend.service.change.ChangeMetadata.paths("file_create", null, FsDirService.relativize(basePath, newFile.getPath()));
                        record[0] = () -> ChangeLogService.recordFilesystem(projectId, "file_create", relativizeReq(basePath, req), metadata);
                    }

                    JsonObject resp = new JsonObject();
                    resp.addProperty("status", "ok");
                    resp.addProperty("message", "file created");
                    resp.addProperty("path", FsDirService.relativize(basePath, newFile.getPath()));
                    resp.addProperty("name", name);
                    resp.addProperty("size", safeContent.length());
                    out[0] = GSON.toJson(resp);
                } catch (IOException e) {
                    out[0] = errorJson(e.getMessage());
                }
            });

            if (record[0] != null && out[0] != null && !com.google.gson.JsonParser.parseString(out[0]).getAsJsonObject().has("error")) record[0].run();
            return out[0] != null ? out[0] : errorJson("create failed");

        } catch (Exception e) {
            LOG.warn("FsFileService.create failed", e);
            return mutationError(e);
        }
    }

    /**
     * Deletes the file at {@code filePath} (relative to {@code basePath}).
     *
     * <p>Optional keys in {@code req}:
     * <ul>
     *   <li>{@code safe} (default {@code false}) – return error if file does not exist.</li>
     * </ul>
     */
    public static String delete(Project project, int projectId, String basePath,
                                String filePath,
                                Map<String, String> req, boolean needRecord) {
        try {
            boolean safe = parseBooleanOrDefault(req.get("safe"), false);
            String absPath = FsDirService.resolveEntry(basePath, filePath);

            VirtualFile file = refreshAndFind(absPath);
            if (file == null) {
                if (safe) return errorJson("file not found: " + filePath);
                JsonObject resp = new JsonObject();
                resp.addProperty("status", "ok");
                resp.addProperty("message", "file not found, nothing to delete");
                resp.addProperty("path", filePath);
                return GSON.toJson(resp);
            }

            if (file.isDirectory()) return errorJson("path points to a directory, use /fs/dir/delete: " + filePath);

            final String resolvedRelPath = FsDirService.relativize(basePath, file.getPath());
            final String fileName        = file.getName();
            final String[] out           = new String[1];
            final Runnable[] record = new Runnable[1];

            WriteCommandAction.runWriteCommandAction(project, () -> {
                try {
                    FsDirService.resolveEntry(basePath, file.getPath());
                    String recoveryBackup = SafeVfsFiles.delete(file);

                    if (needRecord) {
                        var metadata = com.lusiad.backend.service.change.ChangeMetadata.paths("file_delete", FsDirService.relativize(basePath, absPath), null);
                        record[0] = () -> ChangeLogService.recordFilesystem(projectId, "file_delete", relativizeReq(basePath, req), metadata);
                    }

                    JsonObject resp = new JsonObject();
                    resp.addProperty("status", "ok");
                    resp.addProperty("message", "file deleted");
                    if (recoveryBackup != null) resp.addProperty("recoveryPath", recoveryBackup);
                    resp.addProperty("path", resolvedRelPath);
                    resp.addProperty("name", fileName);
                    out[0] = GSON.toJson(resp);
                } catch (IOException e) {
                    out[0] = errorJson(e.getMessage());
                }
            });

            refreshAndFind(absPath);
            if (record[0] != null && out[0] != null && !com.google.gson.JsonParser.parseString(out[0]).getAsJsonObject().has("error")) record[0].run();
            return out[0] != null ? out[0] : errorJson("delete failed");

        } catch (Exception e) {
            LOG.warn("FsFileService.delete failed", e);
            return mutationError(e);
        }
    }

    /**
     * Renames the file at {@code filePath} (relative to {@code basePath}) to {@code newName}.
     */
    public static String rename(Project project, int projectId, String basePath,
                                String filePath, String newName,
                                Map<String, String> req, boolean needRecord) {
        try {
            String absPath = FsDirService.resolveEntry(basePath, filePath);

            VirtualFile file = refreshAndFind(absPath);
            if (file == null)       return errorJson("file not found: " + filePath);
            if (file.isDirectory()) return errorJson("path points to a directory, use dir rename: " + filePath);

            ContainedPaths.name(newName);
            VirtualFile parent = file.getParent();
            if (parent != null) FsDirService.resolve(basePath, parent.getPath() + "/" + newName);
            if (newName.equals(file.getName())) return noOp(FsDirService.relativize(basePath, absPath), FsDirService.relativize(basePath, absPath), file.getName());
            if (parent != null && parent.findChild(newName) != null && !parent.findChild(newName).equals(file)) {
                return errorJson("a file named '" + newName + "' already exists in "
                        + FsDirService.relativize(basePath, parent.getPath()));
            }

            final String oldName = file.getName();
            final String[] out   = new String[1];
            final Runnable[] record = new Runnable[1];

            WriteCommandAction.runWriteCommandAction(project, () -> {
                try {
                    FsDirService.resolveEntry(basePath, file.getPath());
                    FsDirService.resolve(basePath, parent.getPath() + "/" + newName);
                    VirtualFile conflict = parent.findChild(newName);
                    if (conflict != null && !conflict.equals(file)) throw new IOException("file already exists: " + newName);
                    file.rename(FsFileService.class, newName);

                    if (needRecord) {
                        var metadata = com.lusiad.backend.service.change.ChangeMetadata.paths("file_rename", FsDirService.relativize(basePath, absPath), FsDirService.relativize(basePath, file.getPath()));
                        record[0] = () -> ChangeLogService.recordFilesystem(projectId, "file_rename", relativizeReq(basePath, req), metadata);
                    }

                    JsonObject resp = new JsonObject();
                    resp.addProperty("status", "ok");
                    resp.addProperty("message", "file renamed");
                    resp.addProperty("oldName", oldName);
                    resp.addProperty("newName", newName);
                    resp.addProperty("path", FsDirService.relativize(basePath, file.getPath()));
                    out[0] = GSON.toJson(resp);
                } catch (IOException e) {
                    out[0] = errorJson(e.getMessage());
                }
            });

            if (record[0] != null && out[0] != null && !com.google.gson.JsonParser.parseString(out[0]).getAsJsonObject().has("error")) record[0].run();
            return out[0] != null ? out[0] : errorJson("rename failed");

        } catch (Exception e) {
            LOG.warn("FsFileService.rename failed", e);
            return mutationError(e);
        }
    }

    /**
     * Moves the file at {@code sourcePath} into the directory at {@code destDirPath}
     * (both relative to {@code basePath}).
     *
     * <p>Optional keys in {@code req}:
     * <ul>
     *   <li>{@code overwrite} (default {@code false})</li>
     * </ul>
     */
    public static String move(Project project, int projectId, String basePath,
                              String sourcePath, String destDirPath,
                              Map<String, String> req, boolean needRecord) {
        try {
            boolean overwrite = parseBooleanOrDefault(req.get("overwrite"), false);
            String absSource  = FsDirService.resolveEntry(basePath, sourcePath);
            String absDest    = FsDirService.resolve(basePath, destDirPath);

            VirtualFile sourceFile = refreshAndFind(absSource);
            if (sourceFile == null)       return errorJson("source file not found: " + sourcePath);
            if (sourceFile.isDirectory()) return errorJson("source path is a directory, use /fs/dir/move: " + sourcePath);

            FsDirService.resolve(basePath, absDest + "/" + sourceFile.getName());
            VirtualFile destDir = refreshAndFind(absDest);
            if (destDir == null)        return errorJson("destination directory not found: " + destDirPath);
            if (destDir.equals(sourceFile) || destDir.equals(sourceFile.getParent()))
                return noOp(FsDirService.relativize(basePath, absSource), FsDirService.relativize(basePath, absSource), sourceFile.getName());
            if (!destDir.isDirectory()) return errorJson("destination is not a directory: " + destDirPath);

            VirtualFile existing = destDir.findChild(sourceFile.getName());
            if (existing != null && existing.isDirectory()) return errorJson("destination is a directory; replacement refused");
            if (existing != null && !overwrite) {
                return errorJson("'" + sourceFile.getName() + "' already exists in destination; set overwrite=true to replace it");
            }

            final String oldRelPath = FsDirService.relativize(basePath, sourceFile.getPath());
            final String fileName   = sourceFile.getName();
            final String[] out      = new String[1];
            final Runnable[] record = new Runnable[1];

            WriteCommandAction.runWriteCommandAction(project, () -> {
                try {
                    FsDirService.resolveEntry(basePath, sourceFile.getPath());
                    FsDirService.resolve(basePath, destDir.getPath() + "/" + sourceFile.getName());
                    String recoveryBackup = SafeVfsFiles.replaceMove(sourceFile, destDir, overwrite);

                    if (needRecord) {
                        var metadata = com.lusiad.backend.service.change.ChangeMetadata.paths("file_move", oldRelPath, FsDirService.relativize(basePath, sourceFile.getPath()));
                        record[0] = () -> ChangeLogService.recordFilesystem(projectId, "file_move", relativizeReq(basePath, req), metadata);
                    }

                    JsonObject resp = new JsonObject();
                    resp.addProperty("status", "ok");
                    resp.addProperty("message", "file moved");
                    if (recoveryBackup != null) resp.addProperty("recoveryPath", recoveryBackup);
                    resp.addProperty("name", fileName);
                    resp.addProperty("oldPath", oldRelPath);
                    resp.addProperty("newPath", FsDirService.relativize(basePath, sourceFile.getPath()));
                    out[0] = GSON.toJson(resp);
                } catch (IOException e) {
                    out[0] = errorJson(e.getMessage());
                }
            });

            if (record[0] != null && out[0] != null && !com.google.gson.JsonParser.parseString(out[0]).getAsJsonObject().has("error")) record[0].run();
            return out[0] != null ? out[0] : errorJson("move failed");

        } catch (Exception e) {
            LOG.warn("FsFileService.move failed", e);
            return mutationError(e);
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

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

    private static VirtualFile refreshAndFind(String path) {
        return LocalFileSystem.getInstance().refreshAndFindFileByPath(path);
    }

    static String noOp(String before, String after, String name) {
        JsonObject result = new JsonObject();
        result.addProperty("status", "ok");
        result.addProperty("noOp", true);
        result.addProperty("path", after);
        result.addProperty("oldPath", before);
        result.addProperty("newPath", after);
        result.addProperty("name", name);
        return GSON.toJson(result);
    }

    private static String mutationError(Exception failure) {
        if (!(failure instanceof ChangeLogService.RecordFailure)) return errorJson(failure.getMessage());
        JsonObject result = new JsonObject();
        result.addProperty("error", failure.getMessage());
        result.addProperty("code", "filesystem_record_pending");
        return GSON.toJson(result);
    }

    private static String errorJson(String message) {
        JsonObject obj = new JsonObject();
        obj.addProperty("error", message != null ? message : "unknown error");
        return GSON.toJson(obj);
    }

    private static boolean parseBooleanOrDefault(String v, boolean def) {
        if (v == null) return def;
        String s = v.trim();
        if (s.isEmpty()) return def;
        return "true".equalsIgnoreCase(s) || "1".equals(s);
    }
}
