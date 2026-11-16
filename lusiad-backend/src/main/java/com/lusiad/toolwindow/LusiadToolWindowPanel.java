package com.lusiad.toolwindow;

import com.intellij.ide.BrowserUtil;
import com.intellij.openapi.Disposable;
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory;
import com.intellij.openapi.fileChooser.FileChooserFactory;
import com.intellij.openapi.ide.CopyPasteManager;
import com.intellij.openapi.project.Project;
import com.intellij.ui.JBColor;
import com.intellij.ui.components.JBLabel;
import com.intellij.ui.components.JBScrollPane;
import com.intellij.util.ui.JBUI;
import com.intellij.util.ui.UIUtil;
import com.lusiad.LusiadBundle;

import javax.swing.*;
import java.awt.*;
import java.awt.datatransfer.StringSelection;
import java.awt.event.HierarchyEvent;
import java.awt.event.ComponentAdapter;
import java.awt.event.ComponentEvent;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.util.Locale;

public final class LusiadToolWindowPanel extends JPanel implements Disposable {
    private final Project project;
    private final LusiadPluginService service;
    private final LusiadPreferences preferences;
    private final Timer timer;
    private boolean disposed;
    private long lastRefresh;
    private long lastPreferencesRefresh;
    private JTabbedPane tabs;
    private SharedUiSettingsPanel sharedUi;
    private EnvironmentSettingsPanel environmentEditor;
    private JTextArea hostProjectMessage;
    private String noticeKey;
    private Locale locale;
    private JLabel apiStatus, databaseStatus, frontendStatus;
    private JTextArea apiMessage, databaseMessage, frontendMessage, notice;
    private JLabel databaseChecked, frontendChecked;
    private JButton start, checkDatabase, checkFrontend, openBrowser, copyCommand;
    private JTextField urlField, directoryField;
    private JComboBox<LusiadPluginService.RegisteredProject> registeredProjects;
    private JTextArea registeredProjectMessage;
    private long projectsGeneration;
    private boolean loadingProjects;

    public LusiadToolWindowPanel(Project project) {
        super(new BorderLayout());
        this.project = project;
        this.service = project.getService(LusiadPluginService.class);
        this.preferences = LusiadPreferences.getInstance();
        setName("lusiad.toolwindow");
        rebuild();
        timer = new Timer(500, event -> {
            if (disposed || !isShowing()) return;
            updateStatuses();
            if (System.currentTimeMillis()-lastPreferencesRefresh>=2000) {
                lastPreferencesRefresh=System.currentTimeMillis();
                if(!preferences.locale().equals(locale) && (sharedUi==null || !sharedUi.dirty()) && (environmentEditor==null || !environmentEditor.dirty())) rebuild();
                else if(sharedUi!=null) sharedUi.refresh();
            }
            if (System.currentTimeMillis() - lastRefresh >= 20000) refreshChecks();
        });
        addHierarchyListener(event -> {
            if ((event.getChangeFlags() & HierarchyEvent.SHOWING_CHANGED) == 0 || disposed) return;
            if (isShowing()) {
                timer.start();
                refreshChecks();
            } else {
                timer.stop();
            }
        });
    }

    private String message(String key, Object... arguments) {
        return LusiadBundle.messageForLocale(locale, key, arguments);
    }

