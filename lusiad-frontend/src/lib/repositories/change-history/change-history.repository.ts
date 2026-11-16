import "server-only"
import { createHash } from "node:crypto"
import { historyRead } from "@/lib/repositories/history-read"
import { historyCursor, historyLimit } from "@/lib/models/change-history/history-page"

import type { ChangeHistoryRow } from "@/lib/models/change-history/change-history.model"
import { getPool } from "@/lib/repositories/database"
import type { RowDataPacket } from "mysql2/promise"

const DEFAULT_QUERY_LIMIT = 250
const MAX_QUERY_LIMIT = 2000

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_QUERY_LIMIT
  }

  return Math.max(1, Math.min(MAX_QUERY_LIMIT, Math.trunc(limit)))
}

export async function listCommittedChangeHistoryRows(projectId: number, limit: number): Promise<ChangeHistoryRow[]> {
  const resolvedLimit = normalizeLimit(limit)
  const [rows] = await getPool().query<Array<ChangeHistoryRow & RowDataPacket>>(
    "SELECT ch.id, ch.commit_id, ch.summary, ch.description, ch.date_time, ch.change_type, ch.scope, ch.req_body FROM changes ch JOIN commits c ON c.id=ch.commit_id JOIN branches b ON b.id=c.branch_id WHERE ch.project_id = ? AND b.project_id=ch.project_id AND (ch.branch_id IS NULL OR ch.branch_id=c.branch_id) ORDER BY ch.id DESC LIMIT ?",
    [projectId, resolvedLimit]
  )

  return rows
}

export async function listCommittedChangeHistoryRowsByCommitIds(
  projectId: number,
  commitIds: Array<string | number>
): Promise<ChangeHistoryRow[]> {
  const normalizedCommitIds = commitIds
    .map((value) => Number(String(value).replace(/^commit-/, '')))
    .filter((value) => Number.isFinite(value))

  if (normalizedCommitIds.length === 0) {
    return []
  }

  const placeholders = normalizedCommitIds.map(() => '?').join(', ')
  const [rows] = await getPool().query<Array<ChangeHistoryRow & RowDataPacket>>(
    `SELECT ch.id, ch.commit_id, ch.summary, ch.description, ch.date_time, ch.change_type, ch.scope, ch.req_body
     FROM changes ch JOIN commits c ON c.id=ch.commit_id JOIN branches b ON b.id=c.branch_id
     WHERE ch.project_id = ? AND b.project_id=ch.project_id AND (ch.branch_id IS NULL OR ch.branch_id=c.branch_id) AND ch.commit_id IN (${placeholders})
     ORDER BY ch.id DESC`,
    [projectId, ...normalizedCommitIds]
  )

  return rows
}

export async function countUncommittedChangeHistoryRows(projectId: number): Promise<number> {
  const [rows] = await getPool().query<Array<RowDataPacket & { total: number | string }>>(
    "SELECT COUNT(*) AS total FROM changes WHERE project_id = ? AND commit_id IS NULL AND (branch_id IS NULL OR branch_id IN (SELECT id FROM branches WHERE project_id = ? AND selected = '1'))",
    [projectId, projectId]
  )

  const total = rows[0]?.total ?? 0
  return typeof total === 'string' ? Number(total) : total
}

/** A cursor is valid only while membership of the selected branch's pending chain is unchanged. */
export async function pendingHistoryPage(projectId: number, limit: number, beforeId?: number, revision?: string) {
  historyLimit(limit); historyCursor(beforeId)
  if (!Number.isSafeInteger(projectId) || projectId < 1 || (beforeId !== undefined && !revision))
    throw new Error("Invalid pending history request")
  return historyRead(async connection => {
    const [branches] = await connection.query<Array<RowDataPacket & { id: number }>>(
      "SELECT id FROM branches WHERE project_id=? AND selected='1' ORDER BY id", [projectId])
    if (branches.length > 1) throw new Error("Ambiguous selected branch")
    const branchId = branches[0]?.id ?? null
    const scope = "project_id=? AND commit_id IS NULL AND (branch_id IS NULL OR branch_id=?)"
    const [membership] = await connection.query<Array<RowDataPacket & { id: number }>>(
      `SELECT id FROM changes WHERE ${scope} ORDER BY id DESC`, [projectId, branchId])
    const currentRevision = createHash('sha256').update(JSON.stringify([projectId, branchId, membership.map(row => row.id)])).digest('hex')
    if (revision !== undefined && revision !== currentRevision) throw new Error('Pending history changed; reload the list')
    const [rows] = await connection.query<Array<ChangeHistoryRow & RowDataPacket>>(
      `SELECT id,commit_id,summary,description,date_time,change_type,scope,req_body FROM changes
       WHERE ${scope} ${beforeId === undefined ? '' : 'AND id<?'} ORDER BY id DESC LIMIT ?`,
      [projectId, branchId, ...(beforeId === undefined ? [] : [beforeId]), limit + 1])
    const page = rows.slice(0, limit)
    return { rows: page, total: membership.length, revision: currentRevision,
      nextBeforeId: rows.length > limit ? Number(page.at(-1)!.id) : null }
  })
}
