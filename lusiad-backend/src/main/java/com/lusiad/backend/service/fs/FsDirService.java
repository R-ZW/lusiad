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

public class FsDirService {

    private static final Logger LOG = Logger.getInstance(FsDirService.class);
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    // -------------------------------------------------------------------------
    // Public API — all path parameters are ABSOLUTE (resolved by the caller)
    // -------------------------------------------------------------------------

    /**
     * Creates a new sub-directory named {@code name} inside {@code parentPath}.
     *
     * @param project     IntelliJ project context
     * @param projectId   database project id (used for change logging)
     * @param basePath    absolute project root (used to resolve relative paths)
     * @param parentPath  relative path of the parent directory (relative to {@code basePath})
     * @param name        name of the new directory
     * @param req         original request map (stored as-is in the change log)
     * @param needRecord  whether to persist a change-log entry
     */
    public static String create(Project project, int projectId, String basePath,
                                String parentPath, String name,
                                Map<String, String> req, boolean needRecord) {
        try {
            String absParent = resolve(basePath, parentPath);
            ContainedPaths.name(name);
            resolve(basePath, absParent + "/" + name);

            VirtualFile parent = refreshAndFind(absParent);
            if (parent == null)        return errorJson("parent directory not found: " + parentPath);
            if (!parent.isDirectory()) return errorJson("path is not a directory: " + parentPath);

            if (parent.findChild(name) != null) {
                return errorJson("directory already exists: " + parentPath + "/" + name);
            }

            final String[] out = new String[1];
            final Runnable[] record = new Runnable[1];

            WriteCommandAction.runWriteCommandAction(project, () -> {
                try {
                    resolve(basePath, absParent + "/" + name);
                    if (parent.findChild(name) != null) throw new IOException("directory already exists: " + name);
                    VirtualFile newDir = parent.createChildDirectory(FsDirService.class, name);

                    if (needRecord) {
                        var metadata = com.lusiad.backend.service.change.ChangeMetadata.paths("dir_create", null, relativize(basePath, newDir.getPath()));
                        record[0] = () -> ChangeLogService.recordFilesystem(projectId, "dir_create", relativizeReq(basePath, req), metadata);
                    }

                    JsonObject resp = new JsonObject();
                    resp.addProperty("status", "ok");
                    resp.addProperty("message", "directory created");
                    resp.addProperty("path", relativize(basePath, newDir.getPath()));
                    resp.addProperty("name", name);
                    out[0] = GSON.toJson(resp);
                } catch (IOException e) {
                    out[0] = errorJson(e.getMessage());
                }
            });

            if (record[0] != null && out[0] != null && !com.google.gson.JsonParser.parseString(out[0]).getAsJsonObject().has("error")) record[0].run();
            return out[0] != null ? out[0] : errorJson("dir create failed");

        } catch (Exception e) {
            LOG.warn("FsDirService.create failed", e);
            return mutationError(e);
        }
    }

    /**
     * Deletes the directory at {@code dirPath} (relative to {@code basePath}).
     *
     * <p>Optional keys in {@code req}:
     * <ul>
     *   <li>{@code recursive} (default {@code false}) – delete even when non-empty.</li>
     * </ul>
     */
    public static String delete(Project project, int projectId, String basePath,
                                String dirPath,
                                Map<String, String> req, boolean needRecord) {
        try {
            boolean recursive = parseBooleanOrDefault(req.get("recursive"), false);
            String absDirPath = resolveEntry(basePath, dirPath);
            ContainedPaths.tree(absDirPath);

            VirtualFile dir = refreshAndFind(absDirPath);
            if (dir == null)        return errorJson("directory not found: " + dirPath);
            if (!dir.isDirectory()) return errorJson("path is not a directory, use /fs/file/delete: " + dirPath);

            if (!recursive && dir.getChildren().length > 0) {
                return errorJson("directory is not empty; set recursive=true to delete it along with its contents");
            }

            final String resolvedRelPath = relativize(basePath, dir.getPath());
            final String dirName         = dir.getName();
            final String[] out           = new String[1];
            final Runnable[] record = new Runnable[1];

            WriteCommandAction.runWriteCommandAction(project, () -> {
                try {
                    resolveEntry(basePath, dir.getPath());
                    ContainedPaths.tree(dir.getPath());
                    if (!recursive && dir.getChildren().length > 0) throw new IOException("directory is not empty");
                    String recoveryBackup = SafeVfsFiles.delete(dir);

                    if (needRecord) {
                        var metadata = com.lusiad.backend.service.change.ChangeMetadata.paths("dir_delete", relativize(basePath, absDirPath), null);
                        record[0] = () -> ChangeLogService.recordFilesystem(projectId, "dir_delete", relativizeReq(basePath, req), metadata);
                    }

                    JsonObject resp = new JsonObject();
                    resp.addProperty("status", "ok");
                    resp.addProperty("message", "directory deleted");
                    if (recoveryBackup != null) resp.addProperty("recoveryPath", recoveryBackup);
                    resp.addProperty("path", resolvedRelPath);
                    resp.addProperty("name", dirName);
                    out[0] = GSON.toJson(resp);
                } catch (IOException e) {
                    out[0] = errorJson(e.getMessage());
                }
            });

            refreshAndFind(absDirPath);
            if (record[0] != null && out[0] != null && !com.google.gson.JsonParser.parseString(out[0]).getAsJsonObject().has("error")) record[0].run();
            return out[0] != null ? out[0] : errorJson("dir delete failed");

        } catch (Exception e) {
            LOG.warn("FsDirService.delete failed", e);
            return mutationError(e);
        }
    }

