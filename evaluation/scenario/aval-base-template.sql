-- --------------------------------------------------------
-- Servidor:                     127.0.0.1
-- Versão do servidor:           8.0.44 - MySQL Community Server - GPL
-- OS do Servidor:               Win64
-- HeidiSQL Versão:              12.14.0.7165
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Copiando estrutura do banco de dados para lusiad
CREATE DATABASE IF NOT EXISTS `lusiad` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `lusiad`;

-- Copiando estrutura para tabela lusiad.branches
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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela lusiad.branches: ~8 rows (aproximadamente)
INSERT INTO `branches` (`id`, `project_id`, `base`, `active`, `selected`, `name`) VALUES
	(1, 1, NULL, '1', '1', 'master');

-- Copiando estrutura para tabela lusiad.changes
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
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela lusiad.changes: ~47 rows (aproximadamente)
INSERT INTO `changes` (`id`, `commit_id`, `project_id`, `branch_id`, `summary`, `description`, `date_time`, `change_type`, `scope`, `req_body`) VALUES
	(1, 2, 1, 1, 'Field limite changed', '', '2026-11-08 15:34:49', 'update', 'file', '{"path": "HistoricoExemplo.java", "afterHash": "ccb87e36af907dfa2ab2772930d6662520b3718548fe1ce7c1109043a545cfb6", "afterText": "public class HistoricoExemplo {\\n  private int limite = 20;\\n\\n  public void exibirMensagem() {\\n    System.out.println(\\"Olá\\");\\n  }\\n\\n  public void encerrar() {\\n    System.out.println(\\"Fim\\");\\n  }\\n}\\n", "endOffset": "58", "resources": {"after": {"roots": ["HistoricoExemplo.java"], "entries": {"HistoricoExemplo.java": {"kind": "file", "content": "cHVibGljIGNsYXNzIEhpc3Rvcmljb0V4ZW1wbG8gew0KICBwcml2YXRlIGludCBsaW1pdGUgPSAyMDsNCg0KICBwdWJsaWMgdm9pZCBleGliaXJNZW5zYWdlbSgpIHsNCiAgICBTeXN0ZW0ub3V0LnByaW50bG4oIk9sw6EiKTsNCiAgfQ0KDQogIHB1YmxpYyB2b2lkIGVuY2VycmFyKCkgew0KICAgIFN5c3RlbS5vdXQucHJpbnRsbigiRmltIik7DQogIH0NCn0NCg=="}}}, "before": {"roots": ["HistoricoExemplo.java"], "entries": {"HistoricoExemplo.java": {"kind": "file", "content": "cHVibGljIGNsYXNzIEhpc3Rvcmljb0V4ZW1wbG8gew0KICBwcml2YXRlIGludCBsaW1pdGUgPSAxMDsNCg0KICBwdWJsaWMgdm9pZCBleGliaXJNZW5zYWdlbSgpIHsNCiAgICBTeXN0ZW0ub3V0LnByaW50bG4oIk9sw6EiKTsNCiAgfQ0KDQogIHB1YmxpYyB2b2lkIGVuY2VycmFyKCkgew0KICAgIFN5c3RlbS5vdXQucHJpbnRsbigiRmltIik7DQogIH0NCn0="}}}}, "beforeHash": "5f74a22b5f1498c869d64e1435bbb8120b40831441f70a922cb31cd4979ac7eb", "beforeText": "public class HistoricoExemplo {\\n  private int limite = 10;\\n\\n  public void exibirMensagem() {\\n    System.out.println(\\"Olá\\");\\n  }\\n\\n  public void encerrar() {\\n    System.out.println(\\"Fim\\");\\n  }\\n}", "newContent": "private int limite = 20;", "operationId": "94632188-7047-47ae-85eb-0e9795a9bf48", "startOffset": "34", "undoSession": "e0ec1b8e-425d-4652-85ca-64cb78a3909f", "undoBoundary": "__PROJECT_PATH__:1:1:0", "recordVersion": 2, "changeMetadata": {"kind": "code", "after": {"path": "HistoricoExemplo.java", "range": {"end": 58, "start": 34, "endLine": 2, "endColumn": 26, "startLine": 2, "startColumn": 3}, "context": [{"kind": "class", "name": "HistoricoExemplo"}], "element": {"kind": "field", "name": "limite"}}, "action": "update", "before": {"path": "HistoricoExemplo.java", "range": {"end": 58, "start": 34, "endLine": 2, "endColumn": 26, "startLine": 2, "startColumn": 3}, "context": [{"kind": "class", "name": "HistoricoExemplo"}], "element": {"kind": "field", "name": "limite"}}, "version": 1, "differences": [{"after": "20", "field": "expression", "before": "10"}]}, "operationOrder": 1, "allowWithoutUndo": "false"}'),
	(2, 2, 1, 1, 'Field rotulo added', '', '2026-11-08 15:35:27', 'create', 'file', '{"line": "2", "path": "HistoricoExemplo.java", "content": "private String rotulo = \\"Inicial\\";\\n", "lineEnd": "3", "afterHash": "337ac53408f084f4cea6201fd32a10fd7ba58a905943544beb01d46b601f3d30", "afterText": "public class HistoricoExemplo {\\n  private int limite = 20;\\n  private String rotulo = \\"Inicial\\";\\n\\n  public void exibirMensagem() {\\n    System.out.println(\\"Olá\\");\\n  }\\n\\n  public void encerrar() {\\n    System.out.println(\\"Fim\\");\\n  }\\n}\\n", "resources": {"after": {"roots": ["HistoricoExemplo.java"], "entries": {"HistoricoExemplo.java": {"kind": "file", "content": "cHVibGljIGNsYXNzIEhpc3Rvcmljb0V4ZW1wbG8gew0KICBwcml2YXRlIGludCBsaW1pdGUgPSAyMDsNCiAgcHJpdmF0ZSBTdHJpbmcgcm90dWxvID0gIkluaWNpYWwiOw0KDQogIHB1YmxpYyB2b2lkIGV4aWJpck1lbnNhZ2VtKCkgew0KICAgIFN5c3RlbS5vdXQucHJpbnRsbigiT2zDoSIpOw0KICB9DQoNCiAgcHVibGljIHZvaWQgZW5jZXJyYXIoKSB7DQogICAgU3lzdGVtLm91dC5wcmludGxuKCJGaW0iKTsNCiAgfQ0KfQ0K"}}}, "before": {"roots": ["HistoricoExemplo.java"], "entries": {"HistoricoExemplo.java": {"kind": "file", "content": "cHVibGljIGNsYXNzIEhpc3Rvcmljb0V4ZW1wbG8gew0KICBwcml2YXRlIGludCBsaW1pdGUgPSAyMDsNCg0KICBwdWJsaWMgdm9pZCBleGliaXJNZW5zYWdlbSgpIHsNCiAgICBTeXN0ZW0ub3V0LnByaW50bG4oIk9sw6EiKTsNCiAgfQ0KDQogIHB1YmxpYyB2b2lkIGVuY2VycmFyKCkgew0KICAgIFN5c3RlbS5vdXQucHJpbnRsbigiRmltIik7DQogIH0NCn0NCg=="}}}}, "beforeHash": "ccb87e36af907dfa2ab2772930d6662520b3718548fe1ce7c1109043a545cfb6", "beforeText": "public class HistoricoExemplo {\\n  private int limite = 20;\\n\\n  public void exibirMensagem() {\\n    System.out.println(\\"Olá\\");\\n  }\\n\\n  public void encerrar() {\\n    System.out.println(\\"Fim\\");\\n  }\\n}\\n", "operationId": "bee355d0-625a-4193-82e5-7ee9d71d1172", "undoSession": "e0ec1b8e-425d-4652-85ca-64cb78a3909f", "undoBoundary": "__PROJECT_PATH__:1:1:0", "recordVersion": 2, "changeMetadata": {"kind": "code", "after": {"path": "HistoricoExemplo.java", "range": {"end": 95, "start": 61, "endLine": 3, "endColumn": 36, "startLine": 3, "startColumn": 3}, "context": [{"kind": "class", "name": "HistoricoExemplo"}], "element": {"kind": "field", "name": "rotulo"}}, "action": "create", "before": null, "version": 1, "differences": []}, "operationOrder": 2, "insertedContent": "private String rotulo = \\"Inicial\\";\\n", "allowWithoutUndo": "false", "componentPlacement": "true"}'),
	(3, 2, 1, 1, 'Method encerrar() moved', '', '2026-11-08 15:35:42', 'move', 'file', '{"line": "4", "path": "HistoricoExemplo.java", "afterHash": "f8ff06477fbcabaa173d3a954e268478671e5950aa911cbe4316452ee7c391c5", "afterText": "public class HistoricoExemplo {\\n  private int limite = 20;\\n  private String rotulo = \\"Inicial\\";\\n\\n  public void encerrar() {\\n    System.out.println(\\"Fim\\");\\n  }\\n\\n  public void exibirMensagem() {\\n    System.out.println(\\"Olá\\");\\n  }\\n}\\n", "endOffset": "227", "resources": {"after": {"roots": ["HistoricoExemplo.java"], "entries": {"HistoricoExemplo.java": {"kind": "file", "content": "cHVibGljIGNsYXNzIEhpc3Rvcmljb0V4ZW1wbG8gew0KICBwcml2YXRlIGludCBsaW1pdGUgPSAyMDsNCiAgcHJpdmF0ZSBTdHJpbmcgcm90dWxvID0gIkluaWNpYWwiOw0KDQogIHB1YmxpYyB2b2lkIGVuY2VycmFyKCkgew0KICAgIFN5c3RlbS5vdXQucHJpbnRsbigiRmltIik7DQogIH0NCg0KICBwdWJsaWMgdm9pZCBleGliaXJNZW5zYWdlbSgpIHsNCiAgICBTeXN0ZW0ub3V0LnByaW50bG4oIk9sw6EiKTsNCiAgfQ0KfQ0K"}}}, "before": {"roots": ["HistoricoExemplo.java"], "entries": {"HistoricoExemplo.java": {"kind": "file", "content": "cHVibGljIGNsYXNzIEhpc3Rvcmljb0V4ZW1wbG8gew0KICBwcml2YXRlIGludCBsaW1pdGUgPSAyMDsNCiAgcHJpdmF0ZSBTdHJpbmcgcm90dWxvID0gIkluaWNpYWwiOw0KDQogIHB1YmxpYyB2b2lkIGV4aWJpck1lbnNhZ2VtKCkgew0KICAgIFN5c3RlbS5vdXQucHJpbnRsbigiT2zDoSIpOw0KICB9DQoNCiAgcHVibGljIHZvaWQgZW5jZXJyYXIoKSB7DQogICAgU3lzdGVtLm91dC5wcmludGxuKCJGaW0iKTsNCiAgfQ0KfQ0K"}}}}, "beforeHash": "337ac53408f084f4cea6201fd32a10fd7ba58a905943544beb01d46b601f3d30", "beforeText": "public class HistoricoExemplo {\\n  private int limite = 20;\\n  private String rotulo = \\"Inicial\\";\\n\\n  public void exibirMensagem() {\\n    System.out.println(\\"Olá\\");\\n  }\\n\\n  public void encerrar() {\\n    System.out.println(\\"Fim\\");\\n  }\\n}\\n", "operationId": "b22da5cd-bcce-4e3a-9f2e-9c2f1b382c6e", "startOffset": "168", "undoSession": "e0ec1b8e-425d-4652-85ca-64cb78a3909f", "undoBoundary": "__PROJECT_PATH__:1:1:0", "recordVersion": 2, "changeMetadata": {"kind": "code", "after": {"path": "HistoricoExemplo.java", "range": {"end": 158, "start": 99, "endLine": 7, "endColumn": 3, "startLine": 5, "startColumn": 3}, "context": [{"kind": "class", "name": "HistoricoExemplo"}], "element": {"kind": "method", "name": "encerrar()"}}, "action": "move", "before": {"path": "HistoricoExemplo.java", "range": {"end": 227, "start": 168, "endLine": 11, "endColumn": 3, "startLine": 9, "startColumn": 3}, "context": [{"kind": "class", "name": "HistoricoExemplo"}], "element": {"kind": "method", "name": "encerrar()"}}, "version": 1, "differences": []}, "operationOrder": 3, "insertedContent": "public void encerrar() {\\n    System.out.println(\\"Fim\\");\\n  }\\n", "allowWithoutUndo": "false", "componentPlacement": "true"}'),
	(4, 3, 1, 1, 'Field limite changed', '', '2026-11-08 15:36:55', 'update', 'file', '{"path": "HistoricoExemplo.java", "afterHash": "e5905a59a2aff7175918266d95c1e55c6f056c66dda59dd8706d9857268bd6e5", "afterText": "public class HistoricoExemplo {\\n  private int limite = 30;\\n  private String rotulo = \\"Inicial\\";\\n\\n  public void encerrar() {\\n    System.out.println(\\"Fim\\");\\n  }\\n\\n  public void exibirMensagem() {\\n    System.out.println(\\"Olá\\");\\n  }\\n}\\n", "endOffset": "58", "resources": {"after": {"roots": ["HistoricoExemplo.java"], "entries": {"HistoricoExemplo.java": {"kind": "file", "content": "cHVibGljIGNsYXNzIEhpc3Rvcmljb0V4ZW1wbG8gew0KICBwcml2YXRlIGludCBsaW1pdGUgPSAzMDsNCiAgcHJpdmF0ZSBTdHJpbmcgcm90dWxvID0gIkluaWNpYWwiOw0KDQogIHB1YmxpYyB2b2lkIGVuY2VycmFyKCkgew0KICAgIFN5c3RlbS5vdXQucHJpbnRsbigiRmltIik7DQogIH0NCg0KICBwdWJsaWMgdm9pZCBleGliaXJNZW5zYWdlbSgpIHsNCiAgICBTeXN0ZW0ub3V0LnByaW50bG4oIk9sw6EiKTsNCiAgfQ0KfQ0K"}}}, "before": {"roots": ["HistoricoExemplo.java"], "entries": {"HistoricoExemplo.java": {"kind": "file", "content": "cHVibGljIGNsYXNzIEhpc3Rvcmljb0V4ZW1wbG8gew0KICBwcml2YXRlIGludCBsaW1pdGUgPSAyMDsNCiAgcHJpdmF0ZSBTdHJpbmcgcm90dWxvID0gIkluaWNpYWwiOw0KDQogIHB1YmxpYyB2b2lkIGVuY2VycmFyKCkgew0KICAgIFN5c3RlbS5vdXQucHJpbnRsbigiRmltIik7DQogIH0NCg0KICBwdWJsaWMgdm9pZCBleGliaXJNZW5zYWdlbSgpIHsNCiAgICBTeXN0ZW0ub3V0LnByaW50bG4oIk9sw6EiKTsNCiAgfQ0KfQ0K"}}}}, "beforeHash": "f8ff06477fbcabaa173d3a954e268478671e5950aa911cbe4316452ee7c391c5", "beforeText": "public class HistoricoExemplo {\\n  private int limite = 20;\\n  private String rotulo = \\"Inicial\\";\\n\\n  public void encerrar() {\\n    System.out.println(\\"Fim\\");\\n  }\\n\\n  public void exibirMensagem() {\\n    System.out.println(\\"Olá\\");\\n  }\\n}\\n", "newContent": "private int limite = 30;", "operationId": "a6ff9a66-8f6e-463a-8757-425a472fc83a", "startOffset": "34", "undoSession": "e0ec1b8e-425d-4652-85ca-64cb78a3909f", "undoBoundary": "__PROJECT_PATH__:1:2:0", "recordVersion": 2, "changeMetadata": {"kind": "code", "after": {"path": "HistoricoExemplo.java", "range": {"end": 58, "start": 34, "endLine": 2, "endColumn": 26, "startLine": 2, "startColumn": 3}, "context": [{"kind": "class", "name": "HistoricoExemplo"}], "element": {"kind": "field", "name": "limite"}}, "action": "update", "before": {"path": "HistoricoExemplo.java", "range": {"end": 58, "start": 34, "endLine": 2, "endColumn": 26, "startLine": 2, "startColumn": 3}, "context": [{"kind": "class", "name": "HistoricoExemplo"}], "element": {"kind": "field", "name": "limite"}}, "version": 1, "differences": [{"after": "30", "field": "expression", "before": "20"}]}, "operationOrder": 4, "allowWithoutUndo": "false"}');

