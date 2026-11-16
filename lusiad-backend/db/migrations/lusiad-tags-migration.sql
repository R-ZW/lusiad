-- Execute somente este arquivo no banco Lusiad existente (MySQL 8).
-- No HeidiSQL: selecione o banco usado pela ferramenta, abra este arquivo em
-- uma aba de consulta e execute. Não execute lusiad.sql, que recria o banco.
-- A operação é aditiva, pode ser repetida e não altera o histórico existente.

CREATE TABLE IF NOT EXISTS `lusiad_history_tags` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `name` varchar(80) NOT NULL,
  `name_key` varchar(160) COLLATE utf8mb4_bin NOT NULL,
  `commit_id` int DEFAULT NULL,
  `change_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_history_tags_project_name` (`project_id`, `name_key`),
  KEY `IDX_history_tags_commit` (`commit_id`),
  KEY `IDX_history_tags_change` (`change_id`),
  CONSTRAINT `CK_history_tags_one_target` CHECK ((`commit_id` IS NULL) <> (`change_id` IS NULL)),
  CONSTRAINT `FK_history_tags_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_history_tags_commit` FOREIGN KEY (`commit_id`) REFERENCES `commits` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_history_tags_change` FOREIGN KEY (`change_id`) REFERENCES `changes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Cada nome pertence a uma versão no projeto. É possível colocar várias tags
-- no mesmo registro. Uma mudança pendente pode receber uma tag; a comparação
-- dessa versão só estará disponível depois que a mudança receber um commit.
SHOW CREATE TABLE `lusiad_history_tags`;
