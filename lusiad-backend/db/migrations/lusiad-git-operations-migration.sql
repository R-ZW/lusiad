-- P06.1: select your configured database, back it up, then run this file manually.
-- Additive and rerunnable. Does not rewrite existing commits/events or repair legacy links.
CREATE TABLE IF NOT EXISTS lusiad_git_operations (
  operation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  project_id INT NOT NULL,
  state ENUM('prepared','applied') NOT NULL,
  payload JSON NOT NULL,
  commit_id INT DEFAULT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY(operation_id),
  KEY IDX_git_operation_project_state(project_id,state),
  CONSTRAINT FK_git_operation_project FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Some existing installations already have this table; keep its data.
CREATE TABLE IF NOT EXISTS commit_change_sets (
  git_id VARCHAR(100) NOT NULL,
  project_id INT NOT NULL,
  branch_id INT NOT NULL,
  change_id INT NOT NULL,
  PRIMARY KEY(git_id,change_id),
  KEY IDX_commit_change_sets_project_branch(project_id,branch_id,git_id),
  KEY IDX_commit_change_sets_change(change_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