    private void rebuild() {
        String draftUrl = urlField == null ? preferences.frontendUrl() : urlField.getText();
        String draftDirectory = directoryField == null ? preferences.frontendDirectory() : directoryField.getText();
        int selectedTab=tabs==null?0:tabs.getSelectedIndex();
        if(sharedUi!=null)sharedUi.disposePanel();
        if(environmentEditor!=null)environmentEditor.disposePanel();
        locale = preferences.locale();
        removeAll();
        JPanel body = new ScrollableBody();
        body.setLayout(new BoxLayout(body, BoxLayout.Y_AXIS));
        body.setBorder(JBUI.Borders.empty(12));

        JPanel projectsBody=tabBody(), settingsBody=tabBody(), tutorialsBody=tabBody();
        JLabel heading = new JBLabel("Lusiad");
        heading.setFont(heading.getFont().deriveFont(Font.BOLD, heading.getFont().getSize2D() + JBUI.scale(2)));
        body.add(heading);
        if (com.lusiad.backend.config.RuntimeEnvironment.testMode()) {
            body.add(text(message("toolwindow.environment.test", com.lusiad.backend.config.RuntimeEnvironment.loadTest().runId())));
        }
        body.add(Box.createVerticalStrut(4));
        body.add(text(message("toolwindow.project", project.getName())));
        body.add(Box.createVerticalStrut(12));
        JPanel api = card(body, "toolwindow.server.title");
        apiStatus = statusLabel(api);
        apiStatus.setName("lusiad.api.status");
        api.add(text(service.apiEndpoint()));
        api.add(text(message("toolwindow.server.help")));
        api.add(gap());
        start = button("toolwindow.server.start", () -> {
            if (service.apiState() == LusiadPluginService.ApiState.RUNNING) service.stopApi();
            else service.startApi();
        });
        api.add(buttons(start));
        apiMessage = text("");
        api.add(apiMessage);

        JPanel database = card(body, "toolwindow.database.title");
        databaseStatus = statusLabel(database);
        databaseStatus.setName("lusiad.database.status");
        String endpoint = service.databaseEndpoint();
        database.add(text(endpoint.isEmpty() ? message("toolwindow.database.error.configuration") : endpoint));
        databaseChecked = secondaryLabel(database);
        database.add(text(message("toolwindow.database.help")));
        database.add(gap());
        checkDatabase = button("toolwindow.database.check", service::checkDatabase);
        database.add(buttons(checkDatabase));
        databaseMessage = text("");
        database.add(databaseMessage);

        JPanel registered=card(projectsBody,"toolwindow.tabs.projects");
        hostProjectMessage=text("");hostProjectMessage.setVisible(false);registered.add(hostProjectMessage);
        JLabel registeredLabel=new JBLabel(message("toolwindow.lusiadProjects.select"));
        registered.add(registeredLabel);
        registeredProjects=new JComboBox<>();registeredProjects.setName("lusiad.projects.selection");
        // Fill the card horizontally, while retaining the native control height.
        int selectionHeight=registeredProjects.getPreferredSize().height;
        registeredProjects.setMinimumSize(new Dimension(0,selectionHeight));
        registeredProjects.setMaximumSize(new Dimension(Integer.MAX_VALUE,selectionHeight));
        registeredLabel.setLabelFor(registeredProjects);
        registeredProjects.getAccessibleContext().setAccessibleName(message("toolwindow.lusiadProjects.select"));
        registeredProjects.setRenderer(new DefaultListCellRenderer(){
            @Override public Component getListCellRendererComponent(JList<?> list,Object value,int index,boolean selected,boolean focus){
                var result=super.getListCellRendererComponent(list,value,index,selected,focus);
                if(value instanceof LusiadPluginService.RegisteredProject item)setText(item.id()==0?message("toolwindow.lusiadProjects.none"):item.name()+"  "+(ProjectPresence.ideOpen(item.path())?"[IDE] ":"")+(ProjectPresence.webOpen(item.id())?"[Lusiad]":""));
                return result;
            }
        });
        registeredProjects.addActionListener(event->{
            if(loadingProjects)return;
            var selected=(LusiadPluginService.RegisteredProject)registeredProjects.getSelectedItem();
            preferences.selectProject(hostKey(),selected==null?0:selected.id());
            registeredProjectMessage.setText(selected==null?"":projectDescription(selected));
        });
        registered.add(registeredProjects);
        registered.add(buttons(button("toolwindow.lusiadProjects.refresh",()->loadRegisteredProjects(false))));
        registered.add(buttons(button("toolwindow.projects.openIde",this::openSelectedIde)));
        registered.add(buttons(button("toolwindow.frontend.open",()->loadRegisteredProjects(true))));
        registeredProjectMessage=text("");registered.add(registeredProjectMessage);

        JPanel frontend = card(body, "toolwindow.frontend.title");
        frontendStatus = statusLabel(frontend);
        frontendStatus.setName("lusiad.frontend.status");
        frontendChecked = secondaryLabel(frontend);
        checkFrontend = button("toolwindow.frontend.check", () -> service.checkFrontend(preferences.frontendUrl()));
        openBrowser = button("toolwindow.frontend.open", () -> {
            if(preferences.selectedProject(hostKey())==0)BrowserUtil.browse(preferences.frontendUrl());
            else loadRegisteredProjects(true);
        });
        openBrowser.setToolTipText(message("toolwindow.frontend.open.help"));
        // Separate rows keep buttons usable in a narrow IntelliJ side panel.
        frontend.add(buttons(openBrowser));
        frontend.add(buttons(checkFrontend));
        frontendMessage = text("");
        frontend.add(frontendMessage);
        JPanel frontendSettings=card(settingsBody,"toolwindow.frontend.title");
        JLabel urlLabel = new JBLabel(message("toolwindow.frontend.url"));
        frontendSettings.add(urlLabel);
        urlField = new JTextField(draftUrl == null ? LusiadPreferences.DEFAULT_FRONTEND_URL : draftUrl);
        urlField.setName("lusiad.frontend.url");
        urlLabel.setLabelFor(urlField);
        urlField.getAccessibleContext().setAccessibleName(message("toolwindow.frontend.url"));
        urlField.setToolTipText(message("toolwindow.frontend.url.help"));
        urlField.setEditable(!com.lusiad.backend.config.RuntimeEnvironment.testMode()
                && !com.lusiad.backend.config.OperationalSettings.load().overridden("LUSIAD_FRONTEND_URL"));
        frontendSettings.add(fieldRow(urlField, null));
        frontendSettings.add(gap());
        JLabel directoryLabel = new JBLabel(message("toolwindow.frontend.directory"));
        frontendSettings.add(directoryLabel);
        directoryField = new JTextField(draftDirectory == null ? "" : draftDirectory);
        directoryField.setName("lusiad.frontend.directory");
        directoryLabel.setLabelFor(directoryField);
        directoryField.getAccessibleContext().setAccessibleName(message("toolwindow.frontend.directory"));
        JButton browse = button("toolwindow.frontend.browse", this::chooseDirectory);
        frontendSettings.add(fieldRow(directoryField, browse));
        frontendSettings.add(buttons(button("toolwindow.preferences.save", this::saveSettings)));
        notice = text("");
        frontendSettings.add(notice);
        frontendSettings.add(gap());
        JPanel common=card(settingsBody,"toolwindow.shared.title");
        sharedUi=new SharedUiSettingsPanel(locale,this::rebuild);common.add(sharedUi);
        JPanel tutorial=card(tutorialsBody,"toolwindow.tabs.tutorials");
        tutorial.add(text(message("toolwindow.frontend.instructions")));
        JTextArea commands = text("npm install\nnpm run build\nnpm run start");
        if (com.lusiad.backend.config.RuntimeEnvironment.testMode()) commands.setText(message("toolwindow.environment.launcher"));
        commands.setFont(new Font(Font.MONOSPACED, Font.PLAIN, commands.getFont().getSize()));
        tutorial.add(commands);
        tutorial.add(text(message("toolwindow.frontend.install.help")));
        copyCommand = button("toolwindow.frontend.copy", this::copyStartCommand);
        copyCommand.setToolTipText(message("toolwindow.frontend.copy.help"));
        tutorial.add(buttons(copyCommand));

        body.add(text(message("toolwindow.monitor.help")));
        body.add(Box.createVerticalGlue());
        tabs=new JTabbedPane(); tabs.setName("lusiad.tabs"); tabs.setTabLayoutPolicy(JTabbedPane.SCROLL_TAB_LAYOUT);
        tabs.addTab(message("toolwindow.tabs.running"),scroll(body));
        tabs.addTab(message("toolwindow.tabs.projects"),scroll(projectsBody));
        tabs.addTab(message("toolwindow.tabs.settings"),scroll(settingsBody));
        environmentEditor=new EnvironmentSettingsPanel(locale);tabs.addTab(message("toolwindow.tabs.environment"),scroll(environmentEditor));
        tabs.addTab(message("toolwindow.tabs.tutorials"),scroll(tutorialsBody));
        tabs.setSelectedIndex(Math.max(0,Math.min(selectedTab,tabs.getTabCount()-1)));
        add(tabs,BorderLayout.CENTER);
        updateStatuses();
        revalidate();
        repaint();
        if(isShowing())loadRegisteredProjects(false);
    }

