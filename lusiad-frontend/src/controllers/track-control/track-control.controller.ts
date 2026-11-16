"use server"

import { historyRead } from "@/lib/repositories/history-read"
import { historyCursor, historyLimit } from "@/lib/models/change-history/history-page"
import { gitAction } from "@/lib/services/commit-menu/git-action"
import { GitValidationError } from "@/lib/services/commit-menu/git-operation"
import type { BackendActionResult } from "@/lib/services/backend-action-result"

import { listGraphCommitRows } from "@/lib/repositories/commit-history/commit-history.repository"
import { findProjectByPath, listBranchesByProjectId } from "@/lib/repositories/track-control/track-control.repository"
import { checkIsGitRepository } from "@/lib/services/commit-menu/commit-menu.service"
import { withExternalSyncLock, assertExternalBundleReady } from "@/lib/services/external-sync/external-sync.service"
import { recordGitOperation, withGitRecordingLock } from "@/lib/services/commit-menu/git-recording.service"
import { listProjectHistoryTags } from "@/lib/repositories/history-tags/history-tags.repository"
import type { HistoryTagsSnapshot } from "@/lib/models/history-tags/history-tags.model"
import type { GraphChangeMarker } from "@/lib/models/change-history/commit-graph"
import type { RowDataPacket } from "mysql2/promise"

export interface TrackControlBranch {
  id: number
  name: string
  baseId: number | null
  active: boolean
  selected: boolean
}

export interface TrackControlCommit {
  id: number
  branchId: number
  summary: string
  description: string | null
  timestamp: string
  isMergeCommit: boolean
  isNewBranchCommit: boolean
  prevId: number | null
  nextId: number | null
  mergeSourceId: number | null
  restoredFromCommitId: number | null
  restoredFromChangeId: number | null
  restoreSourceUnavailable: boolean
}

export interface TrackControlSnapshot {
  nextBeforeId: number | null
  projectId: number | null
  branches: TrackControlBranch[]
  commits: TrackControlCommit[]
  historyTags: HistoryTagsSnapshot
  changeMarkers: GraphChangeMarker[]
}

interface TrackControlParams {
  repositoryPath: string
  limit?: number
  beforeId?: number
  focusCommitId?: number
}