    /**
     * Renames the directory at {@code dirPath} (relative to {@code basePath}) to {@code newName}.
     */
    public static String rename(Project project, int projectId, String basePath,
                                String dirPath, String newName,
                                Map<String, String> req, boolean needRecord) {
        try {
            String absDirPath = resolveEntry(basePath, dirPath);
            ContainedPaths.tree(absDirPath);

            VirtualFile dir = refreshAndFind(absDirPath);
            if (dir == null)        return errorJson("directory not found: " + dirPath);
            if (!dir.isDirectory()) return errorJson("path is not a directory: " + dirPath);

            ContainedPaths.name(newName);
            VirtualFile parent = dir.getParent();
            if (parent != null) resolve(basePath, parent.getPath() + "/" + newName);
            if (newName.equals(dir.getName())) return FsFileService.noOp(relativize(basePath, absDirPath), relativize(basePath, absDirPath), dir.getName());
            if (parent != null && parent.findChild(newName) != null && !parent.findChild(newName).equals(dir)) {
                return errorJson("a directory named '" + newName + "' already exists in "
                        + relativize(basePath, parent.getPath()));
            }

            final String oldName = dir.getName();
            final String[] out   = new String[1];
            final Runnable[] record = new Runnable[1];

            WriteCommandAction.runWriteCommandAction(project, () -> {
                try {
                    resolveEntry(basePath, dir.getPath());
                    resolve(basePath, parent.getPath() + "/" + newName);
                    VirtualFile conflict = parent.findChild(newName);
                    if (conflict != null && !conflict.equals(dir)) throw new IOException("directory already exists: " + newName);
                    dir.rename(FsDirService.class, newName);

                    if (needRecord) {
                        var metadata = com.lusiad.backend.service.change.ChangeMetadata.paths("dir_rename", relativize(basePath, absDirPath), relativize(basePath, dir.getPath()));
                        record[0] = () -> ChangeLogService.recordFilesystem(projectId, "dir_rename", relativizeReq(basePath, req), metadata);
                    }

                    JsonObject resp = new JsonObject();
                    resp.addProperty("status", "ok");
                    resp.addProperty("message", "directory renamed");
                    resp.addProperty("oldName", oldName);
                    resp.addProperty("newName", newName);
                    resp.addProperty("path", relativize(basePath, dir.getPath()));
                    out[0] = GSON.toJson(resp);
                } catch (IOException e) {
                    out[0] = errorJson(e.getMessage());
                }
            });

            if (record[0] != null && out[0] != null && !com.google.gson.JsonParser.parseString(out[0]).getAsJsonObject().has("error")) record[0].run();
            return out[0] != null ? out[0] : errorJson("rename failed");

        } catch (Exception e) {
            LOG.warn("FsDirService.rename failed", e);
            return mutationError(e);
        }
    }