    private JPanel tabBody(){JPanel body=new ScrollableBody();body.setLayout(new BoxLayout(body,BoxLayout.Y_AXIS));body.setBorder(JBUI.Borders.empty(12));return body;}
    private JBScrollPane scroll(JPanel body){
        var scroll=new JBScrollPane(body);scroll.setBorder(JBUI.Borders.empty());scroll.setHorizontalScrollBarPolicy(ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER);scroll.getVerticalScrollBar().setUnitIncrement(JBUI.scale(16));
        scroll.getViewport().addComponentListener(new ComponentAdapter(){public void componentResized(ComponentEvent e){invalidateLayout(body);body.revalidate();}});return scroll;
    }
    private String projectDescription(LusiadPluginService.RegisteredProject item){
        if(item.id()==0)return message("toolwindow.lusiadProjects.none");
        return item.path()+"\n"+(!Files.isDirectory(Path.of(item.path()))?message("toolwindow.projects.diskMissing"):
            (ProjectPresence.ideOpen(item.path())?"● IDE":"○ IDE")+"   "+(ProjectPresence.webOpen(item.id())?"● Lusiad":"○ Lusiad"));
    }
    private void openSelectedIde(){
        var selected=(LusiadPluginService.RegisteredProject)registeredProjects.getSelectedItem();
        if(selected==null||selected.id()==0)return;
        int id=selected.id();
        service.listRegisteredProjects(items->{
            if(disposed)return;
            var fresh=items.stream().filter(item->item.id()==id).findFirst();
            if(fresh.isEmpty()){registeredProjectMessage.setText(message("toolwindow.lusiadProjects.missing"));return;}
            Path path=Path.of(fresh.get().path());
            if(!Files.isDirectory(path)){registeredProjectMessage.setText(message("toolwindow.projects.diskMissing"));return;}
            com.intellij.openapi.application.ApplicationManager.getApplication().invokeLater(()->{
                if(disposed||project.isDisposed())return;
                try{
                    for(var existing:com.intellij.openapi.project.ProjectManager.getInstance().getOpenProjects())if(!existing.isDisposed()&&existing.getBasePath()!=null&&ProjectPresence.key(existing.getBasePath()).equals(ProjectPresence.key(path.toString()))){com.intellij.ide.impl.ProjectUtil.focusProjectWindow(existing,true);return;}
                    com.intellij.ide.impl.ProjectUtil.openOrImport(path,com.intellij.ide.impl.OpenProjectTask.build().withForceOpenInNewFrame(true));}
                catch(Exception e){registeredProjectMessage.setText(message("toolwindow.projects.openFailed"));}
            });
        },()->registeredProjectMessage.setText(message("toolwindow.lusiadProjects.failed")));
    }

