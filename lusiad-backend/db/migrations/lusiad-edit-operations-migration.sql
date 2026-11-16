-- P05.2: additive, manual migration. Select your existing database before running.
-- Requires the existing projects/changes/external_sync tables (InnoDB, MySQL 8).
-- Does not rewrite or delete historical changes. Re-running is safe.
CREATE TABLE IF NOT EXISTS lusiad_edit_operations (
  id BIGINT NOT NULL AUTO_INCREMENT,
  operation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  project_id INT NOT NULL,
  branch_id INT DEFAULT NULL,
  state ENUM('prepared','applied','aborted') NOT NULL,
  payload JSON DEFAULT NULL,
  change_id INT DEFAULT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY UQ_edit_operation_id (operation_id),
  KEY IDX_edit_operation_pending (project_id,state,id),
  CONSTRAINT FK_edit_operation_project FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