-- Copiando estrutura para tabela lusiad.commit_change_sets
CREATE TABLE IF NOT EXISTS `commit_change_sets` (
  `git_id` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `project_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `change_id` int NOT NULL,
  PRIMARY KEY (`git_id`,`change_id`),
  KEY `IDX_commit_change_sets_project_branch` (`project_id`,`branch_id`,`git_id`),
  KEY `IDX_commit_change_sets_change` (`change_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela lusiad.commit_change_sets: ~46 rows (aproximadamente)
INSERT INTO `commit_change_sets` (`git_id`, `project_id`, `branch_id`, `change_id`) VALUES
	('ededce5c07883290e300e4bbf4752a2a8a34f270', 1, 1, 1),
	('ededce5c07883290e300e4bbf4752a2a8a34f270', 1, 1, 2),
	('ededce5c07883290e300e4bbf4752a2a8a34f270', 1, 1, 3),
	('9ca1db2b0a1109f87b3b5e081e52e54d491b52c6', 1, 1, 4);

-- Copiando estrutura para tabela lusiad.commits
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
  CONSTRAINT `FK_commit_restore_change` FOREIGN KEY (`restored_from_change_id`) REFERENCES `changes` (`id`),
  CONSTRAINT `FK_commit_restore_source` FOREIGN KEY (`restored_from_commit_id`) REFERENCES `commits` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela lusiad.commits: ~18 rows (aproximadamente)
INSERT INTO `commits` (`id`, `git_id`, `branch_id`, `prev`, `next`, `summary`, `description`, `timestamp`, `is_merge_commit`, `is_new_branch_commit`, `restored_from_commit_id`, `restored_from_change_id`) VALUES
	(1, 'a4406d8b5c3422732394cf5c52dac58b91281bb5', 1, NULL, 2, 'Lusiad: initial project snapshot', 'Technical baseline captured before the first tracked change; no user files were created.', '2026-11-08 15:34:03', '0', '0', NULL, NULL),
	(2, 'ededce5c07883290e300e4bbf4752a2a8a34f270', 1, 1, 3, 'B - Alterações registradas', NULL, '2026-11-08 15:36:33', '0', '0', NULL, NULL),
	(3, '9ca1db2b0a1109f87b3b5e081e52e54d491b52c6', 1, 2, NULL, 'C - Estado posterior', NULL, '2026-11-08 15:37:13', '0', '0', NULL, NULL);

-- Copiando estrutura para tabela lusiad.external_sync_bundle_files
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

-- Copiando dados para a tabela lusiad.external_sync_bundle_files: ~2 rows (aproximadamente)

-- Copiando estrutura para tabela lusiad.external_sync_files
CREATE TABLE IF NOT EXISTS `external_sync_files` (
  `project_id` int NOT NULL,
  `path` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `kind` enum('file','directory') COLLATE utf8mb4_general_ci NOT NULL,
  `content` longblob,
  `sha256` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (`project_id`,`path`),
  CONSTRAINT `FK_external_sync_file_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela lusiad.external_sync_files: ~23 rows (aproximadamente)
INSERT INTO `external_sync_files` (`project_id`, `path`, `kind`, `content`, `sha256`) VALUES
	(1, 'Construcao.java', 'file', _binary 0x7075626c696320636c61737320436f6e7374727563616f207b0d0a0d0a20207075626c696320766f6964206578697374656e74652829207b0d0a2020202053797374656d2e6f75742e7072696e746c6e28224dc3a9746f646f206578697374656e746522293b0d0a20207d0d0a7d, 'ba5d0bf035db8417f8ce789546c271e4f7f5a76b9fe7d79f36e88371b59f52fe'),
	(1, 'HistoricoExemplo.java', 'file', _binary 0x7075626c696320636c61737320486973746f7269636f4578656d706c6f207b0d0a20207072697661746520696e74206c696d697465203d2033303b0d0a20207072697661746520537472696e6720726f74756c6f203d2022496e696369616c223b0d0a0d0a20207075626c696320766f696420656e6365727261722829207b0d0a2020202053797374656d2e6f75742e7072696e746c6e282246696d22293b0d0a20207d0d0a0d0a20207075626c696320766f6964206578696269724d656e736167656d2829207b0d0a2020202053797374656d2e6f75742e7072696e746c6e28224f6cc3a122293b0d0a20207d0d0a7d0d0a, '12e5fc691e5cc5efeebd4813724369751479584046acf1a37667b86443880b2b'),
	(1, 'Organizacao.java', 'file', _binary 0x7075626c696320636c617373204f7267616e697a6163616f207b0d0a20207072697661746520696e74206c696d697465203d2031303b0d0a0d0a20207075626c696320766f696420696e69636961722829207b0d0a2020202053797374656d2e6f75742e7072696e746c6e2822496ec3ad63696f22293b0d0a20207d0d0a0d0a20202f2f20436f6d656e74c3a172696f2074656d706f72c3a172696f0d0a20207075626c696320766f696420656e6365727261722829207b0d0a2020202053797374656d2e6f75742e7072696e746c6e282246696d22293b0d0a20207d0d0a7d, 'd3e62f52aae9d388b2f41aa25dbf1c6cdeb8854d7e0b6bbddf026b748bfa7ae4');

-- Copiando estrutura para tabela lusiad.external_sync_projects
CREATE TABLE IF NOT EXISTS `external_sync_projects` (
  `project_id` int NOT NULL,
  `initialized_at` datetime NOT NULL,
  `pending_bundle_change_id` int DEFAULT NULL,
  PRIMARY KEY (`project_id`),
  KEY `IDX_external_sync_pending_bundle` (`pending_bundle_change_id`),
  CONSTRAINT `FK_external_sync_pending_bundle` FOREIGN KEY (`pending_bundle_change_id`) REFERENCES `changes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `FK_external_sync_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela lusiad.external_sync_projects: ~4 rows (aproximadamente)
INSERT INTO `external_sync_projects` (`project_id`, `initialized_at`, `pending_bundle_change_id`) VALUES
	(1, '2026-11-08 15:34:06', NULL);

-- Copiando estrutura para tabela lusiad.lusiad_edit_operations
CREATE TABLE IF NOT EXISTS `lusiad_edit_operations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `operation_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `project_id` int NOT NULL,
  `branch_id` int DEFAULT NULL,
  `state` enum('prepared','applied','aborted') COLLATE utf8mb4_general_ci NOT NULL,
  `payload` json DEFAULT NULL,
  `change_id` int DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_edit_operation_id` (`operation_id`),
  KEY `IDX_edit_operation_pending` (`project_id`,`state`,`id`),
  CONSTRAINT `FK_edit_operation_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela lusiad.lusiad_edit_operations: ~45 rows (aproximadamente)
INSERT INTO `lusiad_edit_operations` (`id`, `operation_id`, `project_id`, `branch_id`, `state`, `payload`, `change_id`, `created_at`) VALUES
	(1, '94632188-7047-47ae-85eb-0e9795a9bf48', 1, 1, 'applied', NULL, 1, '2026-11-08 15:34:49.545357'),
	(2, 'bee355d0-625a-4193-82e5-7ee9d71d1172', 1, 1, 'applied', NULL, 2, '2026-11-08 15:35:27.959721'),
	(3, 'b22da5cd-bcce-4e3a-9f2e-9c2f1b382c6e', 1, 1, 'applied', NULL, 3, '2026-11-08 15:35:42.836666'),
	(4, 'a6ff9a66-8f6e-463a-8757-425a472fc83a', 1, 1, 'applied', NULL, 4, '2026-11-08 15:36:55.217030');

-- Copiando estrutura para tabela lusiad.lusiad_git_operations
CREATE TABLE IF NOT EXISTS `lusiad_git_operations` (
  `operation_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `project_id` int NOT NULL,
  `state` enum('prepared','applied') COLLATE utf8mb4_general_ci NOT NULL,
  `payload` json NOT NULL,
  `commit_id` int DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`operation_id`),
  KEY `IDX_git_operation_project_state` (`project_id`,`state`),
  CONSTRAINT `FK_git_operation_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela lusiad.lusiad_git_operations: ~19 rows (aproximadamente)
INSERT INTO `lusiad_git_operations` (`operation_id`, `project_id`, `state`, `payload`, `commit_id`, `created_at`) VALUES
	('084f84af-2a04-40d6-be14-144affa85044', 1, 'applied', '{"plan": {"id": "084f84af-2a04-40d6-be14-144affa85044", "ref": "refs/heads/master", "sha": "ededce5c07883290e300e4bbf4752a2a8a34f270", "kind": "commit", "tree": "eb54c8768206c77981a3c056123a574993c4a042", "before": "a4406d8b5c3422732394cf5c52dac58b91281bb5", "source": "a4406d8b5c3422732394cf5c52dac58b91281bb5", "version": 1, "sourceRef": "refs/heads/master", "originalIndex": "73f5d4a4a0891f506efb99e52a2eed13dedb1fdbba8b2c43fa473f768cc5f246"}, "root": "__PROJECT_PATH__", "title": "B - Alterações registradas", "baseId": null, "events": [{"id": 1, "digest": "23b2f4647972a5764d9fe054020a9b43d07a001e37314bf7c95cc03a9d73c0d1"}, {"id": 2, "digest": "333ffce2b9ef2c46c0f2359ad26d7c2a36c61542545e16ee864491e74f18f2d8"}, {"id": 3, "digest": "ef67332917d8277b25f8c665d150f2690213e58ae890413af34d8d0d4bd4edbd"}], "version": 1, "branchId": 1, "projectId": 1, "branchName": "master", "description": null}', 2, '2026-11-08 15:36:32.831446'),
	('70aa0171-0bfc-452e-98f7-334a844d373e', 1, 'applied', '{"plan": {"id": "70aa0171-0bfc-452e-98f7-334a844d373e", "ref": "refs/heads/master", "sha": "9ca1db2b0a1109f87b3b5e081e52e54d491b52c6", "kind": "commit", "tree": "d99aa1d6bd041449b2aec77481d3d0b0449b393e", "before": "ededce5c07883290e300e4bbf4752a2a8a34f270", "source": "ededce5c07883290e300e4bbf4752a2a8a34f270", "version": 1, "sourceRef": "refs/heads/master", "originalIndex": "4f36ef2cc7d2c26ff91101c40f560e573a07e8b2cdf38d45cf3cb8425f4ae6af"}, "root": "__PROJECT_PATH__", "title": "C - Estado posterior", "baseId": null, "events": [{"id": 4, "digest": "6c5a93bbaa040d5c5432ec2b76f0b75f8a940344dec37de33c7cbb0042254636"}], "version": 1, "branchId": 1, "projectId": 1, "branchName": "master", "description": null}', 3, '2026-11-08 15:37:10.891200'),
	('7a464347-fdd4-4d54-9e80-6ff9b2b91b6c', 1, 'applied', '{"plan": {"id": "7a464347-fdd4-4d54-9e80-6ff9b2b91b6c", "ref": "refs/heads/master", "sha": "a4406d8b5c3422732394cf5c52dac58b91281bb5", "kind": "initialize", "tree": "703796584583590bef510ceb7c3f4e5cace98022", "before": null, "source": null, "version": 1, "sourceRef": "refs/heads/master", "originalIndex": "absent"}, "root": "__PROJECT_PATH__", "title": "Lusiad: initial project snapshot", "baseId": null, "events": [], "version": 1, "branchId": 1, "projectId": 1, "branchName": "master", "description": "Technical baseline captured before the first tracked change; no user files were created."}', 1, '2026-11-08 15:34:01.815816');

-- Copiando estrutura para tabela lusiad.lusiad_history_tags
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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela lusiad.lusiad_history_tags: ~4 rows (aproximadamente)
INSERT INTO `lusiad_history_tags` (`id`, `project_id`, `name`, `name_key`, `commit_id`, `change_id`, `created_at`) VALUES
	(1, 1, 'A - Estado inicial', 'a - estado inicial', 1, NULL, '2026-11-08 15:34:30');

-- Copiando estrutura para tabela lusiad.lusiad_project_operations
CREATE TABLE IF NOT EXISTS `lusiad_project_operations` (
  `operation_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `request_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `project_id` int NOT NULL,
  `kind` enum('remove','delete','relink','move') COLLATE utf8mb4_general_ci NOT NULL,
  `state` enum('prepared','applied','completed','aborted') COLLATE utf8mb4_general_ci NOT NULL,
  `payload` json DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`operation_id`),
  KEY `IDX_project_operation_pending` (`project_id`,`state`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela lusiad.lusiad_project_operations: ~0 rows (aproximadamente)

-- Copiando estrutura para tabela lusiad.lusiad_sync_operations
CREATE TABLE IF NOT EXISTS `lusiad_sync_operations` (
  `operation_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `project_id` int NOT NULL,
  `state` enum('prepared','applied','aborted') COLLATE utf8mb4_general_ci NOT NULL,
  `payload` json DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`operation_id`),
  KEY `IDX_sync_operation_pending` (`project_id`,`state`,`created_at`),
  CONSTRAINT `FK_sync_operation_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela lusiad.lusiad_sync_operations: ~2 rows (aproximadamente)

-- Copiando estrutura para tabela lusiad.projects
CREATE TABLE IF NOT EXISTS `projects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `path` text COLLATE utf8mb4_general_ci NOT NULL,
  `temp_path` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `name` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_general_ci,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela lusiad.projects: ~4 rows (aproximadamente)
INSERT INTO `projects` (`id`, `path`, `temp_path`, `name`, `description`) VALUES
	(1, '__PROJECT_PATH__', '__TEMP_PATH__', 'AVAL-BASE', 'Projeto para avaliação da ferramenta');

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
