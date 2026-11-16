import "server-only"

import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise"
import { getPool } from "@/lib/repositories/database"
import { historyWhere, type HistoryQuery } from "@/lib/models/change-history/history-query.model"

// Legacy cross-project links are hidden, never followed or silently rewritten.
const SCOPED_LINKS = `CASE WHEN EXISTS (
  SELECT 1 FROM commits pc JOIN branches pb ON pb.id=pc.branch_id
  WHERE pc.id=c.prev AND pb.project_id=b.project_id
) THEN c.prev ELSE NULL END AS prev, CASE WHEN EXISTS (
  SELECT 1 FROM commits nc JOIN branches nb ON nb.id=nc.branch_id
  WHERE nc.id=c.next AND nb.project_id=b.project_id
) THEN c.next ELSE NULL END AS next`

const DEFAULT_QUERY_LIMIT = 250
const MAX_QUERY_LIMIT = 2000

export interface CommitRow extends RowDataPacket {
  id: number
  git_id: string
  branch_id: number
  branch_name: string | null
  summary: string
  description: string | null
  timestamp: string | Date
  prev: number | null
  next: number | null
  is_merge_commit: 0 | 1 | '0' | '1'
  is_new_branch_commit: 0 | 1 | '0' | '1'
  restored_from_commit_id: number | null
  restored_from_change_id: number | null
}



type QueryExecutor = Pick<Pool, "query">

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_QUERY_LIMIT
  }

  return Math.max(1, Math.min(MAX_QUERY_LIMIT, Math.trunc(limit)))
}

function resolveExecutor(): QueryExecutor {
  return getPool()
}

export async function listCommitRows(projectId: number, limit: number, offset: number, filter?: HistoryQuery, tagsAvailable = false, upperId?: number, connection?: PoolConnection): Promise<CommitRow[]> {
  const executor = connection ?? resolveExecutor()
  const resolvedLimit = normalizeLimit(limit)
  const resolvedOffset = Math.max(0, Math.trunc(offset))
  const where = historyWhere(projectId, filter, tagsAvailable)
  const [rows] = await executor.query<CommitRow[]>(
    `SELECT c.id, c.git_id, c.branch_id, b.name AS branch_name, c.summary, c.description, c.timestamp, ${SCOPED_LINKS}, c.is_merge_commit, c.is_new_branch_commit, c.restored_from_commit_id, c.restored_from_change_id FROM commits c INNER JOIN branches b ON c.branch_id = b.id WHERE ${where.sql} AND c.id<=? ORDER BY c.id DESC LIMIT ? OFFSET ?`,
    [...where.values, upperId ?? Number.MAX_SAFE_INTEGER, resolvedLimit, resolvedOffset]
  )

  return rows
}

export async function countCommitRows(projectId: number, filter?: HistoryQuery, tagsAvailable = false, upperId?: number, connection?: PoolConnection): Promise<number> {
  const executor = connection ?? resolveExecutor()
  const where = historyWhere(projectId, filter, tagsAvailable)
  const [rows] = await executor.query<Array<RowDataPacket & { total: number | string }>>(
    `SELECT COUNT(*) AS total FROM commits c INNER JOIN branches b ON c.branch_id = b.id WHERE ${where.sql} AND c.id<=?`,
    [...where.values, upperId ?? Number.MAX_SAFE_INTEGER]
  )

  const total = rows[0]?.total ?? 0
  return typeof total === 'string' ? Number(total) : total
}

export async function getCommitRowById(projectId: number, commitId: number): Promise<CommitRow | null> {
  if (!Number.isFinite(commitId)) {
    return null
  }

  const executor = resolveExecutor()
  const [rows] = await executor.query<CommitRow[]>(
    `SELECT c.id, c.git_id, c.branch_id, b.name AS branch_name, c.summary, c.description, c.timestamp, ${SCOPED_LINKS}, c.is_merge_commit, c.is_new_branch_commit, c.restored_from_commit_id, c.restored_from_change_id FROM commits c INNER JOIN branches b ON c.branch_id = b.id WHERE b.project_id = ? AND c.id = ? LIMIT 1`,
    [projectId, commitId]
  )

  return rows[0] ?? null
}

/** Second parent comes from the confirmed Git plan, never timestamp or branches.base. */
export async function listGraphCommitRows(projectId: number, limit: number, beforeId: number | undefined, connection: PoolConnection): Promise<Array<CommitRow & { merge_source_id: number | null; restore_commit_requested: number | null; restore_change_requested: number | null }>> {
  const [rows] = await connection.query<Array<CommitRow & { merge_source_id: number | null; restore_commit_requested: number | null; restore_change_requested: number | null }>>(
    `SELECT c.*, ${SCOPED_LINKS}, b.name AS branch_name,
       c.restored_from_commit_id AS restore_commit_requested, c.restored_from_change_id AS restore_change_requested,
       CASE WHEN EXISTS (SELECT 1 FROM commits rc JOIN branches rb ON rb.id=rc.branch_id
         WHERE rc.id=c.restored_from_commit_id AND rb.project_id=b.project_id)
         THEN c.restored_from_commit_id ELSE NULL END AS restored_from_commit_id,
       CASE WHEN EXISTS (SELECT 1 FROM changes rch JOIN commits rc ON rc.id=rch.commit_id JOIN branches rb ON rb.id=rc.branch_id
         WHERE rch.id=c.restored_from_change_id AND rch.project_id=b.project_id AND rb.project_id=b.project_id AND rc.id=c.restored_from_commit_id)
         THEN c.restored_from_change_id ELSE NULL END AS restored_from_change_id,
       (SELECT sc.id FROM lusiad_git_operations op
        JOIN commits sc ON sc.branch_id=CAST(JSON_UNQUOTE(JSON_EXTRACT(op.payload,'$.branchId')) AS UNSIGNED)
          AND CAST(sc.git_id AS BINARY)=CAST(JSON_UNQUOTE(JSON_EXTRACT(op.payload,'$.plan.source')) AS BINARY)
        JOIN branches sb ON sb.id=sc.branch_id AND sb.project_id=op.project_id
        WHERE op.project_id=b.project_id AND op.commit_id=c.id AND op.state='applied'
          AND JSON_UNQUOTE(JSON_EXTRACT(op.payload,'$.plan.kind'))='merge'
          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(op.payload,'$.plan.sha')) AS BINARY)=CAST(c.git_id AS BINARY)
          AND sc.id<c.id ORDER BY sc.id DESC LIMIT 1) AS merge_source_id
     FROM commits c JOIN branches b ON b.id=c.branch_id
     WHERE b.project_id=? ${beforeId === undefined ? '' : 'AND c.id<?'} ORDER BY c.id DESC LIMIT ?`,
    [projectId, ...(beforeId === undefined ? [] : [beforeId]), limit + 1])
  return rows
}
