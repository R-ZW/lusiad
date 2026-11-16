package com.lusiad.backend.repository.restore;

import com.lusiad.backend.repository.sql.SqlConnectionFactory;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;

public final class RestoreRepository {

  private final SqlConnectionFactory connectionFactory;

  public RestoreRepository(SqlConnectionFactory connectionFactory) {
    this.connectionFactory = connectionFactory;
  }

  /** Capture all committed replay input in one read-only SQL transaction. */
  public ReplayInput loadReplay(int targetId) throws Exception {
    try (Connection connection = connectionFactory.openConnection()) {
      connection.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
      connection.setReadOnly(true);
      connection.setAutoCommit(false);
      try {
        int projectId, commitId;
        String root, temp, gitId;
        try (PreparedStatement query =
            connection.prepareStatement(
                "SELECT ch.project_id,ch.commit_id,p.path,p.temp_path,c.git_id FROM changes ch JOIN"
                    + " commits c ON c.id=ch.commit_id JOIN branches b ON b.id=c.branch_id JOIN"
                    + " projects p ON p.id=b.project_id WHERE ch.id=? AND"
                    + " ch.project_id=b.project_id AND (ch.branch_id IS NULL OR"
                    + " ch.branch_id=c.branch_id)")) {
          query.setInt(1, targetId);
          try (ResultSet rs = query.executeQuery()) {
            if (!rs.next())
              throw new IllegalArgumentException(
                  "committed change not found in its project/branch");
            projectId = rs.getInt(1);
            commitId = rs.getInt(2);
            root = rs.getString(3);
            temp = rs.getString(4);
            gitId = rs.getString(5);
          }
        }
        List<ChangeRow> rows = new ArrayList<>();
        try (PreparedStatement query =
            connection.prepareStatement(
                "SELECT ch.id,ch.change_type,ch.scope,ch.req_body FROM changes ch JOIN commits c ON"
                    + " c.id=ch.commit_id WHERE ch.project_id=? AND ch.commit_id=? AND ch.id<=? AND"
                    + " (ch.branch_id IS NULL OR ch.branch_id=c.branch_id) ORDER BY ch.id")) {
          query.setInt(1, projectId);
          query.setInt(2, commitId);
          query.setInt(3, targetId);
          try (ResultSet rs = query.executeQuery()) {
            while (rs.next())
              rows.add(
                  new ChangeRow(rs.getInt(1), rs.getString(2), rs.getString(3), rs.getString(4)));
          }
        }
        java.util.Map<Integer, List<HistoricalBundleFile>> bundles = new java.util.HashMap<>();
        try (PreparedStatement query =
            connection.prepareStatement(
                "SELECT"
                    + " bf.change_id,bf.path,bf.before_kind,bf.before_content,bf.after_kind,bf.after_content"
                    + " FROM external_sync_bundle_files bf JOIN changes ch ON ch.id=bf.change_id"
                    + " JOIN commits c ON c.id=ch.commit_id WHERE ch.project_id=? AND"
                    + " ch.commit_id=? AND ch.id<=? AND (ch.branch_id IS NULL OR"
                    + " ch.branch_id=c.branch_id) ORDER BY bf.path")) {
          query.setInt(1, projectId);
          query.setInt(2, commitId);
          query.setInt(3, targetId);
          try (ResultSet rs = query.executeQuery()) {
            while (rs.next())
              bundles
                  .computeIfAbsent(rs.getInt(1), key -> new ArrayList<>())
                  .add(
                      new HistoricalBundleFile(
                          rs.getString(2),
                          rs.getString(3),
                          rs.getBytes(4),
                          rs.getString(5),
                          rs.getBytes(6)));
          }
        }
        connection.commit();
        return new ReplayInput(projectId, commitId, root, temp, gitId, List.copyOf(rows), bundles);
      } catch (Exception error) {
        connection.rollback();
        throw error;
      }
    }
  }

