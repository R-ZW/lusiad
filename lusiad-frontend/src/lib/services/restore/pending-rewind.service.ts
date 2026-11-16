import 'server-only'

import { backendUrl } from '@/lib/config/backend'
import { postBackendJson } from '@/lib/services/backend-client'
import { findPendingRestoreContext } from '@/lib/repositories/restore/restore.repository'
import { applyRestoreChangeService } from './restore.service'
import { readReadyPreview, releasePreview } from './preview-snapshot'
import { createPreview, markPreviewReady } from './preview-snapshot'
import { preparePendingArchive } from './change-archive.service'
import { cp } from 'node:fs/promises'
import { containedPath } from '../contained-paths'
import { getPool } from '@/lib/repositories/database'
import type { RowDataPacket } from 'mysql2/promise'

export interface PendingRewindPreview {
  snapshotId: string
  changeId: number
  branchId: number
  gitId: string
  pendingRevision: string
  selectionRevision: string
  discarded: Array<{ id: number; title: string; type: string }>
  paths: string[]
  tags: Array<{ name: string; changeId: number }>
}

function readPreview(body: Record<string, unknown>, label: string) {
  if (body.status !== 'ok' || typeof body.selectionRevision !== 'string' || !/^[a-f0-9]{64}$/.test(body.selectionRevision)
    || !Array.isArray(body.discarded) || !Array.isArray(body.paths) || !Array.isArray(body.tags))
    throw new Error(`${label}: resposta inválida`)
  const discarded = body.discarded.map(item => {
    if (!item || typeof item !== 'object') throw new Error(`${label}: mudança inválida`)
    const row = item as Record<string, unknown>
    if (!Number.isSafeInteger(row.id) || typeof row.title !== 'string' || typeof row.type !== 'string') throw new Error(`${label}: mudança inválida`)
    return { id: row.id as number, title: row.title, type: row.type }
  })
  if (!body.paths.every(path => typeof path === 'string')) throw new Error(`${label}: caminho inválido`)
  const tags = body.tags.map(item => {
    if (!item || typeof item !== 'object') throw new Error(`${label}: tag inválida`)
    const row = item as Record<string, unknown>
    if (typeof row.name !== 'string' || !Number.isSafeInteger(row.changeId)) throw new Error(`${label}: tag inválida`)
    return { name: row.name, changeId: row.changeId as number }
  })
  return { discarded, paths: body.paths as string[], tags, selectionRevision: body.selectionRevision }
}

export async function preparePendingRewind(projectId: number, changeId: number): Promise<PendingRewindPreview> {
  const context = await findPendingRestoreContext(projectId, changeId)
  if (!context) throw new Error('A mudança não está mais pendente nesta branch')
  const preview = await applyRestoreChangeService({ projectId, changeId })
  try {
    await readReadyPreview(context.tempPath, preview.snapshotId, projectId, changeId)
    const body = await postBackendJson(backendUrl('/restore/rewind/preview'), {
      projectId, changeId, branchId: context.branchId, gitId: context.currentGitId,
      pendingRevision: context.pendingRevision, snapshotId: preview.snapshotId,
    }, 'Não foi possível preparar o retorno', readPreview)
    return { snapshotId: preview.snapshotId, changeId, branchId: context.branchId,
      gitId: context.currentGitId, pendingRevision: context.pendingRevision, ...body }
  } catch (error) {
    await releasePreview(context.tempPath, preview.snapshotId, projectId).catch(() => {})
    throw error
  }
}

/** The same recoverable cut as P37, using the committed HEAD as the virtual target. */
export async function prepareAllPendingRewind(projectId: number): Promise<PendingRewindPreview> {
  const [rows] = await getPool().query<Array<RowDataPacket & { id: number }>>(
    'SELECT id FROM changes WHERE project_id=? AND commit_id IS NULL ORDER BY id LIMIT 1', [projectId])
  if (!rows.length) throw new Error('Não há mudanças pendentes para descartar')
  const context = await findPendingRestoreContext(projectId, rows[0].id)
  if (!context) throw new Error('Mudanças pendentes não pertencem à branch atual')
  return createPreview(context.tempPath, async (snapshotId, root) => {
    await preparePendingArchive(context, `comparisons/${snapshotId}/archive`)
    await cp(containedPath(root, 'archive'), containedPath(root, 'working-copy'), { recursive: true })
    await markPreviewReady(context.tempPath, { snapshotId, projectId, changeId: 0,
      commitId: context.commitId, changeType: 'pending_baseline', reqBody: {},
      pending: { branchId: context.branchId, gitId: context.currentGitId, revision: context.pendingRevision } })
    const body = await postBackendJson(backendUrl('/restore/rewind/preview'), {
      projectId, changeId: 0, branchId: context.branchId, gitId: context.currentGitId,
      pendingRevision: context.pendingRevision, snapshotId,
    }, 'Não foi possível preparar o descarte', readPreview)
    return { snapshotId, changeId: 0, branchId: context.branchId, gitId: context.currentGitId,
      pendingRevision: context.pendingRevision, ...body }
  })
}

export async function applyPendingRewind(projectId: number, preview: PendingRewindPreview, requestId: string) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(requestId)) throw new Error('Confirmação inválida')
  return postBackendJson(backendUrl('/restore/rewind/apply'), {
    projectId, changeId: preview.changeId, branchId: preview.branchId,
    gitId: preview.gitId, pendingRevision: preview.pendingRevision,
    snapshotId: preview.snapshotId, selectionRevision: preview.selectionRevision, requestId,
  }, 'Não foi possível voltar à mudança', (body, label) => {
    if (body.status !== 'ok' || body.targetChangeId !== preview.changeId) throw new Error(`${label}: confirmação inválida`)
    return { status: 'ok' as const, recovered: body.recovered === true }
  })
}

