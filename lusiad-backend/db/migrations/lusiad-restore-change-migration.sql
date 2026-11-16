-- P23.2. Execute manualmente depois da migração P23.1, uma única vez.
-- O vínculo identifica a mudança após a qual o estado foi reconstruído.
ALTER TABLE commits
  ADD COLUMN restored_from_change_id INT NULL,
  ADD KEY IDX_commit_restore_change (restored_from_change_id),
  ADD CONSTRAINT FK_commit_restore_change FOREIGN KEY (restored_from_change_id) REFERENCES changes(id);
