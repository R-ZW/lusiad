import "server-only"

import type { Pool, RowDataPacket } from "mysql2/promise"
import { getPool } from "@/lib/repositories/database"

export interface RestoreContextRow extends RowDataPacket {
  changeId: number
  reqBody: unknown
  changeType: string
  projectId: number
  projectPath: string
  tempPath: string
  commitId: number
  currentGitId: string
  previousCommitId: number | null
  previousGitId: string | null
}

export interface PendingRestoreContext extends RestoreContextRow {
  branchId: number
  branchName: string
  pendingRevision: string
}

type QueryExecutor = Pick<Pool, "query">

function resolveExecutor(): QueryExecutor {
  return getPool()
}

export async function findRestoreContextByChangeId(changeId: number): Promise<RestoreContextRow | null> {
  const executor = resolveExecutor()
  const [rows] = await executor.query<RestoreContextRow[]>(
    `SELECT
       ch.id AS changeId,
       ch.change_type AS changeType,
       ch.req_body AS reqBody,
       p.id AS projectId,
       p.path AS projectPath,
       p.temp_path AS tempPath,
       c.id AS commitId,
       c.git_id AS currentGitId,
       c.prev AS previousCommitId,
       prev.git_id AS previousGitId
     FROM changes ch
     JOIN commits c ON ch.commit_id = c.id
     LEFT JOIN commits prev ON c.prev = prev.id AND prev.branch_id IN (SELECT id FROM branches WHERE project_id=ch.project_id)
     JOIN branches b ON c.branch_id = b.id AND ch.project_id = b.project_id AND (ch.branch_id IS NULL OR ch.branch_id = c.branch_id)
     JOIN projects p ON b.project_id = p.id
     WHERE ch.id = ?
     LIMIT 1`,
    [changeId]
  )

  return rows[0] ?? null
}

export async function findPendingRestoreContext(projectId: number, changeId: number): Promise<PendingRestoreContext | null> {
  const [rows] = await getPool().query<Array<PendingRestoreContext & RowDataPacket>>(
    `SELECT ch.id AS changeId,ch.change_type AS changeType,ch.req_body AS reqBody,
       p.id AS projectId,p.path AS projectPath,p.temp_path AS tempPath,
       b.id AS branchId,b.name AS branchName,c.id AS commitId,c.git_id AS currentGitId,
       NULL AS previousCommitId,NULL AS previousGitId,
       CONCAT((SELECT COUNT(*) FROM changes pending WHERE pending.project_id=p.id AND pending.commit_id IS NULL
         AND (pending.branch_id IS NULL OR pending.branch_id=b.id)),':',
         (SELECT COALESCE(MAX(id),0) FROM changes pending WHERE pending.project_id=p.id AND pending.commit_id IS NULL
         AND (pending.branch_id IS NULL OR pending.branch_id=b.id))) AS pendingRevision
     FROM changes ch JOIN projects p ON p.id=ch.project_id
     JOIN branches b ON b.project_id=p.id AND b.selected='1'
     JOIN commits c ON c.branch_id=b.id
     WHERE p.id=? AND ch.id=? AND ch.commit_id IS NULL
       AND (ch.branch_id IS NULL OR ch.branch_id=b.id)
     ORDER BY c.id DESC LIMIT 1`, [projectId, changeId])
  return rows[0] ?? null
}

export async function loadInitialBaselineEvents(projectId: number, commitId: number) {
  const [events] = await getPool().query<Array<RowDataPacket & import("@/lib/services/restore/initial-baseline").BaselineEvent>>(
    `SELECT ch.id,ch.change_type,ch.scope,ch.req_body FROM changes ch
     JOIN commits c ON c.id=ch.commit_id JOIN branches b ON b.id=c.branch_id
     WHERE ch.project_id=? AND b.project_id=? AND c.id=? AND (ch.branch_id IS NULL OR ch.branch_id=c.branch_id) ORDER BY ch.id`, [projectId, projectId, commitId])
  const [bundles] = await getPool().query<Array<RowDataPacket & import("@/lib/services/restore/initial-baseline").BaselineBundleFile>>(
    `SELECT bf.change_id,bf.path,bf.before_kind,bf.before_content FROM external_sync_bundle_files bf
     JOIN changes ch ON ch.id=bf.change_id JOIN commits c ON c.id=ch.commit_id JOIN branches b ON b.id=c.branch_id
     WHERE ch.project_id=? AND b.project_id=? AND c.id=? AND (ch.branch_id IS NULL OR ch.branch_id=c.branch_id)`, [projectId, projectId, commitId])
  return { events, bundles }
}
