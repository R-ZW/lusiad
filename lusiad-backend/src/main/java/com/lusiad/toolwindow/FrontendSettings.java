package com.lusiad.toolwindow;

import java.net.URI;
import java.net.URISyntaxException;
import java.sql.SQLException;

/** Validation and diagnostic descriptions shared by the UI and regression tests. */
public final class FrontendSettings {
    private FrontendSettings() {}

    public static URI parseUrl(String text) {
        try {
            URI uri = new URI(text.trim());
            String scheme = uri.getScheme();
            if (!("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                    || uri.getHost() == null || uri.getRawUserInfo() != null
                    || uri.getPort() > 65535 || uri.getFragment() != null) {
                throw new IllegalArgumentException("Invalid frontend URL");
            }
            return uri;
        } catch (URISyntaxException | NullPointerException failure) {
            throw new IllegalArgumentException("Invalid frontend URL", failure);
        }
    }

    public static String startCommand(String directory, boolean windows) {
        if (directory == null || directory.isBlank() || directory.indexOf('\n') >= 0
                || directory.indexOf('\r') >= 0 || directory.indexOf('\0') >= 0) {
            throw new IllegalArgumentException("Invalid frontend directory");
        }
        String quoted = windows ? "'" + directory.replace("'", "''") + "'"
                : "'" + directory.replace("'", "'\\''") + "'";
        return (windows ? "Set-Location -LiteralPath " : "cd -- ") + quoted + "\nnpm run build\nnpm run start";
    }

    public static String databaseFailureKey(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof ClassNotFoundException) return "toolwindow.database.error.driver";
            if (cause instanceof SQLException sql) {
                if (sql.getErrorCode() == 1049) return "toolwindow.database.error.missing";
                if (sql.getErrorCode() == 1045 || (sql.getSQLState() != null && sql.getSQLState().startsWith("28")))
                    return "toolwindow.database.error.credentials";
                if (sql.getSQLState() != null && sql.getSQLState().startsWith("08"))
                    return "toolwindow.database.error.unreachable";
            }
        }
        return "toolwindow.database.error.generic";
    }
}
