import "server-only"
import { historyRead } from "@/lib/repositories/history-read"
import { historyCursor, historyLimit } from "@/lib/models/change-history/history-page"
import type { RowDataPacket } from "mysql2/promise"

import { countCommitRows, getCommitRowById, listCommitRows } from "@/lib/repositories/commit-history/commit-history.repository"
import { listProjectHistoryTags } from "@/lib/repositories/history-tags/history-tags.repository"
import type { HistoryTagsSnapshot } from "@/lib/models/history-tags/history-tags.model"
import { normalizeHistoryQuery, type HistoryQuery } from "@/lib/models/change-history/history-query.model"


export interface CommitHistoryRecord {
  id: string
  gitId: string
  previousId: string | null
  branchId: number
  branchName: string | null
  summary: string
  description: string | null
  timestamp: string
  isMergeCommit: boolean
  isNewBranchCommit: boolean
  restoredFromCommitId: number | null
  restoredFromChangeId: number | null
}

export interface CommitHistorySnapshot {
  records: CommitHistoryRecord[]
  upperId: number
  totalCount: number
  historyTags: HistoryTagsSnapshot
}

function normalizeCommitId(value: number | string): number | null {
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/^commit-/, ""))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeTimestamp(value: string | Date | null): string {
  if (!value) {
    return new Date().toISOString()
  }

  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isNaN(time) ? new Date().toISOString() : value.toISOString()
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

export async function fetchCommitHistoryService(
  projectId: number,
  limit?: number,
  offset = 0,
  filter?: HistoryQuery,
  upperId?: number
): Promise<CommitHistorySnapshot> {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new Error("Projeto inválido")
  const search = normalizeHistoryQuery(filter)
  historyCursor(upperId)
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid history offset")
  const resolvedLimit = historyLimit(limit)
  return historyRead(async connection => {
    const historyTags = await listProjectHistoryTags(projectId, connection)
    const [latest] = await connection.query<Array<RowDataPacket & { id: number }>>(
      'SELECT COALESCE(MAX(c.id),0) AS id FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=?', [projectId])
    const anchor = upperId ?? Number(latest[0].id)
    const rows = await listCommitRows(projectId, resolvedLimit, offset, search, historyTags.available, anchor, connection)
    const totalCount = await countCommitRows(projectId, search, historyTags.available, anchor, connection)

    return {
      records: rows.map((row) => ({
        id: String(row.id),
        gitId: row.git_id,
        previousId: row.prev === null ? null : String(row.prev),
        branchId: Number(row.branch_id),
        branchName: row.branch_name ?? null,
        summary: row.summary,
        description: row.description ?? null,
        timestamp: normalizeTimestamp(row.timestamp),
        isMergeCommit: row.is_merge_commit === 1 || row.is_merge_commit === '1',
        isNewBranchCommit: row.is_new_branch_commit === 1 || row.is_new_branch_commit === '1',
        restoredFromCommitId: row.restored_from_commit_id,
        restoredFromChangeId: row.restored_from_change_id,
      })),
      upperId: anchor,
      totalCount,
      historyTags,
    }
  })
}

export async function fetchCommitByIdService(
  projectId: number,
  commitId: number | string
): Promise<CommitHistoryRecord | null> {
  const resolvedCommitId = normalizeCommitId(commitId)

  if (resolvedCommitId === null) {
    return null
  }

  const row = await getCommitRowById(projectId, resolvedCommitId)

  if (!row) {
    return null
  }

  return {
    id: String(row.id),
    gitId: row.git_id,
    previousId: row.prev === null ? null : String(row.prev),
    branchId: Number(row.branch_id),
    branchName: row.branch_name ?? null,
    summary: row.summary,
    description: row.description ?? null,
    timestamp: normalizeTimestamp(row.timestamp),
    isMergeCommit: row.is_merge_commit === 1 || row.is_merge_commit === '1',
    isNewBranchCommit: row.is_new_branch_commit === 1 || row.is_new_branch_commit === '1',
    restoredFromCommitId: row.restored_from_commit_id,
    restoredFromChangeId: row.restored_from_change_id,
  }
}
