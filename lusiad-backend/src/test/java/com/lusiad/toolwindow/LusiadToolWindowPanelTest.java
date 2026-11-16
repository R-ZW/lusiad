package com.lusiad.toolwindow;

import com.intellij.testFramework.fixtures.BasePlatformTestCase;

import javax.imageio.ImageIO;
import javax.swing.*;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class LusiadToolWindowPanelTest extends BasePlatformTestCase {
    public void testTabsPreserveDraftsAndKeepIdeLocaleIndependent() throws Exception {
        var preferences=LusiadPreferences.getInstance();var original=preferences.getState();Locale ideLocale=Locale.getDefault();
        String property=System.getProperty("lusiad.config.file");Path file=Files.createTempDirectory("lusiad-ui-test-").resolve("lusiad-settings.json");Files.writeString(file,"{\"version\":1}");System.setProperty("lusiad.config.file",file.toString());
        var settings=new LusiadPreferences.Settings();settings.language="pt-BR";preferences.loadState(settings);
        LusiadToolWindowPanel panel=new LusiadToolWindowPanel(getProject());
        try {
            var tabs=components(panel,JTabbedPane.class).stream().filter(tab->"lusiad.tabs".equals(tab.getName())).findFirst().orElseThrow();
            assertEquals(5,tabs.getTabCount());assertEquals("Execução",tabs.getTitleAt(0));assertEquals("Projetos",tabs.getTitleAt(1));
            JTextField url=components(panel,JTextField.class).stream().filter(field->"lusiad.frontend.url".equals(field.getName())).findFirst().orElseThrow();
            tabs.setSelectedIndex(2);url.setText("http://localhost:3001");tabs.setSelectedIndex(4);tabs.setSelectedIndex(2);
            assertEquals("http://localhost:3001",url.getText());assertEquals(ideLocale,Locale.getDefault());assertEquals(LusiadPreferences.DEFAULT_FRONTEND_URL,preferences.getState().frontendUrl);
            assertNativeLabels(panel);assertTrue(components(panel,JButton.class).stream().anyMatch(button->"lusiad.environment.editRun".equals(button.getName())));
            renderPreviewWhenRequested(panel,"plugin-tabs.png");
        } finally {panel.dispose();preferences.loadState(original);if(property==null)System.clearProperty("lusiad.config.file");else System.setProperty("lusiad.config.file",property);Files.deleteIfExists(file);Files.deleteIfExists(file.getParent());}
    }

    private static void assertNativeLabels(JPanel panel) {
        for (JTextField field : components(panel, JTextField.class)) {
            if (field.getName() == null || !field.getName().startsWith("lusiad.")) continue;
            assertNotNull(field.getAccessibleContext().getAccessibleName());
            assertTrue(components(panel, JLabel.class).stream().anyMatch(label -> label.getLabelFor() == field));
        }
        JComboBox<?> language = components(panel, JComboBox.class).getFirst();
        assertTrue(components(panel, JLabel.class).stream().anyMatch(label -> label.getLabelFor() == language));
        JComboBox<?> registered=components(panel,JComboBox.class).stream().filter(combo->"lusiad.projects.selection".equals(combo.getName())).findFirst().orElseThrow();
        assertTrue(components(panel,JLabel.class).stream().anyMatch(label->label.getLabelFor()==registered));
        for (JButton button : components(panel, JButton.class)) {
            if (button.getName() != null && button.getName().startsWith("toolwindow."))
                assertEquals(button.getText(), button.getAccessibleContext().getAccessibleName());
        }
    }
    public void testSelectionIsScopedToHostAndSeparateFromFrontendDirectory() {
        var preferences=new LusiadPreferences();
        preferences.getState().frontendDirectory="frontend";
        preferences.selectProject("host-a",14);preferences.selectProject("host-b",27);
        assertEquals(14,preferences.selectedProject("host-a"));assertEquals(27,preferences.selectedProject("host-b"));
        assertEquals("frontend",preferences.getState().frontendDirectory);
        preferences.selectProject("host-a",0);assertEquals(0,preferences.selectedProject("host-a"));
        assertEquals(27,preferences.selectedProject("host-b"));
    }

    private static <T> List<T> components(Container container, Class<T> type) {
        List<T> result = new ArrayList<>();
        for (Component child : container.getComponents()) {
            if (type.isInstance(child)) result.add(type.cast(child));
            if (child instanceof Container nested) result.addAll(components(nested, type));
        }
        return result;
    }

    private static void renderPreviewWhenRequested(JPanel panel, String name) throws Exception {
        String directory = System.getProperty("lusiad.preview.dir");
        if (directory == null) return;
        Files.createDirectories(Path.of(directory));
        panel.setSize(390, 1500);
        for (int pass = 0; pass < 5; pass++) layout(panel);
        BufferedImage image = new BufferedImage(panel.getWidth(), panel.getHeight(), BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = image.createGraphics();
        try { panel.printAll(graphics); }
        finally { graphics.dispose(); }
        ImageIO.write(image, "png", Path.of(directory, name).toFile());
    }

    private static void layout(Container container) {
        container.invalidate();
        container.doLayout();
        for (Component child : container.getComponents()) if (child instanceof Container nested) layout(nested);
    }
}