    private void chooseDirectory() {
        var descriptor = FileChooserDescriptorFactory.createSingleFolderDescriptor();
        descriptor.setTitle(message("toolwindow.frontend.directory"));
        var folder = FileChooserFactory.getInstance().createFileChooser(descriptor, project, this).choose(project);
        if (folder.length > 0) directoryField.setText(folder[0].getPath());
    }
    private String hostKey(){return java.util.Objects.toString(project.getBasePath(),project.getName());}
    private void loadRegisteredProjects(boolean open) {
        long generation=++projectsGeneration; int requested=preferences.selectedProject(hostKey());
        registeredProjectMessage.setText(message("toolwindow.lusiadProjects.loading"));
        service.listRegisteredProjects(items->{
            if(disposed || generation!=projectsGeneration)return;
            loadingProjects=true;
            registeredProjects.removeAllItems();
            var none=new LusiadPluginService.RegisteredProject(0,"","");registeredProjects.addItem(none);
            LusiadPluginService.RegisteredProject found=none;
            for(var item:items){registeredProjects.addItem(item);if(item.id()==requested)found=item;}
            registeredProjects.setSelectedItem(found);loadingProjects=false;
            preferences.selectProject(hostKey(),found.id());
            registeredProjectMessage.setText(requested!=0 && found.id()==0?message("toolwindow.lusiadProjects.missing"):projectDescription(found));
            boolean registeredHost=items.stream().anyMatch(item->ProjectPresence.key(item.path()).equals(ProjectPresence.key(hostKey())));
            setMessage(hostProjectMessage,!Files.isDirectory(Path.of(hostKey()))?message("toolwindow.projects.diskMissing"):registeredHost?"":message("toolwindow.projects.hostMissing"));
            if(open && (requested==0 || found.id()!=0))BrowserUtil.browse(preferences.frontendUrl().replaceAll("/$","")+(found.id()==0?"":"/project/"+found.id()));
        },()->{if(!disposed && generation==projectsGeneration)registeredProjectMessage.setText(message("toolwindow.lusiadProjects.error"));});
    }

