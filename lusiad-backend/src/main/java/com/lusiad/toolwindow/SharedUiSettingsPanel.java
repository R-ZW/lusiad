package com.lusiad.toolwindow;

import com.google.gson.JsonObject;
import com.lusiad.LusiadBundle;
import com.lusiad.backend.config.SharedConfiguration;
import javax.swing.*;
import java.awt.*;
import java.util.*;

/** Edits the same browser preferences, not IntelliJ's global look and feel. */
final class SharedUiSettingsPanel extends JPanel {
    private final Locale locale;
    private final Runnable saved;
    private final JComboBox<String> language = new JComboBox<>(new String[]{"pt-BR","en"});
    private final JComboBox<String> textLanguage = new JComboBox<>(new String[]{"interface","pt-BR","en"});
    private final JComboBox<String> theme = new JComboBox<>(new String[]{"system","light","dark"});
    private final JComboBox<String> palette = new JComboBox<>(new String[]{"classic","soft","monochrome","custom"});
    private final Map<String,JButton> colors = new LinkedHashMap<>();
    private final JTextArea status = LusiadToolWindowPanel.text("");
    private boolean loading, busy, disposed, dirty;
    private JsonObject current = new JsonObject(), baseline = new JsonObject();
    private final JButton save;
    private final java.util.List<String> groups = java.util.List.of("file","types","methods","fields","variables","conditionals","loops","switch","exceptions","calls","returns","jumps","comments","blocks");
    private static final String[] CLASSIC = {"#64748b","#3b82f6","#10b981","#06b6d4","#14b8a6","#f59e0b","#f97316","#a855f7","#f43f5e","#6366f1","#ec4899","#8b5cf6","#84a45a","#94a3b8"};
    private static final String[] SOFT = {"#9ca3af","#93c5fd","#6ee7b7","#67e8f9","#5eead4","#fcd34d","#fdba74","#d8b4fe","#fda4af","#a5b4fc","#f9a8d4","#c4b5fd","#bef264","#cbd5e1"};
    SharedUiSettingsPanel(Locale locale, Runnable saved) {
        this.locale=locale; this.saved=saved;
        setLayout(new BoxLayout(this,BoxLayout.Y_AXIS));
        for(var combo:java.util.List.of(language,textLanguage,theme,palette))combo.setRenderer(new DefaultListCellRenderer(){
            @Override public Component getListCellRendererComponent(JList<?> list,Object value,int index,boolean selected,boolean focus){
                var result=super.getListCellRendererComponent(list,value,index,selected,focus);
                if(value!=null)setText(text("toolwindow.shared.value."+value));return result;
            }
        });
        add(field("toolwindow.shared.language",language)); add(field("toolwindow.shared.textLanguage",textLanguage));
        add(field("toolwindow.shared.theme",theme));theme.setToolTipText(text("toolwindow.shared.themeHelp")); add(field("toolwindow.shared.palette",palette));
        palette.addActionListener(e->{ if(!loading){ dirty=true; applyColors(current); }});
        JPanel swatches=new JPanel(new GridLayout(0,2,6,6));
        for(int i=0;i<groups.size();i++) {
            String group=groups.get(i); JButton color=new JButton(text("toolwindow.shared.group."+group));
            color.setName("lusiad.shared.color."+group); color.setOpaque(true);
            color.addActionListener(e->{
                Color chosen=JColorChooser.showDialog(this,color.getText(),color.getBackground());
                if(chosen!=null){ loading=true; palette.setSelectedItem("custom"); loading=false; color.setBackground(chosen);color.setForeground(chosen.getRed()*.299+chosen.getGreen()*.587+chosen.getBlue()*.114>145?Color.BLACK:Color.WHITE);current=preferences();dirty=true; }
            });
            colors.put(group,color); swatches.add(color);
        }
        add(swatches); save=new JButton(text("toolwindow.preferences.save")); save.setName("lusiad.shared.save"); save.addActionListener(e->save()); add(save); add(status);
        enabled(false); refresh();
    }
    private String text(String key){return LusiadBundle.messageForLocale(locale,key);}
    private JPanel field(String key,JComboBox<String> field) {
        JPanel row=new JPanel(new BorderLayout(8,0)); JLabel label=new JLabel(text(key)); label.setLabelFor(field); row.add(label,BorderLayout.WEST); row.add(field,BorderLayout.CENTER);
        field.setName("lusiad.shared."+key.substring(key.lastIndexOf('.')+1)); field.addActionListener(e->{if(!loading)dirty=true;}); row.setMaximumSize(new Dimension(Integer.MAX_VALUE,36)); return row;
    }
    boolean dirty(){return dirty || busy;}
    void disposePanel(){disposed=true;}
    void refresh() {
        if(busy || dirty || disposed)return; busy=true;
        new SwingWorker<JsonObject,Void>() {
            protected JsonObject doInBackground() throws Exception{return SharedConfiguration.ui();}
            protected void done(){ if(disposed)return; try { var ui=get(); if(!dirty){apply(ui);enabled(true);status.setText("");} }catch(Exception e){status.setText(text("toolwindow.shared.error"));} finally{busy=false;} }
        }.execute();
    }
    private void apply(JsonObject ui){
        current=ui; loading=true;
        language.setSelectedItem(ui.has("language")?ui.get("language").getAsString():(locale.getLanguage().equals("pt")?"pt-BR":"en"));
        textLanguage.setSelectedItem(ui.has("changeTextLanguage")?ui.get("changeTextLanguage").getAsString():"interface");
        theme.setSelectedItem(ui.has("theme")?ui.get("theme").getAsString():"system");
        palette.setSelectedItem(ui.has("palette")?ui.getAsJsonObject("palette").get("preset").getAsString():"classic");
        applyColors(ui); loading=false; dirty=false; baseline=preferences();
    }
    private void applyColors(JsonObject ui){
        var p=ui.has("palette")?ui.getAsJsonObject("palette"):new JsonObject();
        var custom=p.has("custom")?p.getAsJsonObject("custom"):new JsonObject(); String preset=Objects.toString(palette.getSelectedItem());
        for(int i=0;i<groups.size();i++){
            String group=groups.get(i); String value=preset.equals("soft")?SOFT[i]:preset.equals("monochrome")?"#808080":preset.equals("custom")&&custom.has(group)?custom.get(group).getAsString():CLASSIC[i];
            Color color=Color.decode(value); var b=colors.get(group); b.setBackground(color); b.setForeground(color.getRed()*.299+color.getGreen()*.587+color.getBlue()*.114>145?Color.BLACK:Color.WHITE);
        }
    }
    private JsonObject preferences(){
        JsonObject patch=new JsonObject();
        patch.addProperty("language",Objects.toString(language.getSelectedItem())); patch.addProperty("changeTextLanguage",Objects.toString(textLanguage.getSelectedItem())); patch.addProperty("theme",Objects.toString(theme.getSelectedItem()));
        JsonObject p=new JsonObject(), custom=new JsonObject(); p.addProperty("version",1); p.addProperty("preset",Objects.toString(palette.getSelectedItem()));
        for(var item:colors.entrySet())custom.addProperty(item.getKey(),String.format("#%06x",item.getValue().getBackground().getRGB()&0xffffff));
        p.add("custom",custom); patch.add("palette",p); return patch;
    }
    private void enabled(boolean value){language.setEnabled(value);textLanguage.setEnabled(value);theme.setEnabled(value);palette.setEnabled(value);colors.values().forEach(b->b.setEnabled(value));save.setEnabled(value);}
    private void save(){
        if(busy)return;var fields=preferences();JsonObject patch=new JsonObject();
        for(var item:fields.entrySet())if(!item.getValue().equals(baseline.get(item.getKey())))patch.add(item.getKey(),item.getValue());
        if(patch.isEmpty())return;
        busy=true;enabled(false);
        new SwingWorker<Void,Void>(){
            protected Void doInBackground() throws Exception{SharedConfiguration.saveUi(patch);return null;}
            protected void done(){if(disposed)return; busy=false;enabled(true);try{get();dirty=false;baseline=fields;status.setText(text("toolwindow.preferences.saved"));saved.run();}catch(Exception e){status.setText(text("toolwindow.shared.error"));}}
        }.execute();
    }
}
