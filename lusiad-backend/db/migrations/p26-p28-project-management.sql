-- P26/P28. Execute MANUALMENTE no banco configurado (USE seu_banco).
-- Aditiva e reaplicável. Não limpa nem altera cadastros/históricos existentes.
-- Sem FK para projects: o recibo precisa sobreviver à remoção confirmada do cadastro.
-- payload contém apenas a recuperação em andamento; é apagado ao concluir/abortar.
CREATE TABLE IF NOT EXISTS lusiad_project_operations (
  operation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  project_id INT NOT NULL,
  kind ENUM('remove','delete','relink','move') NOT NULL,
  state ENUM('prepared','applied','completed','aborted') NOT NULL,
  payload JSON DEFAULT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY(operation_id),
  KEY IDX_project_operation_pending(project_id,state,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
