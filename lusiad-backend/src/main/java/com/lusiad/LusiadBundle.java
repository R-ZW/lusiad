package com.lusiad;

import java.text.MessageFormat;
import java.util.Locale;
import java.util.ResourceBundle;

/** Localized messages for the IntelliJ-side user interface. */
public final class LusiadBundle {
    private static final String BUNDLE_NAME = "messages.MyMessageBundle";

    private LusiadBundle() {}

    public static String message(String key, Object... arguments) {
        return messageForLocale(Locale.getDefault(), key, arguments);
    }

    public static String messageForLocale(Locale locale, String key, Object... arguments) {
        ResourceBundle bundle = ResourceBundle.getBundle(
                BUNDLE_NAME,
                locale,
                LusiadBundle.class.getClassLoader(),
                ResourceBundle.Control.getNoFallbackControl(ResourceBundle.Control.FORMAT_DEFAULT)
        );
        return new MessageFormat(bundle.getString(key), locale).format(arguments);
    }
}
