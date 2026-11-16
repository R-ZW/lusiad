package com.lusiad.backend.repository.project;

import com.lusiad.backend.repository.sql.SqlConnectionFactory;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

public final class ProjectRepository {

    private final SqlConnectionFactory connectionFactory;

    public ProjectRepository(SqlConnectionFactory connectionFactory) {
        this.connectionFactory = connectionFactory;
    }

    /**
     * Returns the absolute project root path for the given project id,
     * or {@code null} if the project does not exist.
     */
    public String findPathById(int projectId) throws Exception {
        return findColumn(projectId, "path");
    }

    /**
     * Returns the absolute temp directory path for the given project id,
     * or {@code null} if the project does not exist.
     */
    public String findTempPathById(int projectId) throws Exception {
        return findColumn(projectId, "temp_path");
    }

    /**
     * Returns a {@link ProjectPaths} record (path + temp_path) for the given
     * project id, or {@code null} if the project does not exist.
     */
    public ProjectPaths findPathsById(int projectId) throws Exception {
        String sql = "SELECT path, temp_path FROM `projects` WHERE id = ?";

        try (Connection connection = connectionFactory.openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            com.lusiad.backend.service.project.ProjectManagementService.requireNoPendingAdministration(connection, projectId);
            statement.setInt(1, projectId);
            try (ResultSet rs = statement.executeQuery()) {
                if (rs.next()) {
                    return new ProjectPaths(rs.getString("path"), rs.getString("temp_path"));
                }
                return null;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private String findColumn(int projectId, String column) throws Exception {
        String sql = "SELECT " + column + " FROM `projects` WHERE id = ?";

        try (Connection connection = connectionFactory.openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, projectId);
            try (ResultSet rs = statement.executeQuery()) {
                return rs.next() ? rs.getString(column) : null;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Value type
    // -------------------------------------------------------------------------

    public static final class ProjectPaths {
        /** Absolute path to the project root directory. */
        public final String path;
        /** Absolute path to the project's temporary restore directory. */
        public final String tempPath;

        public ProjectPaths(String path, String tempPath) {
            this.path = path;
            this.tempPath = tempPath;
        }
    }
}
