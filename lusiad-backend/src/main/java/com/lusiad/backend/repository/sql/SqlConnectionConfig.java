package com.lusiad.backend.repository.sql;

import com.lusiad.backend.config.OperationalSettings;

public final class SqlConnectionConfig {
    public final String host, port, database, user, password;
    public final int connectTimeoutMs, socketTimeoutMs;
    public final boolean tls;

    private SqlConnectionConfig(String host, String port, String database, String user, String password, int connectTimeoutMs, int socketTimeoutMs, boolean tls) {
        this.host = host; this.port = port; this.database = database; this.user = user; this.password = password;
        this.connectTimeoutMs = connectTimeoutMs; this.socketTimeoutMs = socketTimeoutMs;
        this.tls = tls;
    }

    public static SqlConnectionConfig load() {
        var test = com.lusiad.backend.config.RuntimeEnvironment.loadTest();
        if (test != null) {
            var db = test.database();
            return new SqlConnectionConfig(db.get("host").getAsString(), db.get("port").getAsString(),
                    db.get("name").getAsString(), db.get("user").getAsString(), db.get("password").getAsString(), 5000, 30000, false);
        }
        return from(OperationalSettings.load());
    }

    public static SqlConnectionConfig from(OperationalSettings settings) {
        String host = settings.value("LUSIAD_DB_HOST", "127.0.0.1"), name = settings.value("LUSIAD_DB_NAME", "lusiad");
        if (!host.matches("[A-Za-z0-9_.-]+") || !name.matches("[A-Za-z0-9_-]+")) throw new IllegalArgumentException("Invalid SQL host or database name");
        String user = settings.value("LUSIAD_DB_USER", "");
        if (user.isBlank()) throw new IllegalArgumentException("Configure LUSIAD_DB_USER or database.user in " + settings.configFile);
        boolean tls = settings.bool("LUSIAD_DB_TLS", false);
        if (tls && host.matches("[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+")) throw new IllegalArgumentException("SQL TLS requires a DNS hostname matching the certificate");
        return new SqlConnectionConfig(!tls && host.equals("localhost") ? "127.0.0.1" : host,
                Integer.toString(settings.integer("LUSIAD_DB_PORT", 3306, 1, 65535)), name, user,
                settings.value("LUSIAD_DB_PASSWORD", ""), settings.integer("LUSIAD_DB_CONNECT_TIMEOUT_MS", 5000, 1, 120000),
                settings.integer("LUSIAD_DB_SOCKET_TIMEOUT_MS", 30000, 0, 120000), tls);
    }
}
