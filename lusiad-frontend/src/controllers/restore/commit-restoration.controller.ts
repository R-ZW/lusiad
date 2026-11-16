'use server'

import { prepareCommitRestore, prepareChangeRestore, applyCommitRestore, type CommitRestorePreview } from '@/lib/services/restore/commit-restoration.service'
import { findProjectById } from '@/lib/repositories/track-control/track-control.repository'
import { releasePreview } from '@/lib/services/restore/preview-snapshot'

type Result<T> = { status: 'ok'; value: T } | { status: 'error'; message: string }
const fail = (error: unknown) => ({ status: 'error' as const, message: error instanceof Error ? error.message.slice(0, 400) : 'Falha na restauração' })

export async function prepareCommitRestoreController(projectId: number, sourceCommitId: number): Promise<Result<CommitRestorePreview>> {
  try { return { status: 'ok', value: await prepareCommitRestore(projectId, sourceCommitId) } }
  catch (error) { return fail(error) }
}

export async function prepareChangeRestoreController(projectId: number, sourceChangeId: number): Promise<Result<CommitRestorePreview>> {
  try { return { status: 'ok', value: await prepareChangeRestore(projectId, sourceChangeId) } }
  catch (error) { return fail(error) }
}

export async function applyCommitRestoreController(projectId: number, preview: CommitRestorePreview, requestId: string): Promise<Result<{ commitId: number }>> {
  try { return { status: 'ok', value: await applyCommitRestore(projectId, preview, requestId) } }
  catch (error) { return fail(error) }
}

export async function releaseChangeRestorePreviewController(projectId: number, snapshotId: string): Promise<void> {
  const project = await findProjectById(projectId)
  if (project?.tempPath) await releasePreview(project.tempPath, snapshotId, projectId)
}
