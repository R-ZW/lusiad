-- Execute MANUALMENTE no banco configurado (USE seu_banco).
-- Pré-requisito: migração P26/P28 aplicada. Não limpa nem reescreve dados.
-- Mantém a ordem/índices dos três valores anteriores do ENUM; adiciona move ao final.
-- Reaplicável em schemas com os valores P26/P28/Pasta-move conhecidos.
ALTER TABLE lusiad_project_operations
  MODIFY COLUMN kind ENUM('remove','delete','relink','move') NOT NULL;