    private void saveSettings() {
        String url;
        try {
            url = com.lusiad.backend.config.OperationalSettings.origin(urlField.getText().trim(),"frontendUrl").toASCIIString();
            if (com.lusiad.backend.config.RuntimeEnvironment.testMode() &&
                !url.replaceAll("/$", "").equals(com.lusiad.backend.config.RuntimeEnvironment.frontendUrl(url))) {
                noticeKey = "toolwindow.environment.urlMismatch";
                updateStatuses();
                return;
            }
        } catch (IllegalArgumentException failure) {
            noticeKey = "toolwindow.frontend.error.url";
            updateStatuses();
            return;
        }
        String directory = directoryField.getText().trim();
        try {
            if (!directory.isEmpty() && (!Files.isDirectory(Path.of(directory))
                    || !Files.isRegularFile(Path.of(directory).resolve("package.json")))) {
                noticeKey = "toolwindow.frontend.error.directory";
                updateStatuses();
                return;
            }
            if (!directory.isEmpty()) FrontendSettings.startCommand(directory, isWindows());
        } catch (InvalidPathException failure) {
            noticeKey = "toolwindow.frontend.error.directory";
            updateStatuses();
            return;
        } catch (IllegalArgumentException failure) {
            noticeKey = "toolwindow.frontend.error.directory";
            updateStatuses();
            return;
        }
        try {
            com.lusiad.backend.config.SharedConfiguration.update(com.lusiad.backend.config.SharedConfiguration.file(),null,root->{
                root.addProperty("frontendUrl",url);
                var plugin=root.has("plugin")?root.getAsJsonObject("plugin"):new com.google.gson.JsonObject();
                plugin.addProperty("frontendDirectory",directory);root.add("plugin",plugin);
            });
        } catch(Exception failure){noticeKey="toolwindow.shared.error";updateStatuses();return;}
        preferences.getState().frontendUrl = url;
        preferences.getState().frontendDirectory = directory;
        urlField.setText(url);
        noticeKey = "toolwindow.environment.saved";
        service.checkFrontend(url);
        updateStatuses();
    }

