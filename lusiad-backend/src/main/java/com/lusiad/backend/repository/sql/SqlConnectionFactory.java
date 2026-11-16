package com.lusiad.backend.repository.sql;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

public final class SqlConnectionFactory {
    private final SqlConnectionConfig config;

    public SqlConnectionFactory(SqlConnectionConfig config) {
        this.config = config;
    }

    public Connection openConnection() throws SQLException {
        return openConnection(config.connectTimeoutMs, config.socketTimeoutMs);
    }

    /** Bounded connection used by the tool window diagnostics; regular operations keep their settings. */
    public Connection openConnection(int connectTimeoutMs, int socketTimeoutMs) throws SQLException {
        if (connectTimeoutMs < 0 || socketTimeoutMs < 0) throw new IllegalArgumentException("Negative timeout");
        if (com.lusiad.backend.config.RuntimeEnvironment.testMode()) {
            if (connectTimeoutMs == 0) connectTimeoutMs = 5000;
            if (socketTimeoutMs == 0) socketTimeoutMs = 30000;
        }
        try {
            Class.forName("com.mysql.cj.jdbc.Driver");
        } catch (ClassNotFoundException e) {
            throw new SQLException("MySQL JDBC driver not found in plugin classpath", e);
        }

        String jdbcUrl = "jdbc:mysql://" + config.host + ":" + config.port + "/" + config.database
                + (config.tls ? "?sslMode=VERIFY_IDENTITY" : "?sslMode=DISABLED&allowPublicKeyRetrieval=true") + "&serverTimezone=UTC"
                + "&connectTimeout=" + connectTimeoutMs + "&socketTimeout=" + socketTimeoutMs;
        Connection connection = DriverManager.getConnection(jdbcUrl, config.user, config.password);
        try {
            com.lusiad.backend.config.RuntimeEnvironment.verifyDatabase(connection);
            return connection;
        } catch (SQLException | RuntimeException failure) {
            connection.close();
            throw failure;
        }
    }
}