  /** A single SQL view of the selected branch, its HEAD and all pending events through target. */
  public PendingReplayInput loadPendingReplay(int projectId, int targetId, int branchId,
      String gitId, String revision) throws Exception {
    try (Connection connection = connectionFactory.openConnection()) {
      connection.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
      connection.setReadOnly(true);
      connection.setAutoCommit(false);
      try {
        String root, temp, branchName, head;
        int headCommit;
        try (PreparedStatement query = connection.prepareStatement(
            "SELECT p.path,p.temp_path,b.name,c.id,c.git_id FROM projects p"
                + " JOIN branches b ON b.project_id=p.id AND b.selected='1' AND b.id=?"
                + " JOIN commits c ON c.branch_id=b.id WHERE p.id=? ORDER BY c.id DESC LIMIT 1")) {
          query.setInt(1, branchId);
          query.setInt(2, projectId);
          try (ResultSet rs = query.executeQuery()) {
            if (!rs.next()) throw new IllegalArgumentException("selected branch has no committed baseline");
            root = rs.getString(1); temp = rs.getString(2); branchName = rs.getString(3);
            headCommit = rs.getInt(4); head = rs.getString(5);
          }
        }
        if (!head.equals(gitId)) throw new IllegalArgumentException("pending baseline changed");
        String currentRevision;
        try (PreparedStatement query = connection.prepareStatement(
            "SELECT COUNT(*),COALESCE(MAX(id),0) FROM changes WHERE project_id=?"
                + " AND commit_id IS NULL AND (branch_id IS NULL OR branch_id=?)")) {
          query.setInt(1, projectId); query.setInt(2, branchId);
          try (ResultSet rs = query.executeQuery()) {
            rs.next(); currentRevision = rs.getLong(1) + ":" + rs.getLong(2);
          }
        }
        if (!currentRevision.equals(revision)) throw new IllegalArgumentException("pending changes changed");
        List<ChangeRow> rows = new ArrayList<>();
        try (PreparedStatement query = connection.prepareStatement(
            "SELECT id,change_type,scope,req_body FROM changes WHERE project_id=?"
                + " AND commit_id IS NULL AND (branch_id IS NULL OR branch_id=?)"
                + " AND id<=? ORDER BY id")) {
          query.setInt(1, projectId); query.setInt(2, branchId); query.setInt(3, targetId);
          try (ResultSet rs = query.executeQuery()) {
            while (rs.next()) rows.add(new ChangeRow(rs.getInt(1), rs.getString(2), rs.getString(3), rs.getString(4)));
          }
        }
        if (targetId != 0 && (rows.isEmpty() || rows.get(rows.size()-1).id != targetId))
          throw new IllegalArgumentException("pending change not found on selected branch");
        java.util.Map<Integer,List<HistoricalBundleFile>> bundles = new java.util.HashMap<>();
        try (PreparedStatement query = connection.prepareStatement(
            "SELECT bf.change_id,bf.path,bf.before_kind,bf.before_content,bf.after_kind,bf.after_content"
                + " FROM external_sync_bundle_files bf JOIN changes ch ON ch.id=bf.change_id"
                + " WHERE ch.project_id=? AND ch.commit_id IS NULL"
                + " AND (ch.branch_id IS NULL OR ch.branch_id=?) AND ch.id<=? ORDER BY bf.path")) {
          query.setInt(1, projectId); query.setInt(2, branchId); query.setInt(3, targetId);
          try (ResultSet rs = query.executeQuery()) {
            while (rs.next()) bundles.computeIfAbsent(rs.getInt(1), key -> new ArrayList<>())
                .add(new HistoricalBundleFile(rs.getString(2), rs.getString(3), rs.getBytes(4), rs.getString(5), rs.getBytes(6)));
          }
        }
        connection.commit();
        return new PendingReplayInput(new ReplayInput(projectId, headCommit, root, temp, head, List.copyOf(rows), bundles), branchId, branchName, currentRevision);
      } catch (Exception error) { connection.rollback(); throw error; }
    }
  }

  public record PendingReplayInput(ReplayInput replay, int branchId, String branchName, String revision) {}

  public record HistoricalBundleFile(
      String path,
      String beforeKind,
      byte[] beforeContent,
      String afterKind,
      byte[] afterContent) {}

  public record ReplayInput(
      int projectId,
      int commitId,
      String root,
      String temp,
      String gitId,
      List<ChangeRow> rows,
      java.util.Map<Integer, List<HistoricalBundleFile>> bundles) {}

  // -------------------------------------------------------------------------
  // Value type
  // -------------------------------------------------------------------------

  public static final class ChangeRow {
    public final int id;
    public final String changeType;
    public final String scope;
    public final String reqBody;

    public ChangeRow(int id, String changeType, String scope, String reqBody) {
      this.id = id;
      this.changeType = changeType;
      this.scope = scope;
      this.reqBody = reqBody;
    }
  }
}
