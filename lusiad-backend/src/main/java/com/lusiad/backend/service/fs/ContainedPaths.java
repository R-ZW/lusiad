package com.lusiad.backend.service.fs;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Map;

/** One path boundary for HTTP, services and historical replay. No VFS/SQL dependency. */
public final class ContainedPaths {
    private ContainedPaths() {}

    public static String clean(String value) {
        if (value == null || value.indexOf('\0') >= 0 || value.contains("\r") || value.contains("\n"))
            throw new IllegalArgumentException("invalid path");
        return value.replace('\\', '/');
    }

    private static Path absoluteRoot(String value) {
        String text = clean(value);
        if (text.startsWith("//?/") || text.startsWith("//./")) throw new IllegalArgumentException("device paths are not allowed");
        Path root = Path.of(text);
        if (!root.isAbsolute()) throw new IllegalArgumentException("authorized root must be absolute");
        rejectSegments(text.replaceFirst("^[A-Za-z]:", ""));
        return root.normalize();
    }

    private static void rejectSegments(String text) {
        for (String segment : text.split("/")) {
            if (segment.isEmpty() || segment.equals(".")) continue;
            name(segment);
        }
    }

    /** A name is a single component, never a path or a Windows alias/ADS. */
    public static void name(String value) {
        String text = clean(value);
        if (text.isBlank() || text.equals(".") || text.equals("..") || text.matches(".*[/:*?\"<>|].*")
                || text.endsWith(".") || text.endsWith(" ") || text.chars().anyMatch(c -> c < 32)
                || text.matches("(?i)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\\..*)?"))
            throw new IllegalArgumentException("invalid path component");
    }

    /** Lexical containment. Also used for legacy files that no longer exist on disk. */
    public static String relative(String base, String value, boolean allowRoot) {
        Path root = absoluteRoot(base);
        String text = clean(value);
        if (text.startsWith("//?/") || text.startsWith("//./") || text.matches("^[A-Za-z]:(?!/).*")
                || (text.startsWith("/") || text.matches("^[A-Za-z]:.*")) && !Path.of(text).isAbsolute())
            throw new IllegalArgumentException("ambiguous or device path");
        rejectSegments(text.replaceFirst("^[A-Za-z]:", ""));
        Path input = Path.of(text);
        Path target = (input.isAbsolute() ? input : root.resolve(input)).normalize();
        if (!target.startsWith(root)) throw new IllegalArgumentException("path must be inside the authorized root");
        String result = root.relativize(target).toString().replace('\\', '/');
        if (!allowRoot && result.isEmpty()) throw new IllegalArgumentException("path must not be the root");
        return result;
    }

    public static String resolve(String base, String value, boolean allowRoot) {
        Path root = absoluteRoot(base);
        String relative = relative(base, value, allowRoot);
        Path target = root.resolve(relative).normalize();
        checkPhysical(root, target);
        return target.toString().replace('\\', '/');
    }

    /** The registered root may itself be an alias. Descendant symlinks/junctions are refused. */
    private static void checkPhysical(Path root, Path target) {
        try {
            Path anchor = root;
            while (!Files.exists(anchor, LinkOption.NOFOLLOW_LINKS)) {
                if (anchor.getParent() == null) throw new IOException("authorized root has no existing ancestor");
                anchor = anchor.getParent();
            }
            Path physicalRoot = anchor.toRealPath().resolve(anchor.relativize(root));
            Path cursor = root;
            for (Path segment : root.relativize(target)) {
                if (segment.toString().isEmpty()) continue;
                cursor = cursor.resolve(segment);
                if (!Files.exists(cursor, LinkOption.NOFOLLOW_LINKS)) continue;
                BasicFileAttributes attributes = Files.readAttributes(cursor, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
                if (attributes.isSymbolicLink() || attributes.isOther()
                        || !cursor.toRealPath().equals(physicalRoot.resolve(root.relativize(cursor))))
                    throw new IOException("path crosses a symbolic link or junction");
            }
        } catch (IOException error) {
            throw new IllegalArgumentException("path cannot be authorized: " + error.getMessage(), error);
        }
    }

    /** Validate a whole tree before recursive VFS operations or snapshot copies. */
    public static void tree(String root) {
        Path base = absoluteRoot(root);
        try {
            if (!Files.exists(base, LinkOption.NOFOLLOW_LINKS)) return;
            Files.walkFileTree(base, new SimpleFileVisitor<>() {
                @Override public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                    resolve(root, dir.toString(), true);
                    return FileVisitResult.CONTINUE;
                }
                @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    resolve(root, file.toString(), false);
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException error) { throw new IllegalArgumentException("cannot authorize tree", error); }
    }

    /** Reject nested/aliased project and temporary roots before any snapshot write. */
    public static void separate(String project, String temporary) {
        Path live = physical(absoluteRoot(project)), temp = physical(absoluteRoot(temporary));
        if (live.startsWith(temp) || temp.startsWith(live))
            throw new IllegalArgumentException("project and snapshot roots must be separate");
    }

    private static Path physical(Path path) {
        try {
            Path ancestor = path;
            while (!Files.exists(ancestor, LinkOption.NOFOLLOW_LINKS)) ancestor = ancestor.getParent();
            return ancestor.toRealPath().resolve(ancestor.relativize(path));
        } catch (IOException error) { throw new IllegalArgumentException("cannot authorize root", error); }
    }

    public record ReadTarget(String root, String relative) {
        public String absolute() { return resolve(root, relative, false); }
        public String absolute(boolean allowRoot) { return resolve(root, relative, allowRoot); }
    }

    /** Only the two preview trees and dedicated comparison trees are readable as snapshots. */
    public static ReadTarget readable(String project, String temp, String value) {
        return readable(project, temp, value, false);
    }
    public static ReadTarget readable(String project, String temp, String value, boolean allowRoot) {
        separate(project, temp);
        try {
            String relative = relative(project, value, allowRoot);
            resolve(project, relative, allowRoot);
            return new ReadTarget(project, relative);
        } catch (IllegalArgumentException outsideProject) {
            if (!Path.of(clean(value)).isAbsolute()) throw outsideProject;
        }
        String relative = relative(temp, value, false);
        String[] parts = relative.split("/");
        int folder = 0;
        if (parts.length >= 3 && parts[0].equals("comparisons") && parts[1].matches("compare-[a-f0-9-]{36}")) folder = 2;
        if (parts.length < folder + 1 || (!allowRoot && parts.length == folder + 1) || !(parts[folder].equals("working-copy") || parts[folder].equals("working-copy-prev")))
            throw new IllegalArgumentException("path is not an authorized preview snapshot");
        // Check from temp too: a linked snapshot root must not become a new trusted anchor.
        resolve(temp, relative, false);
        String snapshot = Path.of(temp).resolve(String.join("/", java.util.Arrays.copyOfRange(parts, 0, folder + 1))).toString();
        return new ReadTarget(snapshot, String.join("/", java.util.Arrays.copyOfRange(parts, folder + 1, parts.length)));
    }

    /** Remap only demonstrably project-relative historical fields; never fall back to an absolute path. */
    public static void legacy(Map<String, String> request, String project) {
        for (String key : new String[]{"path", "sourcePath", "destPath"}) {
            if (request.containsKey(key)) request.put(key, relative(project, request.get(key), true));
        }
        if (request.containsKey("name")) name(request.get("name"));
    }
}
