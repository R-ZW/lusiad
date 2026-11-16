import "server-only"

import {
  buildChangeHistoryRecordModel,
  groupChangeHistoryRecordsModel,
  type ChangeHistorySnapshot,
} from "@/lib/models/change-history/change-history.model"
import {
  countUncommittedChangeHistoryRows,
  listCommittedChangeHistoryRows,
  listCommittedChangeHistoryRowsByCommitIds,
  pendingHistoryPage,
} from "@/lib/repositories/change-history/change-history.repository"

export interface FetchChangeHistoryServiceParams {
  projectId: number
  limit: number
  commitIds?: Array<string | number>
  pendingBeforeId?: number
  pendingRevision?: string
  includeUncommittedDetails?: boolean
  includeUncommittedCount?: boolean
}

export async function fetchChangeHistoryService({
  projectId,
  limit,
  commitIds,
  pendingBeforeId,
  pendingRevision,
  includeUncommittedDetails = false,
  includeUncommittedCount = true,
}: FetchChangeHistoryServiceParams): Promise<ChangeHistorySnapshot> {
  const shouldLoadCommittedRows = !includeUncommittedDetails || (commitIds !== undefined && commitIds.length > 0)
  const committedRows = shouldLoadCommittedRows
    ? commitIds !== undefined
      ? commitIds.length ? await listCommittedChangeHistoryRowsByCommitIds(projectId, commitIds) : []
      : await listCommittedChangeHistoryRows(projectId, limit)
    : []

  if (includeUncommittedDetails) {
    const page = await pendingHistoryPage(projectId, limit, pendingBeforeId, pendingRevision)
    const snapshot = groupChangeHistoryRecordsModel([...committedRows, ...page.rows].map(buildChangeHistoryRecordModel))
    return { ...snapshot, uncommittedCount: page.total,
      pendingPage: { revision: page.revision, nextBeforeId: page.nextBeforeId } }
  }

  if (!includeUncommittedCount) {
    const records = committedRows.map(buildChangeHistoryRecordModel)
    return groupChangeHistoryRecordsModel(records)
  }

  const [resolvedCommittedRows, uncommittedCount] = await Promise.all([
    Promise.resolve(committedRows),
    countUncommittedChangeHistoryRows(projectId),
  ])

  const records = resolvedCommittedRows.map(buildChangeHistoryRecordModel)
  const snapshot = groupChangeHistoryRecordsModel(records)

  return {
    ...snapshot,
    uncommittedCount,
    uncommittedChanges: [],
  }
}
