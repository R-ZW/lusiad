package com.lusiad.backend.service.fs;

import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.wm.WindowManager;
import com.lusiad.LusiadBundle;

import javax.swing.*;
import java.awt.Dialog;
import java.awt.GraphicsEnvironment;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/** One explicit, read-only folder selection per server. No HTTP request waits for the user. */
public final class NativeDirectoryPicker implements AutoCloseable {
    private static final com.intellij.openapi.diagnostic.Logger LOG = com.intellij.openapi.diagnostic.Logger.getInstance(NativeDirectoryPicker.class);
    private Selection current;
    private boolean closed;
    private final java.util.LinkedHashSet<String> cancelled = new java.util.LinkedHashSet<>();

    private static final class Selection {
        final String id;
        String state = "pending", path;
        JDialog dialog;
        Timer expiry;
        Selection(String id) { this.id = id; }
    }

    public synchronized JsonObject request(Project project, String id, String operation, String initial, String language) {
        if (closed || project.isDisposed() || GraphicsEnvironment.isHeadless()) throw new IllegalStateException("Picker unavailable");
        if (operation.equals("cancel") && (current == null || !current.id.equals(id))) {
            rememberCancellation(id);
            var result = new Selection(id); result.state = "cancelled";
            return result(result);
        }
        if (operation.equals("start")) {
            if (cancelled.contains(id)) { var result = new Selection(id); result.state = "cancelled"; return result(result); }
            if (current != null && current.id.equals(id)) return result(current);
            if (current != null && current.state.equals("pending")) throw new IllegalArgumentException("directory_picker_busy");
            var selection = new Selection(id);
            current = selection;
            ApplicationManager.getApplication().invokeLater(() -> show(project, selection, initial, language));
        } else if (current == null || !current.id.equals(id)) {
            throw new IllegalArgumentException("directory_picker_expired");
        } else if (operation.equals("cancel")) {
            finish(current, "cancelled", null);
        }
        return result(current);
    }

    private synchronized JsonObject result(Selection selection) {
        var json = new JsonObject();
        json.addProperty("status", "ok"); json.addProperty("requestId", selection.id);
        json.addProperty("state", selection.state);
        if (selection.path != null) json.addProperty("path", selection.path);
        return json;
    }

    private void show(Project project, Selection selection, String initial, String language) {
        synchronized (this) {
            if (closed || current != selection || !selection.state.equals("pending")) return;
        }
        if (project.isDisposed()) { finish(selection, "cancelled", null); return; }
        try {
            Locale locale = Locale.forLanguageTag(language);
            String title = LusiadBundle.messageForLocale(locale, "directoryPicker.title");
            var chooser = new JFileChooser();
            chooser.setLocale(locale);
            chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
            chooser.setMultiSelectionEnabled(false);
            chooser.setAcceptAllFileFilterUsed(false);
            if (chooser.getUI() instanceof javax.swing.plaf.basic.BasicFileChooserUI ui) ui.getNewFolderAction().setEnabled(false);
            chooser.setApproveButtonText(LusiadBundle.messageForLocale(locale, "directoryPicker.select"));
            // The typed path is only a starting location, never authority to mutate a directory.
            try { if (initial != null && !initial.isBlank()) { var path = Path.of(initial); if (path.isAbsolute() && Files.isDirectory(path)) chooser.setCurrentDirectory(path.toFile()); } }
            catch (RuntimeException ignored) { /* Invalid input keeps the chooser's normal initial location. */ }
            var dialog = new JDialog(WindowManager.getInstance().getFrame(project), title, Dialog.ModalityType.MODELESS);
            dialog.setDefaultCloseOperation(WindowConstants.DO_NOTHING_ON_CLOSE);
            dialog.addWindowListener(new WindowAdapter() {
                @Override public void windowClosing(WindowEvent event) { finish(selection, "cancelled", null); }
            });
            chooser.addActionListener(event -> {
                if (JFileChooser.APPROVE_SELECTION.equals(event.getActionCommand())) {
                    try { finish(selection, "selected", selectedDirectory(chooser.getSelectedFile().toPath())); }
                    catch (Exception invalid) { finish(selection, "failed", null); }
                } else if (JFileChooser.CANCEL_SELECTION.equals(event.getActionCommand())) finish(selection, "cancelled", null);
            });
            dialog.setContentPane(chooser); dialog.pack(); dialog.setLocationRelativeTo(WindowManager.getInstance().getFrame(project));
            synchronized (this) {
                if (closed || !selection.state.equals("pending")) { dialog.dispose(); return; }
                selection.dialog = dialog;
                selection.expiry = new Timer(5 * 60 * 1000, event -> finish(selection, "cancelled", null));
                selection.expiry.setRepeats(false); selection.expiry.start();
            }
            dialog.setVisible(true); dialog.toFront();
        } catch (Exception unavailable) { LOG.warn("Folder chooser unavailable", unavailable); finish(selection, "failed", null); }
    }

    static String selectedDirectory(Path path) throws java.io.IOException {
        Path real = path.toRealPath();
        if (!real.isAbsolute() || !Files.isDirectory(real)) throw new java.io.IOException("Not a directory");
        return real.toString();
    }

    private synchronized void finish(Selection selection, String state, String path) {
        if (!selection.state.equals("pending")) return;
        selection.state = state; selection.path = path;
        if (state.equals("cancelled")) rememberCancellation(selection.id);
        ApplicationManager.getApplication().invokeLater(() -> {
            if (selection.expiry != null) selection.expiry.stop();
            if (selection.dialog != null) selection.dialog.dispose();
        });
    }

    private void rememberCancellation(String id) {
        cancelled.add(id);
        while (cancelled.size() > 32) cancelled.removeFirst(); // Only protect recently cancelled, queued requests.
    }

    @Override public synchronized void close() {
        closed = true;
        if (current != null) finish(current, "cancelled", null);
    }
}
