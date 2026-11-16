package com.lusiad.toolwindow;

import junit.framework.TestCase;

import java.sql.SQLException;

public class FrontendSettingsTest extends TestCase {
    public void testAllowsLocalUrlsAndCustomPorts() {
        assertEquals("http://localhost:3001/project", FrontendSettings.parseUrl(" http://localhost:3001/project ").toString());
        assertEquals("https", FrontendSettings.parseUrl("https://127.0.0.1:3000").getScheme());
    }

    public void testRejectsUrlsThatCannotBeCheckedOrExposeCredentials() {
        for (String url : new String[]{"localhost:3000", "file:///C:/test", "http://user:secret@localhost:3000",
                "http://localhost:70000", "http://localhost:3000/#fragment", "http://localhost:3000\nother"}) {
            try {
                FrontendSettings.parseUrl(url);
                fail("URL should be rejected: " + url);
            } catch (IllegalArgumentException expected) {
                // These must never reach BrowserUtil or the HTTP diagnostic.
            }
        }
    }

    public void testQuotesWindowsPathsAsLiteralPowerShellArguments() {
        assertEquals("Set-Location -LiteralPath 'D:\\my project\\O''Brien $(example)'\nnpm run build\nnpm run start",
                FrontendSettings.startCommand("D:\\my project\\O'Brien $(example)", true));
    }

    public void testQuotesUnixPaths() {
        assertEquals("cd -- '/tmp/O'\\''Brien $(example)'\nnpm run build\nnpm run start",
                FrontendSettings.startCommand("/tmp/O'Brien $(example)", false));
    }

    public void testDoesNotAllowExtraCommandsThroughNewlines() {
        for (String directory : new String[]{"", "D:\\project\nother command", "D:\\project\rcommand"}) {
            try {
                FrontendSettings.startCommand(directory, true);
                fail("Directory should be rejected");
            } catch (IllegalArgumentException expected) {
                // Only one literal directory can be copied into the command.
            }
        }
    }

    public void testDatabaseErrorsHaveActionableDescriptionsWithoutDriverMessages() {
        assertEquals("toolwindow.database.error.credentials",
                FrontendSettings.databaseFailureKey(new SQLException("sensitive driver message", "28000", 1045)));
        assertEquals("toolwindow.database.error.unreachable",
                FrontendSettings.databaseFailureKey(new SQLException("connection error", "08S01")));
        assertEquals("toolwindow.database.error.missing",
                FrontendSettings.databaseFailureKey(new SQLException("unknown database", "42000", 1049)));
        assertEquals("toolwindow.database.error.driver",
                FrontendSettings.databaseFailureKey(new SQLException(new ClassNotFoundException())));
    }
}
