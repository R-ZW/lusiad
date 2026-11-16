package com.lusiad.toolwindow;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.components.PersistentStateComponent;
import com.intellij.openapi.components.Service;
import com.intellij.openapi.components.State;
import com.intellij.openapi.components.Storage;
import org.jetbrains.annotations.NotNull;

import java.util.Locale;

@Service(Service.Level.APP)
@State(name = "LusiadPreferences", storages = @Storage("lusiad.xml"))
public final class LusiadPreferences implements PersistentStateComponent<LusiadPreferences.Settings> {
    public static final String DEFAULT_FRONTEND_URL = "http://localhost:3000";

    public static final class Settings {
        public String language = "";
        public String frontendUrl = com.lusiad.backend.config.RuntimeEnvironment.frontendUrl(DEFAULT_FRONTEND_URL);
        public String frontendDirectory = "";
        public java.util.Map<String,Integer> selectedProjectByIdeRoot = new java.util.HashMap<>();
    }

    private Settings settings = new Settings();

    public static LusiadPreferences getInstance() {
        return ApplicationManager.getApplication().getService(LusiadPreferences.class);
    }

    @Override
    public @NotNull Settings getState() {
        return settings;
    }

    @Override
    public void loadState(@NotNull Settings state) {
        settings = state;
    }

    public Locale locale() {
        String language = settings.language;
        try { var ui=com.lusiad.backend.config.SharedConfiguration.ui();if(ui.has("language"))language=ui.get("language").getAsString(); } catch(Exception ignored) { /* Existing IDE preference remains available during a read failure. */ }
        if (language == null || language.isBlank()) language = Locale.getDefault().getLanguage();
        return language.startsWith("pt") ? Locale.forLanguageTag("pt-BR") : Locale.ENGLISH;
    }

    public String frontendUrl() {
        return com.lusiad.backend.config.RuntimeEnvironment.frontendUrl(
                settings.frontendUrl == null || settings.frontendUrl.isBlank() ? DEFAULT_FRONTEND_URL : settings.frontendUrl);
    }
    public String frontendDirectory() {
        try{var root=com.lusiad.backend.config.SharedConfiguration.read(com.lusiad.backend.config.SharedConfiguration.file());if(root.has("plugin")&&root.getAsJsonObject("plugin").has("frontendDirectory"))return root.getAsJsonObject("plugin").get("frontendDirectory").getAsString();}catch(Exception ignored){}
        return settings.frontendDirectory;
    }
    public int selectedProject(String host) { return settings.selectedProjectByIdeRoot == null ? 0 : settings.selectedProjectByIdeRoot.getOrDefault(host,0); }
    public void selectProject(String host,int id) {
        if(settings.selectedProjectByIdeRoot==null)settings.selectedProjectByIdeRoot=new java.util.HashMap<>();
        if(id==0)settings.selectedProjectByIdeRoot.remove(host);else settings.selectedProjectByIdeRoot.put(host,id);
    }
}
