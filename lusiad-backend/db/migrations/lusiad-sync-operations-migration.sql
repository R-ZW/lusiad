-- P11/P12. Selecione SEU banco e faça backup antes de executar manualmente.
-- Aditiva e reaplicável; não altera eventos, bundles ou baselines existentes.
CREATE TABLE IF NOT EXISTS lusiad_sync_operations (
  operation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  project_id INT NOT NULL,
  state ENUM('prepared','applied','aborted') NOT NULL,
  payload JSON DEFAULT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY(operation_id),
  KEY IDX_sync_operation_pending(project_id,state,created_at),
  CONSTRAINT FK_sync_operation_project FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
