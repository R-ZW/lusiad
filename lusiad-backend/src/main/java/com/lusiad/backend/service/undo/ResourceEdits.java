package com.lusiad.backend.service.undo;

import com.google.gson.*;
import com.intellij.openapi.command.WriteCommandAction;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vfs.LocalFileSystem;
import com.lusiad.backend.repository.change.EditOperationStore;
import com.lusiad.backend.repository.sql.SqlConnectionFactory;
import com.lusiad.backend.service.change.*;
import com.lusiad.backend.service.fs.ContainedPaths;
import com.lusiad.backend.service.psi.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Resource plans use the existing durable edit coordinator, SQL lock and baseline transaction. */
public final class ResourceEdits {
    private ResourceEdits() {}
    public static EditOperationStore store(int projectId, String root) throws Exception {
        return new EditOperationStore(new SqlConnectionFactory(ChangeLogService.databaseConfiguration()), projectId, root);
    }
    public static EditCoordinator.Content read(String root, EditCoordinator.Plan plan) throws Exception {
        ResourceImage before = ResourceImage.decode(plan.before());
        var image = ResourceImage.capture(root, before.roots());
        return new EditCoordinator.Content(image.encode(), new byte[0]);
    }
    public static void apply(Project project, String root, EditCoordinator.Plan plan) throws Exception {
        ResourceImage before = ResourceImage.decode(plan.before()), after = ResourceImage.decode(plan.after());
        Set<String> affected = new TreeSet<>(before.entries().keySet()); affected.addAll(after.entries().keySet());
        for (String name : affected) {
            var file = LocalFileSystem.getInstance().findFileByPath(ContainedPaths.resolve(root, name, false));
            if (file != null) {
                var document = FileDocumentManager.getInstance().getCachedDocument(file);
                if (document != null && FileDocumentManager.getInstance().isDocumentUnsaved(document))
                    throw new EditCoordinator.Failure("revision_conflict", "Save or discard unsaved IntelliJ changes before editing in Lusiad", null, null);
            }
        }
        Exception[] error = {null};
        WriteCommandAction.runWriteCommandAction(project, () -> {
            try { ResourceImage.apply(root, before, after); }
            catch (Exception failure) { error[0] = failure; }
        });
        // Refresh outside the write command; also invalidates deleted/renamed cached VFS entries.
        LocalFileSystem.getInstance().refreshIoFiles(before.roots().stream().map(path -> Path.of(ContainedPaths.resolve(root, path, false)).getParent().toFile()).distinct().toList(), false, true, null);
        for (String name : affected) {
            var file = LocalFileSystem.getInstance().findFileByPath(ContainedPaths.resolve(root, name, false));
            if (file != null && FileDocumentManager.getInstance().getCachedDocument(file) != null) PsiService.refreshFileFromDisk(project, file.getPath());
        }
        if (error[0] != null) throw error[0];
    }
    public static EditCoordinator.Plan imagePlan(String root, String path, String type, Map<String,String> request,
                                                   ResourceImage before, ResourceImage after, JsonObject metadata, JsonObject response) {
        response.addProperty("resourceImage", true);
        response.add("changeMetadata", metadata);
        return new EditCoordinator.Plan(root, path, type, request, before.encode(), after.encode(), response);
    }
    public static String filesystem(Project project, int projectId, String root, String type, Map<String,String> request) {
        try (var store = store(projectId, root)) {
            EditCoordinator.Disk disk = PsiService.recordedDisk(project, root);
            EditCoordinator.recover(store, disk);
            var plan = filesystemPlan(root, type, request);
            if (plan == null) {
                var result = new JsonObject(); result.addProperty("status", "ok"); result.addProperty("noOp", true);
                String path = request.getOrDefault("sourcePath", request.getOrDefault("path", ""));
                result.addProperty("path", path); result.addProperty("oldPath", path); result.addProperty("newPath", path);
                result.addProperty("name", Path.of(path).getFileName().toString()); return result.toString();
            }
            if (ResourceImage.decode(plan.before()).size() + ResourceImage.decode(plan.after()).size() > ResourceImage.MAX_BYTES && !"true".equals(request.get("allowWithoutUndo"))) throw ResourceImage.capacity();
            return EditCoordinator.execute(store, disk, EditCoordinator.hash(plan.before()), () -> plan).toString();
        } catch (Exception failure) { return error(failure); }
    }
    static EditCoordinator.Plan filesystemPlan(String root, String type, Map<String,String> input) throws Exception {
        Map<String,String> req = new HashMap<>(input); req.put("_scope", type.startsWith("dir_") ? "project" : "dir");
        boolean directory = type.startsWith("dir_"); String action = type.substring(type.indexOf('_') + 1);
        String source = null, target = null;
        if (action.equals("create")) {
            String parent = ContainedPaths.relative(root, input.get("path"), true), name = input.get("name"); ContainedPaths.name(name);
            if (!Files.isDirectory(Path.of(ContainedPaths.resolve(root, parent, true)))) throw new IllegalArgumentException("Parent directory not found");
            target = parent.isEmpty() ? name : parent + "/" + name;
        } else {
            source = ContainedPaths.relative(root, input.get(action.equals("move") ? "sourcePath" : "path"), false);
            Path from = Path.of(ContainedPaths.resolve(root, source, false));
            if (!Files.exists(from)) {
                if (action.equals("delete") && !"true".equals(input.get("safe"))) return null;
                throw new IllegalArgumentException("Source not found");
            }
            if (Files.isDirectory(from) != directory) throw new IllegalArgumentException("Source kind differs from operation");
            if (action.equals("rename")) {
                String name = input.get("name"); ContainedPaths.name(name);
                target = (source.contains("/") ? source.substring(0, source.lastIndexOf('/') + 1) : "") + name;
                req.put("newName", name);
            } else if (action.equals("move")) {
                String parent = ContainedPaths.relative(root, input.get("destPath"), true);
                Path parentPath = Path.of(ContainedPaths.resolve(root, parent, true));
                if (!Files.isDirectory(parentPath)) throw new IllegalArgumentException("Destination directory not found");
                if (parentPath.equals(from)) return null;
                target = (parent.isEmpty() ? "" : parent + "/") + from.getFileName();
            }
            if (target != null && Path.of(ContainedPaths.resolve(root, target, false)).equals(from)) return null;
            if (directory && target != null && Path.of(ContainedPaths.resolve(root, target, false)).startsWith(from)) throw new IllegalArgumentException("Cannot move directory into itself");
        }
        if (target != null) {
            Path to = Path.of(ContainedPaths.resolve(root, target, false));
            if (Files.exists(to) && (!action.equals("move") || Files.isDirectory(to) != directory || !"true".equals(input.get("overwrite"))))
                throw new IllegalArgumentException((directory ? "directory" : "file") + " already exists: " + target);
        }
        List<String> paths = new ArrayList<>(); if (source != null) paths.add(source); if (target != null) paths.add(target);
        paths.sort(String::compareTo);
        ResourceImage before = ResourceImage.capture(root, paths); SortedMap<String, ResourceImage.Entry> entries = new TreeMap<>(before.entries());
        if (source != null) {
            if (action.equals("delete") && directory && !"true".equals(input.get("recursive")) && entries.size() > 1) throw new IllegalArgumentException("Directory is not empty");
            String from = source, to = target;
            entries.keySet().removeIf(name -> ResourceImage.within(name, from) || to != null && ResourceImage.within(name, to));
            if (target != null) for (var item : before.entries().entrySet()) if (ResourceImage.within(item.getKey(), source)) entries.put(target + item.getKey().substring(source.length()), item.getValue());
        } else entries.put(target, directory ? ResourceImage.Entry.directory() : ResourceImage.Entry.file(input.getOrDefault("content", "").getBytes(StandardCharsets.UTF_8)));
        ResourceImage after = new ResourceImage(paths, entries);
        JsonObject result = new JsonObject(); result.addProperty("status", "ok"); result.addProperty("message", "resource operation saved");
        result.addProperty("path", target == null ? source : target); result.addProperty("name", Path.of(target == null ? source : target).getFileName().toString());
        if (source != null && target != null) { result.addProperty("oldPath", source); result.addProperty("newPath", target); result.addProperty("oldName", Path.of(source).getFileName().toString()); result.addProperty("newName", Path.of(target).getFileName().toString()); }
        return imagePlan(root, target == null ? source : target, type, req, before, after, ChangeMetadata.paths(type, source, target), result);
    }
    public static String error(Exception failure) {
        com.intellij.openapi.diagnostic.Logger.getInstance(ResourceEdits.class).warn("Resource operation not confirmed", failure);
        JsonObject result = new JsonObject(); result.addProperty("error", failure.getMessage() == null ? "Resource operation unavailable" : failure.getMessage());
        result.addProperty("code", failure instanceof EditCoordinator.Failure f ? f.code : failure instanceof com.lusiad.backend.service.diagnostics.JavaAnalysisContext.Failure f ? f.code : failure instanceof SyntaxDiagnostics.Failure f ? f.code : failure instanceof IllegalArgumentException ? "invalid_request" : "operation_pending");
        if (failure instanceof EditCoordinator.Failure f && f.operationId != null) result.addProperty("operationId", f.operationId);
        return result.toString();
    }
    public static Map<String,String> projectHashes(String root) throws Exception {
        Map<String,String> result = new TreeMap<>();
        Set<String> ignored = Set.of(".git", ".idea", ".next", ".vscode", "node_modules", "build", "dist", "out", "target");
        Files.walkFileTree(Path.of(root), new java.nio.file.SimpleFileVisitor<>() {
            private String name(Path path) { return ContainedPaths.relative(root, ContainedPaths.resolve(root, path.toString(), true), true); }
            private boolean ignored(Path path) { String value = path.getFileName().toString(); return value.startsWith(".") || ignored.contains(value); }
            @Override public java.nio.file.FileVisitResult preVisitDirectory(Path path, java.nio.file.attribute.BasicFileAttributes attrs) {
                if (!path.equals(Path.of(root)) && ignored(path)) return java.nio.file.FileVisitResult.SKIP_SUBTREE;
                String name = name(path); if (!name.isEmpty()) result.put(name, "directory:" + digest(new byte[0])); return java.nio.file.FileVisitResult.CONTINUE;
            }
            @Override public java.nio.file.FileVisitResult visitFile(Path path, java.nio.file.attribute.BasicFileAttributes attrs) throws java.io.IOException {
                if (!ignored(path)) {
                    String name = name(path); if (!attrs.isRegularFile()) throw new java.io.IOException("Linked source is not authorized");
                    try (var stream = Files.newInputStream(path)) { var digest = java.security.MessageDigest.getInstance("SHA-256"); byte[] bytes = new byte[8192]; for (int length; (length = stream.read(bytes)) != -1;) digest.update(bytes, 0, length); result.put(name, "file:" + HexFormat.of().formatHex(digest.digest())); }
                    catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
                }
                return java.nio.file.FileVisitResult.CONTINUE;
            }
        }); return result;
    }
    private static String digest(byte[] bytes) { try { return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes)); } catch (Exception impossible) { throw new IllegalStateException(impossible); } }
}
