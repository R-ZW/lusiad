-- Aplicar MANUALMENTE no banco lusiad existente. Nao executar src/lusiad.sql:
-- aquele arquivo e um dump completo e apaga/recria o banco.
USE `lusiad`;

ALTER TABLE `changes`
  MODIFY COLUMN `change_type`
  ENUM('create','update','move','delete','file_create','file_rename','file_delete','file_move',
       'dir_create','dir_rename','dir_delete','dir_move','external_bundle')
  CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL;

CREATE TABLE IF NOT EXISTS `external_sync_projects` (
  `project_id` int NOT NULL,
  `initialized_at` datetime NOT NULL,
  `pending_bundle_change_id` int DEFAULT NULL,
  PRIMARY KEY (`project_id`),
  KEY `IDX_external_sync_pending_bundle` (`pending_bundle_change_id`),
  CONSTRAINT `FK_external_sync_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_external_sync_pending_bundle` FOREIGN KEY (`pending_bundle_change_id`) REFERENCES `changes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `external_sync_files` (
  `project_id` int NOT NULL,
  `path` varchar(512) COLLATE utf8mb4_bin NOT NULL,
  `kind` enum('file','directory') NOT NULL,
  `content` longblob,
  `sha256` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (`project_id`,`path`),
  CONSTRAINT `FK_external_sync_file_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `external_sync_bundle_files` (
  `change_id` int NOT NULL,
  `path` varchar(512) COLLATE utf8mb4_bin NOT NULL,
  `kind` enum('added','modified','deleted') NOT NULL,
  `before_kind` enum('file','directory') DEFAULT NULL,
  `after_kind` enum('file','directory') DEFAULT NULL,
  `before_content` longblob,
  `after_content` longblob,
  PRIMARY KEY (`change_id`,`path`),
  CONSTRAINT `FK_external_sync_bundle_change` FOREIGN KEY (`change_id`) REFERENCES `changes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
