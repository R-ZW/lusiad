'use server'

import { preparePendingRewind, prepareAllPendingRewind, applyPendingRewind, type PendingRewindPreview } from '@/lib/services/restore/pending-rewind.service'
import { findProjectById } from '@/lib/repositories/track-control/track-control.repository'
import { releasePreview } from '@/lib/services/restore/preview-snapshot'

type ActionResult<T> = { status: 'ok'; value: T } | { status: 'error'; message: string }

function actionError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 400) : 'A operação falhou; tente novamente.'
}

export async function preparePendingRewindController(projectId: number, changeId: number) {
  try { return { status: 'ok', value: await preparePendingRewind(projectId, changeId) } as ActionResult<PendingRewindPreview> }
  catch (error) { return { status: 'error', message: actionError(error) } as ActionResult<PendingRewindPreview> }
}

export async function prepareAllPendingRewindController(projectId: number) {
  try { return { status: 'ok', value: await prepareAllPendingRewind(projectId) } as ActionResult<PendingRewindPreview> }
  catch (error) { return { status: 'error', message: actionError(error) } as ActionResult<PendingRewindPreview> }
}

export async function applyPendingRewindController(projectId: number, preview: PendingRewindPreview, requestId: string) {
  try { return { status: 'ok', value: await applyPendingRewind(projectId, preview, requestId) } as ActionResult<{ status: 'ok'; recovered: boolean }> }
  catch (error) { return { status: 'error', message: actionError(error) } as ActionResult<{ status: 'ok'; recovered: boolean }> }
}

export async function releasePendingRewindController(projectId: number, snapshotId: string) {
  const project = await findProjectById(projectId)
  if (!project?.tempPath) return
  await releasePreview(project.tempPath, snapshotId, projectId)
}