    private void copyStartCommand() {
        String directory = preferences.frontendDirectory();
        try {
            var test = com.lusiad.backend.config.RuntimeEnvironment.loadTest();
            String command;
            if (test != null) {
                String configPath = test.root().resolve("environment.json").toString().replace("'", "''");
                Path launcher = test.root().getParent().getParent().resolve("tools/environment.py");
                if (!Files.isRegularFile(launcher)) throw new IllegalArgumentException("Test launcher not found");
                command = "python '" + launcher.toString().replace("'", "''") + "' frontend --config '" + configPath + "'";
            } else command = FrontendSettings.startCommand(directory, isWindows());
            CopyPasteManager.getInstance().setContents(new StringSelection(command));
            noticeKey = "toolwindow.frontend.copied";
        } catch (IllegalArgumentException failure) {
            noticeKey = "toolwindow.frontend.error.directory";
        }
        updateStatuses();
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).startsWith("windows");
    }

    private void refreshChecks() {
        if (project.isDisposed()) return;
        lastRefresh = System.currentTimeMillis();
        service.checkDatabase();
        service.checkFrontend(preferences.frontendUrl());
        loadRegisteredProjects(false);
        updateStatuses();
    }

    private void updateStatuses() {
        var api = service.apiState();
        apiStatus.putClientProperty("lusiad.state", api.name());
        apiStatus.setText("●  " + message("toolwindow.server.state." + api.name().toLowerCase(Locale.ROOT)));
        apiStatus.getAccessibleContext().setAccessibleName(apiStatus.getText());
        apiStatus.setForeground(api == LusiadPluginService.ApiState.RUNNING ? successColor()
                : api == LusiadPluginService.ApiState.ERROR ? errorColor()
                : api == LusiadPluginService.ApiState.STARTING || api == LusiadPluginService.ApiState.STOPPING ? pendingColor() : mutedColor());
        start.setText(message(api == LusiadPluginService.ApiState.RUNNING || api == LusiadPluginService.ApiState.STOPPING
                ? "toolwindow.server.stop" : "toolwindow.server.start"));
        start.getAccessibleContext().setAccessibleName(start.getText());
        start.setToolTipText(start.getText());
        start.setEnabled(api != LusiadPluginService.ApiState.STARTING && api != LusiadPluginService.ApiState.STOPPING);
        setMessage(apiMessage, service.apiErrorKey() == null ? "" : message(service.apiErrorKey(),
                String.valueOf(com.lusiad.backend.config.RuntimeEnvironment.apiPort())));

        var database = service.database();
        showCheck(databaseStatus, database, "toolwindow.database.state.");
        databaseChecked.setText(checkedAt(database.checkedAt()));
        checkDatabase.setEnabled(database.state() != LusiadPluginService.CheckState.CHECKING);
        setMessage(databaseMessage, checkError(database));

        var frontend = service.frontend();
        showCheck(frontendStatus, frontend, "toolwindow.frontend.state.");
        frontendChecked.setText(checkedAt(frontend.checkedAt()));
        frontendStatus.setToolTipText(frontend.endpoint());
        checkFrontend.setEnabled(frontend.state() != LusiadPluginService.CheckState.CHECKING);
        setMessage(frontendMessage, checkError(frontend));
        boolean validUrl;
        try { FrontendSettings.parseUrl(preferences.frontendUrl()); validUrl = true; }
        catch (IllegalArgumentException failure) { validUrl = false; }
        openBrowser.setEnabled(validUrl);
        String directory = preferences.frontendDirectory();
        copyCommand.setEnabled(com.lusiad.backend.config.RuntimeEnvironment.testMode() || directory != null && !directory.isBlank());
        setMessage(notice, noticeKey == null ? "" : message(noticeKey));
        notice.setForeground(noticeKey != null && noticeKey.contains("error") ? errorColor() : successColor());
    }

    private String checkError(LusiadPluginService.Check check) {
        return check.errorKey() == null ? "" : message(check.errorKey())
                + (check.detail().isEmpty() ? "" : "\n" + check.detail());
    }

    private String checkedAt(Instant instant) {
        return instant == null ? message("toolwindow.check.never") : message("toolwindow.check.time",
                DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT).withLocale(locale)
                        .withZone(ZoneId.systemDefault()).format(instant));
    }

    private void showCheck(JLabel label, LusiadPluginService.Check check, String prefix) {
        label.putClientProperty("lusiad.state", check.state().name());
        label.setText("●  " + message(prefix + check.state().name().toLowerCase(Locale.ROOT)));
        label.getAccessibleContext().setAccessibleName(label.getText());
        label.setForeground(switch (check.state()) {
            case OK -> successColor();
            case ERROR -> errorColor();
            case CHECKING -> pendingColor();
            case UNKNOWN -> mutedColor();
        });
    }

    private static Color successColor() { return JBColor.namedColor("Label.successForeground", new JBColor(new Color(0x19734B), new Color(0x70C895))); }
    private static Color errorColor() { return JBColor.namedColor("Label.errorForeground", new JBColor(new Color(0xB52B38), new Color(0xF28B91))); }
    private static Color pendingColor() { return JBColor.namedColor("Label.warningForeground", new JBColor(new Color(0x906900), new Color(0xD9B967))); }
    private static Color mutedColor() { return UIUtil.getContextHelpForeground(); }

    private static JPanel verticalPanel() {
        JPanel panel = new JPanel() {
            @Override protected void addImpl(Component component, Object constraints, int index) {
                // Mixed default alignments in BoxLayout shift labels/buttons when
                // a full-width combo is present. Every card uses the same edge.
                if (component instanceof JComponent child) child.setAlignmentX(Component.LEFT_ALIGNMENT);
                super.addImpl(component, constraints, index);
            }
            @Override public Dimension getMaximumSize() {
                return new Dimension(Integer.MAX_VALUE, getPreferredSize().height);
            }
        };
        panel.setLayout(new BoxLayout(panel, BoxLayout.Y_AXIS));
        panel.setAlignmentX(Component.LEFT_ALIGNMENT);
        return panel;
    }

    private JPanel card(JPanel body, String titleKey) {
        JPanel card = verticalPanel();
        card.setBorder(BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(JBColor.namedColor("Component.borderColor", new JBColor(new Color(0xDADDE2), new Color(0x4A4D54)))),
                JBUI.Borders.empty(12)));
        JLabel title = new JBLabel(message(titleKey));
        title.setFont(title.getFont().deriveFont(Font.BOLD));
        title.setLabelFor(card);
        card.getAccessibleContext().setAccessibleName(message(titleKey));
        card.add(title);
        card.add(gap());
        body.add(card);
        body.add(Box.createVerticalStrut(12));
        return card;
    }

    private static JLabel statusLabel(JPanel parent) {
        JLabel label = new JBLabel();
        label.setFont(label.getFont().deriveFont(Font.BOLD));
        parent.add(label);
        parent.add(Box.createVerticalStrut(4));
        return label;
    }

    private static JLabel secondaryLabel(JPanel parent) {
        JLabel label = new JBLabel();
        label.setForeground(mutedColor());
        parent.add(label);
        parent.add(Box.createVerticalStrut(6));
        return label;
    }

    private static Component gap() { return Box.createVerticalStrut(8); }

    private static JPanel row() {
        JPanel row = new JPanel(new FlowLayout(FlowLayout.LEADING, 0, JBUI.scale(4)));
        row.setAlignmentX(Component.LEFT_ALIGNMENT);
        row.setMaximumSize(new Dimension(Integer.MAX_VALUE, JBUI.scale(40)));
        return row;
    }

    private JPanel buttons(JButton... buttons) {
        JPanel row = row();
        for (JButton button : buttons) {
            if (row.getComponentCount() > 0) row.add(Box.createHorizontalStrut(6));
            row.add(button);
        }
        return row;
    }

    private static JPanel fieldRow(JTextField field, JButton browse) {
        JPanel row = new JPanel(new BorderLayout(JBUI.scale(8), 0));
        row.setAlignmentX(Component.LEFT_ALIGNMENT);
        row.setMaximumSize(new Dimension(Integer.MAX_VALUE, field.getPreferredSize().height + 6));
        row.add(field, BorderLayout.CENTER);
        if (browse != null) row.add(browse, BorderLayout.EAST);
        return row;
    }

    private JButton button(String key, Runnable action) {
        JButton button = new JButton(message(key));
        button.setName(key);
        button.getAccessibleContext().setAccessibleName(message(key));
        button.setToolTipText(message(key));
        button.addActionListener(event -> {
            action.run();
            updateStatuses();
        });
        return button;
    }

    static JTextArea text(String value) {
        JTextArea area = new JTextArea(value) {
            @Override public Dimension getPreferredSize() {
                Container parent = getParent();
                int width = parent == null ? 0 : parent.getWidth() - parent.getInsets().left - parent.getInsets().right;
                if (width <= 0) width = JBUI.scale(300);
                setSize(width, Short.MAX_VALUE);
                return new Dimension(0, super.getPreferredSize().height);
            }
            @Override public Dimension getMinimumSize() { return getPreferredSize(); }
            @Override public Dimension getMaximumSize() {
                return new Dimension(Integer.MAX_VALUE, getPreferredSize().height);
            }
        };
        area.setEditable(false);
        area.setLineWrap(true);
        area.setWrapStyleWord(true);
        area.setOpaque(false);
        area.setFont(UIManager.getFont("Label.font"));
        area.setForeground(UIManager.getColor("Label.foreground"));
        area.setAlignmentX(Component.LEFT_ALIGNMENT);
        area.setBorder(JBUI.Borders.empty());
        return area;
    }

    private static void setMessage(JTextArea area, String value) {
        if (!area.getText().equals(value)) area.setText(value);
        area.setVisible(!value.isEmpty());
    }

    @Override
    public void dispose() {
        disposed = true;
        timer.stop();
        if(sharedUi!=null)sharedUi.disposePanel();
        if(environmentEditor!=null)environmentEditor.disposePanel();
    }

    private static void invalidateLayout(Container container) {
        container.invalidate();
        for (Component child : container.getComponents()) {
            if (child instanceof Container nested) invalidateLayout(nested);
        }
    }

    private static final class ScrollableBody extends JPanel implements Scrollable {
        @Override public Dimension getPreferredScrollableViewportSize() { return getPreferredSize(); }
        @Override public int getScrollableUnitIncrement(Rectangle visible, int orientation, int direction) { return JBUI.scale(16); }
        @Override public int getScrollableBlockIncrement(Rectangle visible, int orientation, int direction) { return visible.height - JBUI.scale(16); }
        @Override public boolean getScrollableTracksViewportWidth() { return true; }
        @Override public boolean getScrollableTracksViewportHeight() { return false; }
    }
}
