-- Disposable test schema only. No CREATE DATABASE, USE or application data.
-- The owned lab launcher supplies a fresh schema and stamps lusiad_test_context.
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE IF NOT EXISTS `branches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `base` int DEFAULT NULL COMMENT 'refere-se ao id da branch "mãe" do registro',
  `active` enum('0','1') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT 'inativa = 0, ativa = 1',
  `selected` enum('0','1') COLLATE utf8mb4_general_ci NOT NULL COMMENT 'inativa = 0, ativa = 1',
  `name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK__project_id` (`project_id`),
  KEY `FK__branch_base` (`base`),
  CONSTRAINT `FK__branch_base` FOREIGN KEY (`base`) REFERENCES `branches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK__project_id` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `changes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `commit_id` int DEFAULT NULL,
  `project_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `summary` text COLLATE utf8mb4_general_ci NOT NULL,
  `description` text COLLATE utf8mb4_general_ci,
  `date_time` datetime NOT NULL,
  `change_type` enum('create','update','move','delete','file_create','file_rename','file_delete','file_move','dir_create','dir_rename','dir_delete','dir_move','external_bundle') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `scope` enum('file','dir','project') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `req_body` json NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK__commit_id` (`commit_id`),
  KEY `FK__changes_project_id` (`project_id`),
  KEY `IDX_changes_branch_id` (`branch_id`),
  CONSTRAINT `FK__changes_project_id` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK__commit_id` FOREIGN KEY (`commit_id`) REFERENCES `commits` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `commit_change_sets` (
  `git_id` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `project_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `change_id` int NOT NULL,
  PRIMARY KEY (`git_id`,`change_id`),
  KEY `IDX_commit_change_sets_project_branch` (`project_id`,`branch_id`,`git_id`),
  KEY `IDX_commit_change_sets_change` (`change_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `commits` (
  `id` int NOT NULL AUTO_INCREMENT,
  `git_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `branch_id` int NOT NULL,
  `prev` int DEFAULT NULL,
  `next` int DEFAULT NULL,
  `summary` varchar(255) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '',
  `description` text COLLATE utf8mb4_general_ci,
  `timestamp` datetime NOT NULL,
  `is_merge_commit` enum('0','1') COLLATE utf8mb4_general_ci NOT NULL,
  `is_new_branch_commit` enum('0','1') COLLATE utf8mb4_general_ci NOT NULL,
  `restored_from_commit_id` int DEFAULT NULL,
  `restored_from_change_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK__commit_prev` (`prev`),
  KEY `FK__commit_next` (`next`),
  KEY `IDX_commit_restore_source` (`restored_from_commit_id`),
  KEY `IDX_commit_restore_change` (`restored_from_change_id`),
  CONSTRAINT `FK__commit_next` FOREIGN KEY (`next`) REFERENCES `commits` (`id`),
  CONSTRAINT `FK__commit_prev` FOREIGN KEY (`prev`) REFERENCES `commits` (`id`),
  CONSTRAINT `FK_commit_restore_source` FOREIGN KEY (`restored_from_commit_id`) REFERENCES `commits` (`id`),
  CONSTRAINT `FK_commit_restore_change` FOREIGN KEY (`restored_from_change_id`) REFERENCES `changes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `external_sync_bundle_files` (
  `change_id` int NOT NULL,
  `path` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `kind` enum('added','modified','deleted') COLLATE utf8mb4_general_ci NOT NULL,
  `before_kind` enum('file','directory') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `after_kind` enum('file','directory') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `before_content` longblob,
  `after_content` longblob,
  PRIMARY KEY (`change_id`,`path`),
  CONSTRAINT `FK_external_sync_bundle_change` FOREIGN KEY (`change_id`) REFERENCES `changes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `external_sync_files` (
  `project_id` int NOT NULL,
  `path` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `kind` enum('file','directory') COLLATE utf8mb4_general_ci NOT NULL,
  `content` longblob,
  `sha256` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (`project_id`,`path`),
  CONSTRAINT `FK_external_sync_file_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `external_sync_projects` (
  `project_id` int NOT NULL,
  `initialized_at` datetime NOT NULL,
  `pending_bundle_change_id` int DEFAULT NULL,
  PRIMARY KEY (`project_id`),
  KEY `IDX_external_sync_pending_bundle` (`pending_bundle_change_id`),
  CONSTRAINT `FK_external_sync_pending_bundle` FOREIGN KEY (`pending_bundle_change_id`) REFERENCES `changes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `FK_external_sync_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `lusiad_history_tags` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `name` varchar(80) COLLATE utf8mb4_general_ci NOT NULL,
  `name_key` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `commit_id` int DEFAULT NULL,
  `change_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_history_tags_project_name` (`project_id`,`name_key`),
  KEY `IDX_history_tags_commit` (`commit_id`),
  KEY `IDX_history_tags_change` (`change_id`),
  CONSTRAINT `FK_history_tags_change` FOREIGN KEY (`change_id`) REFERENCES `changes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_history_tags_commit` FOREIGN KEY (`commit_id`) REFERENCES `commits` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_history_tags_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `CK_history_tags_one_target` CHECK (((`commit_id` is null) <> (`change_id` is null)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `projects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `path` text COLLATE utf8mb4_general_ci NOT NULL,
  `temp_path` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `name` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_general_ci,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `lusiad_test_context` (
  `singleton` tinyint NOT NULL PRIMARY KEY,
  `run_id` char(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `config_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `schema_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT `CHK_test_context_singleton` CHECK (`singleton` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS=1;

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

-- P11/P12: durable external synchronization decisions.
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
