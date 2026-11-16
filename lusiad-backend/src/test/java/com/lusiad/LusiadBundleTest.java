package com.lusiad;

import java.util.Locale;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Properties;
import junit.framework.TestCase;

public class LusiadBundleTest extends TestCase {
    private Locale originalLocale;

    @Override
    protected void setUp() {
        originalLocale = Locale.getDefault();
    }

    @Override
    protected void tearDown() {
        Locale.setDefault(originalLocale);
    }

    public void testEnglishMessagesAndInterpolation() {
        Locale.setDefault(Locale.ENGLISH);
        assertEquals("Start server", LusiadBundle.message("toolwindow.server.start"));
        assertEquals(
                "Server started at http://127.0.0.1:8765.",
                LusiadBundle.message("toolwindow.server.started", "http://127.0.0.1:8765")
        );
    }

    public void testBrazilianPortugueseMessages() {
        Locale.setDefault(Locale.forLanguageTag("pt-BR"));
        assertEquals("Iniciar servidor", LusiadBundle.message("toolwindow.server.start"));
    }

    public void testExplicitPluginLanguageDoesNotChangeIdeLocale() {
        Locale.setDefault(Locale.ENGLISH);
        assertEquals("Verificar conexão", LusiadBundle.messageForLocale(Locale.forLanguageTag("pt-BR"), "toolwindow.database.check"));
        assertEquals(Locale.ENGLISH, Locale.getDefault());
        assertEquals("Check connection", LusiadBundle.messageForLocale(Locale.ENGLISH, "toolwindow.database.check"));
        assertEquals("Última verificação: 07/10/2026", LusiadBundle.messageForLocale(
                Locale.forLanguageTag("pt-BR"), "toolwindow.check.time", "07/10/2026"));
        Locale.setDefault(Locale.forLanguageTag("pt-BR"));
        assertEquals("Check connection", LusiadBundle.messageForLocale(Locale.ENGLISH, "toolwindow.database.check"));
    }

    public void testCataloguesHaveExactlyTheSameKeysWithoutRelyingOnFallback() throws Exception {
        Properties english = catalogue("MyMessageBundle.properties");
        Properties portuguese = catalogue("MyMessageBundle_pt_BR.properties");
        assertEquals(english.keySet(), portuguese.keySet());
        for (Object key : english.keySet()) {
            assertFalse(english.getProperty(key.toString()).isBlank());
            assertFalse(portuguese.getProperty(key.toString()).isBlank());
            assertFalse(LusiadBundle.messageForLocale(Locale.ENGLISH, key.toString(), "value").isBlank());
            assertFalse(LusiadBundle.messageForLocale(Locale.forLanguageTag("pt-BR"), key.toString(), "value").isBlank());
        }
    }

    private Properties catalogue(String name) throws Exception {
        Properties properties = new Properties();
        try (var stream = getClass().getResourceAsStream("/messages/" + name)) {
            assertNotNull(stream);
            properties.load(new InputStreamReader(stream, StandardCharsets.UTF_8));
        }
        return properties;
    }
}
