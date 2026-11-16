-- P23.1. Aplique manualmente no banco Lusiad antes de iniciar a nova versão.
-- Faça backup antes; este script não altera commits existentes.
ALTER TABLE commits
  ADD COLUMN restored_from_commit_id INT NULL,
  ADD KEY IDX_commit_restore_source (restored_from_commit_id),
  ADD CONSTRAINT FK_commit_restore_source FOREIGN KEY (restored_from_commit_id) REFERENCES commits(id);
