package com.lusiad.backend.repository.change;

import com.lusiad.backend.repository.sql.SqlConnectionFactory;

import java.sql.Connection;
import java.sql.PreparedStatement;

public final class ChangeRepository {
    private final SqlConnectionFactory connectionFactory;

    public ChangeRepository(SqlConnectionFactory connectionFactory) {
        this.connectionFactory = connectionFactory;
    }

    public void insertChange(int projectId, String changeType, String scope,
                             String summary, String description, String dateTime, String reqJson)
            throws Exception {
        // A scalar subquery keeps project and selected branch in the same statement.
        // No branch yet (before init) yields NULL; ambiguous selections fail rather
        // than silently choosing an arbitrary branch.
        String sql = "INSERT INTO `changes` (commit_id, project_id, branch_id, summary, description, date_time, change_type, scope, req_body) "
                + "VALUES (NULL, ?, (SELECT id FROM branches WHERE project_id = ? AND selected = '1'), ?, ?, ?, ?, ?, ?)";

        try (Connection connection = connectionFactory.openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, projectId);
            statement.setInt(2, projectId);
            statement.setString(3, summary);
            statement.setString(4, description);
            statement.setString(5, dateTime);
            statement.setString(6, changeType);
            statement.setString(7, scope);
            statement.setString(8, reqJson);
            statement.executeUpdate();
        }
    }

    // ── scope: file ───────────────────────────────────────────────────────────

    public void insertInFileCreate(int projectId, String summary, String description, String dateTime, String reqJson) throws Exception {
        if (description == null) { description = ""; }
        insertChange(projectId, "create", "file", summary, description, dateTime, reqJson);
    }

    public void insertInFileUpdate(int projectId, String summary, String description, String dateTime, String reqJson) throws Exception {
        if (description == null) { description = ""; }
        insertChange(projectId, "update", "file", summary, description, dateTime, reqJson);
    }

    public void insertInFileMove(int projectId, String summary, String description, String dateTime, String reqJson) throws Exception {
        if (description == null) { description = ""; }
        insertChange(projectId, "move", "file", summary, description, dateTime, reqJson);
    }

    public void insertInFileDelete(int projectId, String summary, String description, String dateTime, String reqJson) throws Exception {
        if (description == null) { description = ""; }
        insertChange(projectId, "delete", "file", summary, description, dateTime, reqJson);
    }

    // ── scope: dir ────────────────────────────────────────────────────────────

    public void insertFileCreate(int projectId, String summary, String description, String dateTime, String reqJson) throws Exception {
        if (description == null) { description = ""; }
        insertChange(projectId, "file_create", "dir", summary, description, dateTime, reqJson);
    }

    public void insertFileRename(int projectId, String summary, String description, String dateTime, String reqJson) throws Exception {
        if (description == null) { description = ""; }
        insertChange(projectId, "file_rename", "dir", summary, description, dateTime, reqJson);
    }

    public void insertFileDelete(int projectId, String summary, String description, String dateTime, String reqJson) throws Exception {
        if (description == null) { description = ""; }
        insertChange(projectId, "file_delete", "dir", summary, description, dateTime, reqJson);
    }

    public void insertFileMove(int projectId, String summary, String description, String dateTime, String reqJson) throws Exception {
        if (description == null) { description = ""; }
        insertChange(projectId, "file_move", "dir", summary, description, dateTime, reqJson);
    }

    // ── scope: project ────────────────────────────────────────────────────────

    public void insertDirCreate(int projectId, String summary, String description, String dateTime, String reqJson) throws Exception {
        if (description == null) { description = ""; }
        insertChange(projectId, "dir_create", "project", summary, description, dateTime, reqJson);
    }

    public void insertDirRename(int projectId, String summary, String description, String dateTime, String reqJson) throws Exception {
        if (description == null) { description = ""; }
        insertChange(projectId, "dir_rename", "project", summary, description, dateTime, reqJson);
    }

    public void insertDirDelete(int projectId, String summary, String description, String dateTime, String reqJson) throws Exception {
        if (description == null) { description = ""; }
        insertChange(projectId, "dir_delete", "project", summary, description, dateTime, reqJson);
    }

    public void insertDirMove(int projectId, String summary, String description, String dateTime, String reqJson) throws Exception {
        if (description == null) { description = ""; }
        insertChange(projectId, "dir_move", "project", summary, description, dateTime, reqJson);
    }

    public void testConnection() throws Exception {
        try (Connection connection = connectionFactory.openConnection();
             PreparedStatement statement = connection.prepareStatement("SELECT 1")) {
            statement.execute();
        }
    }
}
