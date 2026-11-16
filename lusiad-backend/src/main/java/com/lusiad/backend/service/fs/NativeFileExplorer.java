package com.lusiad.backend.service.fs;

import java.awt.Desktop;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/** Opens a directory or reveals a file; never launches the selected file as a program. */
public final class NativeFileExplorer {
    private NativeFileExplorer() {}
    public static Path target(String root, String temporary, String input) throws IOException {
        Path path = Path.of(ContainedPaths.readable(root, temporary, input, true).absolute(true));
        if (!Files.isDirectory(path) && !Files.isRegularFile(path)) throw new IOException("Item is no longer available");
        return path;
    }
    public static String reveal(Path path) throws IOException {
        boolean directory = Files.isDirectory(path);
        if (System.getProperty("os.name", "").toLowerCase(Locale.ROOT).startsWith("windows")) {
            String system = System.getenv("SystemRoot");
            if (system == null) throw new IOException("Windows Explorer is unavailable");
            Path explorer = Path.of(system, "explorer.exe");
            if (!Files.isRegularFile(explorer)) throw new IOException("Windows Explorer is unavailable");
            if (directory) new ProcessBuilder(explorer.toString(), path.toString()).start();
            else new ProcessBuilder(explorer.toString(), "/select,", path.toString()).start();
            return directory ? "folder" : "selected";
        }
        if (!Desktop.isDesktopSupported()) throw new IOException("Desktop integration is unavailable");
        Desktop desktop = Desktop.getDesktop();
        if (!directory && desktop.isSupported(Desktop.Action.BROWSE_FILE_DIR)) {
            desktop.browseFileDirectory(path.toFile()); return "selected";
        }
        if (!desktop.isSupported(Desktop.Action.OPEN)) throw new IOException("Desktop integration is unavailable");
        desktop.open((directory ? path : path.getParent()).toFile());
        return directory ? "folder" : "parent";
    }
}
