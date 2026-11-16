package com.lusiad.toolwindow;

import com.google.gson.*;
import com.lusiad.LusiadBundle;
import com.lusiad.backend.config.*;
import javax.swing.*;
import java.awt.*;
import java.nio.file.*;
import java.util.*;

/** Declared application settings only. Never pretends to mutate a running process environment. */
final class EnvironmentSettingsPanel extends JPanel implements Scrollable {
    record Option(String path,String env,String kind,String fallback) {}
    static final java.util.List<Option> OPTIONS=java.util.List.of(
        new Option("apiUrl","LUSIAD_API_URL / LUSIAD_API_PORT","text","http://127.0.0.1:8765"),
        new Option("frontendUrl","LUSIAD_FRONTEND_URL","text","http://localhost:3000"),
        new Option("tempRoot","LUSIAD_TEMP_ROOT","text",Path.of(System.getProperty("user.home"),".lusiad","temp").toString()),
        new Option("requestTimeoutMs","LUSIAD_API_TIMEOUT_MS","number","60000"),
        new Option("analyticsEnabled","LUSIAD_ANALYTICS_ENABLED","boolean","false"),
        new Option("database.host","LUSIAD_DB_HOST","text","127.0.0.1"),
        new Option("database.port","LUSIAD_DB_PORT","number","3306"),
        new Option("database.name","LUSIAD_DB_NAME","text","lusiad"),
        new Option("database.user","LUSIAD_DB_USER","text",""),
        new Option("database.password","LUSIAD_DB_PASSWORD","password",""),
        new Option("database.tls","LUSIAD_DB_TLS","boolean","false"),
        new Option("database.connectTimeoutMs","LUSIAD_DB_CONNECT_TIMEOUT_MS","number","5000"),
        new Option("database.socketTimeoutMs","LUSIAD_DB_SOCKET_TIMEOUT_MS","number","30000")
    );
    private final Map<Option,JComponent> fields=new LinkedHashMap<>();
    private final Map<Option,JLabel> labels=new LinkedHashMap<>();
    private final Locale locale;
    private final JTextArea status=LusiadToolWindowPanel.text("");
    private final JTextArea startup=new JTextArea();
    private final JButton save, reload;
    private String revision;
    private boolean busy, dirty, loading, disposed, restartRequired;
    EnvironmentSettingsPanel(Locale locale){
        this.locale=locale;setLayout(new BoxLayout(this,BoxLayout.Y_AXIS));
        JLabel explanation=new JLabel(text("toolwindow.environment.editorHelp")); explanation.setToolTipText(text("toolwindow.environment.precedence")); add(explanation);
        for(var option:OPTIONS){
            JPanel row=new JPanel(new BorderLayout(8,3));JLabel label=new JLabel(option.path());labels.put(option,label);label.setToolTipText(option.env());row.add(label,BorderLayout.NORTH);
            JComponent field;
            if(option.kind().equals("boolean")) {JCheckBox check=new JCheckBox();check.addActionListener(e->{if(!loading)dirty=true;});field=check;}
            else {JTextField input=option.kind().equals("password")?new JPasswordField():new JTextField();input.getDocument().addDocumentListener(new javax.swing.event.DocumentListener(){public void insertUpdate(javax.swing.event.DocumentEvent e){changed();}public void removeUpdate(javax.swing.event.DocumentEvent e){changed();}public void changedUpdate(javax.swing.event.DocumentEvent e){changed();}private void changed(){if(!loading)dirty=true;}});field=input;}
            label.setLabelFor(field);field.setName("lusiad.environment."+option.path());field.setToolTipText(option.env());row.add(field,BorderLayout.CENTER);row.setMaximumSize(new Dimension(Integer.MAX_VALUE,58));fields.put(option,field);add(row);
        }
        JPanel actions=new JPanel(new FlowLayout(FlowLayout.LEADING));save=new JButton(text("toolwindow.preferences.save"));reload=new JButton(text("toolwindow.environment.reload"));save.setName("lusiad.environment.save");save.addActionListener(e->save());reload.addActionListener(e->{if(!dirty||JOptionPane.showConfirmDialog(this,text("toolwindow.environment.discardDraft"),"Lusiad",JOptionPane.OK_CANCEL_OPTION)==JOptionPane.OK_OPTION)load();});actions.add(save);actions.add(reload);add(actions);add(status);
        JButton editRun=new JButton(text("toolwindow.environment.editRun"));editRun.setName("lusiad.environment.editRun");editRun.addActionListener(e->{var manager=com.intellij.openapi.actionSystem.ActionManager.getInstance();var action=manager.getAction("editRunConfigurations");if(action!=null)manager.tryToExecute(action,null,this,"Lusiad",true);else status.setText(text("toolwindow.environment.runHelp"));});add(editRun);
        startup.setEditable(false);startup.setLineWrap(true);startup.setWrapStyleWord(true);startup.setOpaque(false);startup.setFont(UIManager.getFont("Label.font"));add(startup);load();
    }
    private String text(String key){return LusiadBundle.messageForLocale(locale,key);}
    boolean dirty(){return dirty||busy;}
    void disposePanel(){disposed=true;}
    private record Snapshot(JsonObject value,String revision,String startup,Set<Option> overridden){}
    private void load(){
        if(busy)return;busy=true;fields.values().forEach(f->f.setEnabled(false));save.setEnabled(false);reload.setEnabled(false);
        new SwingWorker<Snapshot,Void>(){
            protected Snapshot doInBackground()throws Exception{
                Path file=SharedConfiguration.file();String before=SharedConfiguration.revision(file);var json=SharedConfiguration.read(file);if(!before.equals(SharedConfiguration.revision(file)))throw new IllegalStateException("changed");
                var settings=OperationalSettings.load();StringBuilder info=new StringBuilder(file.toString()).append("\n").append(text("toolwindow.environment.startup"));
                for(String key:new String[]{"LUSIAD_ENV","LUSIAD_ENV_FILE","LUSIAD_CONFIG_FILE","LUSIAD_TEST_CONFIG","LUSIAD_IDE_SANDBOX","PORT"})info.append("\n").append(key).append(" = ").append(settings.value(key,"—"));
                Set<Option> overridden=new HashSet<>();
                for(var option:OPTIONS){
                    if(Arrays.stream(option.env().split(" / ")).anyMatch(settings::overridden))overridden.add(option);
                    if(EnvironmentSettingsPanel.get(json,option.path())==null){
                        String effective=option.path().equals("apiUrl")?settings.apiUrl():settings.value(option.env(),option.fallback());
                        put(json,option.path(),new JsonPrimitive(effective));
                    }
                }
                info.append("\n").append(text("toolwindow.environment.tokenManaged"));return new Snapshot(json,before,info.toString(),overridden);
            }
            protected void done(){if(disposed)return;try{var snapshot=get();loading=true;for(var item:fields.entrySet()){var option=item.getKey();labels.get(option).setText(option.path()+(snapshot.overridden().contains(option)?"  [Run]":""));var v=EnvironmentSettingsPanel.get(snapshot.value(),option.path());String value=v==null?option.fallback():v.getAsString();if(item.getValue() instanceof JCheckBox check)check.setSelected(Boolean.parseBoolean(value));else ((JTextField)item.getValue()).setText(value);}revision=snapshot.revision();startup.setText(snapshot.startup());dirty=false;status.setText(restartRequired?text("toolwindow.environment.saved"):"");}catch(Exception e){status.setText(text("toolwindow.shared.error"));}finally{loading=false;busy=false;fields.values().forEach(f->f.setEnabled(!RuntimeEnvironment.testMode()));save.setEnabled(revision!=null&&!RuntimeEnvironment.testMode());reload.setEnabled(true);}}
        }.execute();
    }
    private void save(){
        if(busy||revision==null)return;JsonObject patch=new JsonObject();
        try{
            for(var item:fields.entrySet()){
                Option option=item.getKey();String raw=item.getValue() instanceof JCheckBox check?String.valueOf(check.isSelected()):item.getValue() instanceof JPasswordField password?new String(password.getPassword()):((JTextField)item.getValue()).getText().trim();
                if(raw.indexOf('\0')>=0||raw.indexOf('\r')>=0||raw.indexOf('\n')>=0)throw new IllegalArgumentException(option.path());
                JsonElement value=option.kind().equals("number")?new JsonPrimitive(Integer.parseInt(raw)):option.kind().equals("boolean")?new JsonPrimitive(Boolean.parseBoolean(raw)):new JsonPrimitive(raw);
                put(patch,option.path(),value);
            }
            validate(patch);
        }catch(RuntimeException e){status.setText(text("toolwindow.environment.invalid"));return;}
        busy=true;fields.values().forEach(f->f.setEnabled(false));save.setEnabled(false);reload.setEnabled(false);final String expected=revision;
        new SwingWorker<Void,Void>(){
            protected Void doInBackground()throws Exception{
                SharedConfiguration.update(SharedConfiguration.file(),expected,root->{for(var item:patch.entrySet()){if(item.getKey().equals("database")){JsonObject db=root.has("database")?root.getAsJsonObject("database"):new JsonObject();for(var entry:item.getValue().getAsJsonObject().entrySet())db.add(entry.getKey(),entry.getValue());root.add("database",db);}else root.add(item.getKey(),item.getValue());}});return null;
            }
            protected void done(){if(disposed)return;busy=false;reload.setEnabled(true);try{get();dirty=false;restartRequired=true;revision=null;load();status.setText(text("toolwindow.environment.saved"));}catch(Exception e){fields.values().forEach(f->f.setEnabled(true));save.setEnabled(true);status.setText(text("toolwindow.environment.conflict"));}}
        }.execute();
    }
    static JsonElement get(JsonObject json,String key){String[] parts=key.split("\\.");JsonElement value=json;for(String part:parts){if(!value.isJsonObject()||!value.getAsJsonObject().has(part))return null;value=value.getAsJsonObject().get(part);}return value;}
    static void put(JsonObject json,String key,JsonElement value){String[] parts=key.split("\\.");JsonObject target=json;for(int i=0;i<parts.length-1;i++){if(!target.has(parts[i]))target.add(parts[i],new JsonObject());target=target.getAsJsonObject(parts[i]);}target.add(parts[parts.length-1],value);}
    static void validate(JsonObject json){
        var api=OperationalSettings.origin(json.get("apiUrl").getAsString(),"apiUrl");if(!api.getScheme().equals("http")||!Set.of("127.0.0.1","localhost").contains(api.getHost()))throw new IllegalArgumentException();
        OperationalSettings.origin(json.get("frontendUrl").getAsString(),"frontendUrl");Path root=Path.of(json.get("tempRoot").getAsString());if(!root.isAbsolute()||root.normalize().equals(root.getRoot()))throw new IllegalArgumentException();
        JsonObject db=json.getAsJsonObject("database");if(!db.get("host").getAsString().matches("[\\w.-]+")||!db.get("name").getAsString().matches("[\\w-]+"))throw new IllegalArgumentException();
        if(db.get("tls").getAsBoolean()&&db.get("host").getAsString().matches("\\d+(\\.\\d+){3}"))throw new IllegalArgumentException();
        for(String key:new String[]{"requestTimeoutMs","database.port","database.connectTimeoutMs","database.socketTimeoutMs"}){int n=get(json,key).getAsInt();int min=key.endsWith("port")||key.endsWith("connectTimeoutMs")?1:0;int max=key.endsWith("port")?65535:120000;if(n<min||n>max)throw new IllegalArgumentException();}
    }
    public Dimension getPreferredScrollableViewportSize(){return getPreferredSize();}
    public int getScrollableUnitIncrement(Rectangle r,int orientation,int direction){return 16;}
    public int getScrollableBlockIncrement(Rectangle r,int orientation,int direction){return Math.max(16,r.height-16);}
    public boolean getScrollableTracksViewportWidth(){return true;}
    public boolean getScrollableTracksViewportHeight(){return false;}
}