function requireRepositoryPath(repositoryPath: string): string {
  const trimmedPath = repositoryPath.trim()

  if (!trimmedPath) {
    throw new GitValidationError("Informe o caminho do repositorio")
  }

  return trimmedPath
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

export async function loadTrackControlController({
  repositoryPath,
  limit, beforeId, focusCommitId,
}: TrackControlParams): Promise<BackendActionResult<TrackControlSnapshot>> {
  return gitAction(async () => {
    const resolvedPath = requireRepositoryPath(repositoryPath)
    const project = await findProjectByPath(resolvedPath)

    if (!project) {
      return { projectId: null, branches: [], commits: [], nextBeforeId: null, historyTags: { available: true, tags: [] }, changeMarkers: [] }
    }

    await withExternalSyncLock(project.id, async () => {})
    const size = historyLimit(limit)
    historyCursor(beforeId); historyCursor(focusCommitId)
    return historyRead(async connection => {
      const branches = await listBranchesByProjectId(project.id, connection)
      const rows = await listGraphCommitRows(project.id, size, beforeId ?? (focusCommitId === undefined ? undefined : focusCommitId + 1), connection)
      const commits = rows.slice(0, size)
      const validIds = new Set(branches.map(branch => branch.id))
      const historyTags = await listProjectHistoryTags(project.id, connection)
      const commitIds = new Set(commits.map(commit => commit.id))
      const changeIds = [...new Set(historyTags.tags.filter(tag => tag.targetKind === 'change' && tag.commitId !== null && commitIds.has(tag.commitId)).map(tag => tag.targetId))]
      let changeMarkers: GraphChangeMarker[] = []
      if (commitIds.size) {
        const [markers] = await connection.query<Array<RowDataPacket & { id: number; commit_id: number; summary: string; date_time: string | Date; metadata: unknown }>>(
          `SELECT ch.id,ch.commit_id,ch.summary,ch.date_time,JSON_EXTRACT(ch.req_body,'$.changeMetadata') AS metadata FROM changes ch
           JOIN commits c ON c.id=ch.commit_id JOIN branches b ON b.id=c.branch_id
           WHERE ch.project_id=? AND b.project_id=? AND ch.commit_id IN (?) AND (
             ${changeIds.length ? 'ch.id IN (?) OR' : ''}
             EXISTS (SELECT 1 FROM commits restored JOIN branches rb ON rb.id=restored.branch_id
               WHERE rb.project_id=ch.project_id AND restored.restored_from_commit_id=ch.commit_id AND restored.restored_from_change_id=ch.id)
           ) ORDER BY ch.id`,
          [project.id, project.id, [...commitIds], ...(changeIds.length ? [changeIds] : [])])
        changeMarkers = markers.map(row => {
          let metadata = row.metadata
          if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata) } catch { metadata = null } }
          return { id: row.id, commitId: row.commit_id, summary: row.summary, timestamp: normalizeTimestamp(row.date_time), metadata }
        })
      }

      return {
        nextBeforeId: rows.length > size ? commits.at(-1)!.id : null,
        projectId: project.id,
        historyTags, changeMarkers,
        branches: branches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          baseId: branch.base != null && validIds.has(branch.base) ? branch.base : null,
          active: branch.active === "1",
          selected: branch.selected === "1",
        })),
        commits: commits.map((commit) => ({
          id: commit.id,
          branchId: commit.branch_id,
          summary: commit.summary,
          description: commit.description ?? null,
          timestamp: normalizeTimestamp(commit.timestamp),
          isMergeCommit: commit.is_merge_commit === 1 || commit.is_merge_commit === '1',
          isNewBranchCommit: commit.is_new_branch_commit === 1 || commit.is_new_branch_commit === '1',
          prevId: commit.prev ?? null,
          nextId: commit.next ?? null,
          mergeSourceId: commit.merge_source_id ?? null,
          restoredFromCommitId: commit.restored_from_commit_id ?? null,
          restoredFromChangeId: commit.restored_from_change_id ?? null,
          restoreSourceUnavailable: (commit.restore_commit_requested != null && commit.restored_from_commit_id == null) || (commit.restore_change_requested != null && commit.restored_from_change_id == null),
        })),
      }
    })
  })
}

export async function createTrackBranchController({
  repositoryPath,
  name,
}: { repositoryPath: string; name: string }): Promise<BackendActionResult<{ branchId: number }>> {
  return gitAction(async () => {
    const resolvedPath = requireRepositoryPath(repositoryPath)
    const trimmedName = name.trim()

    if (!trimmedName) {
      throw new GitValidationError("Informe o nome da branch")
    }

    const isRepo = await checkIsGitRepository(resolvedPath)
    if (!isRepo) {
      throw new GitValidationError("Repositorio Git nao encontrado")
    }

    const project = await findProjectByPath(resolvedPath)
    if (!project) {
      throw new GitValidationError("Projeto nao encontrado. Execute git init primeiro.")
    }

    return withExternalSyncLock(project.id, async (connection) => {
      await assertExternalBundleReady(project.id, connection)
      return withGitRecordingLock(connection, project.id, project.path, () =>
        recordGitOperation(connection, project.id, project.path, "branch", `Criação de branch "${trimmedName}"`, null, trimmedName))
    })
  })
}

export async function mergeSelectedBranchController({
  repositoryPath,
}: { repositoryPath: string }): Promise<BackendActionResult<{ commitId: number }>> {
  return gitAction(async () => {
    const resolvedPath = requireRepositoryPath(repositoryPath)

    const isRepo = await checkIsGitRepository(resolvedPath)
    if (!isRepo) {
      throw new GitValidationError("Repositorio Git nao encontrado")
    }

    const project = await findProjectByPath(resolvedPath)
    if (!project) {
      throw new GitValidationError("Projeto nao encontrado. Execute git init primeiro.")
    }

    return withExternalSyncLock(project.id, async (connection) => {
      await assertExternalBundleReady(project.id, connection)
      return withGitRecordingLock(connection, project.id, project.path, () =>
        recordGitOperation(connection, project.id, project.path, "merge", "Merge", "Fast-forward integration"))
    })
  })
}