    /**
     * Moves the directory at {@code sourcePath} into {@code destParentPath}
     * (both relative to {@code basePath}).
     */
    public static String move(Project project, int projectId, String basePath,
                              String sourcePath, String destParentPath,
                              Map<String, String> req, boolean needRecord) {
        try {
            String absSource = resolveEntry(basePath, sourcePath);
            ContainedPaths.tree(absSource);
            String absDest   = resolve(basePath, destParentPath);

            VirtualFile sourceDir  = refreshAndFind(absSource);
            if (sourceDir == null)        return errorJson("source directory not found: " + sourcePath);
            if (!sourceDir.isDirectory()) return errorJson("source path is not a directory: " + sourcePath);

            resolve(basePath, absDest + "/" + sourceDir.getName());
            VirtualFile destParent = refreshAndFind(absDest);
            if (destParent == null)        return errorJson("destination directory not found: " + destParentPath);
            if (destParent.equals(sourceDir) || destParent.equals(sourceDir.getParent()))
                return FsFileService.noOp(relativize(basePath, absSource), relativize(basePath, absSource), sourceDir.getName());
            if (!destParent.isDirectory()) return errorJson("destination is not a directory: " + destParentPath);

            if (destParent.findChild(sourceDir.getName()) != null) {
                return errorJson("destination already contains a directory named '" + sourceDir.getName() + "'");
            }

            if (isAncestor(sourceDir, destParent)) {
                return errorJson("cannot move a directory into one of its own sub-directories");
            }

            final String oldRelPath = relativize(basePath, sourceDir.getPath());
            final String dirName    = sourceDir.getName();
            final String[] out      = new String[1];
            final Runnable[] record = new Runnable[1];

            WriteCommandAction.runWriteCommandAction(project, () -> {
                try {
                    resolveEntry(basePath, sourceDir.getPath());
                    resolve(basePath, destParent.getPath() + "/" + sourceDir.getName());
                    if (destParent.findChild(sourceDir.getName()) != null) throw new IOException("destination already exists");
                    if (isAncestor(sourceDir, destParent)) throw new IOException("cannot move directory into itself");
                    sourceDir.move(FsDirService.class, destParent);

                    if (needRecord) {
                        var metadata = com.lusiad.backend.service.change.ChangeMetadata.paths("dir_move", oldRelPath, relativize(basePath, sourceDir.getPath()));
                        record[0] = () -> ChangeLogService.recordFilesystem(projectId, "dir_move", relativizeReq(basePath, req), metadata);
                    }

                    JsonObject resp = new JsonObject();
                    resp.addProperty("status", "ok");
                    resp.addProperty("message", "directory moved");
                    resp.addProperty("name", dirName);
                    resp.addProperty("oldPath", oldRelPath);
                    resp.addProperty("newPath", relativize(basePath, sourceDir.getPath()));
                    out[0] = GSON.toJson(resp);
                } catch (IOException e) {
                    out[0] = errorJson(e.getMessage());
                }
            });

            if (record[0] != null && out[0] != null && !com.google.gson.JsonParser.parseString(out[0]).getAsJsonObject().has("error")) record[0].run();
            return out[0] != null ? out[0] : errorJson("dir move failed");

        } catch (Exception e) {
            LOG.warn("FsDirService.move failed", e);
            return mutationError(e);
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /** Resolve only within the caller's authorized project or snapshot root. */
    public static String resolve(String base, String path) {
        String result = ContainedPaths.resolve(base, path, true);
        com.lusiad.backend.config.RuntimeEnvironment.assertTree(result, false);
        return result;
    }

    public static String resolveEntry(String base, String path) {
        ContainedPaths.relative(base, path, false);
        return resolve(base, path);
    }

    public static String relativize(String base, String path) {
        return ContainedPaths.relative(base, path, true);
    }

    public static boolean isWithinBase(String base, String candidate) {
        try { ContainedPaths.relative(base, candidate, true); return true; }
        catch (IllegalArgumentException invalid) { return false; }
    }

    private static boolean isAncestor(VirtualFile ancestor, VirtualFile target) {
        VirtualFile current = target;
        while (current != null) {
            if (current.equals(ancestor)) return true;
            current = current.getParent();
        }
        return false;
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
                copy.put(key, relativize(basePath, val));
            }
        }
        return copy;
    }

    private static VirtualFile refreshAndFind(String path) {
        return LocalFileSystem.getInstance().refreshAndFindFileByPath(path);
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
