import 'server-only'

import { createHash } from 'node:crypto'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { findProjectById } from '@/lib/repositories/track-control/track-control.repository'
import { withExternalSyncLock, assertExternalBundleReady } from '../external-sync/external-sync.service'
import { GitOperation, GitValidationError } from '../commit-menu/git-operation'
import { recordRestoreCommit } from '../commit-menu/git-recording.service'
import { testGitEnvironment, assertSafeGitArchive } from '@/lib/config/test-git'
import { relativeContained } from '../contained-paths'
import { applyRestoreChangeService } from './restore.service'
import { findRestoreContextByChangeId } from '@/lib/repositories/restore/restore.repository'
import { readReadyPreview, previewRoot, releasePreview } from './preview-snapshot'
import { readSnapshotTree } from './snapshot-reader'
import { containedPath } from '../contained-paths'

interface BranchRow extends RowDataPacket { id: number; name: string }
interface SourceRow extends RowDataPacket { git_id: string; req_body?: unknown }
interface Receipt extends RowDataPacket { commit_id: number | null; state: string; payload: unknown }
export interface RestoreFile { kind: 'added' | 'removed' | 'modified' | 'renamed'; beforePath: string | null; afterPath: string | null }
export interface CommitRestorePreview {
  sourceCommitId: number; sourceGitId: string; headGitId: string; branchId: number; branchName: string
  revision: string; files: RestoreFile[]; sourceChangeId: number | null; targetTree: string; snapshotId?: string
}

function validId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) throw new GitValidationError('Commit inválido')
}

async function inspect(connection: PoolConnection, projectId: number, sourceCommitId: number,
  change?: { id: number; snapshotId: string }): Promise<{ preview: CommitRestorePreview; root: string }> {
  validId(projectId); validId(sourceCommitId)
  const project = await findProjectById(projectId)
  if (!project) throw new GitValidationError('Projeto não encontrado')
  if (change && !project.tempPath) throw new GitValidationError('Pasta temporária do projeto indisponível')
  const [branches] = await connection.query<BranchRow[]>("SELECT id,name FROM branches WHERE project_id=? AND selected='1'", [projectId])
  if (branches.length !== 1) throw new GitValidationError('Branch selecionada inválida')
  const [sources] = change
    ? await connection.query<SourceRow[]>(
      'SELECT c.git_id,ch.req_body FROM changes ch JOIN commits c ON c.id=ch.commit_id JOIN branches b ON b.id=c.branch_id WHERE b.project_id=? AND ch.project_id=? AND c.id=? AND ch.id=?',
      [projectId, projectId, sourceCommitId, change.id])
    : await connection.query<SourceRow[]>(
      'SELECT c.git_id FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=? AND c.id=?',
      [projectId, sourceCommitId])
  if (sources.length !== 1) throw new GitValidationError('Commit não pertence a este projeto')
  const branch = branches[0], sourceGitId = sources[0].git_id
  const git = new GitOperation(project.path, testGitEnvironment())
  if (await git.headRef() !== `refs/heads/${branch.name}`) throw new GitValidationError('Branch Git difere da selecionada no Lusiad')
  const headGitId = await git.ref(await git.headRef())
  if (!headGitId) throw new GitValidationError('A branch atual não possui commit')
  const [heads] = await connection.query<RowDataPacket[]>(
    'SELECT c.id FROM commits c JOIN branches b ON b.id=c.branch_id WHERE b.project_id=? AND c.git_id=? LIMIT 1',
    [projectId, headGitId])
  if (!heads.length) throw new GitValidationError('HEAD Git sem vínculo SQL neste projeto')
  const [pending] = await connection.query<Array<RowDataPacket & { count: number }>>(
    'SELECT COUNT(*) AS count FROM changes WHERE project_id=? AND commit_id IS NULL', [projectId])
  if (Number(pending[0]?.count) !== 0) throw new GitValidationError('Conclua ou descarte todas as mudanças pendentes antes de restaurar')
  await assertExternalBundleReady(projectId, connection)
  await git.assertClean()
  await assertSafeGitArchive(project.path, headGitId)
  await assertSafeGitArchive(project.path, sourceGitId)
  let targetTree = (await git.git(['rev-parse', `${sourceGitId}^{tree}`])).trim()
  if (change) {
    const marker = await readReadyPreview(project.tempPath!, change.snapshotId, projectId, change.id, false)
    const body = typeof sources[0].req_body === 'string' ? JSON.parse(sources[0].req_body) : sources[0].req_body
    if (marker.commitId !== sourceCommitId || JSON.stringify(marker.reqBody) !== JSON.stringify(body))
      throw new GitValidationError('A mudança foi alterada; abra uma nova prévia')
    const snapshot = previewRoot(project.tempPath!, change.snapshotId)
    await readSnapshotTree(snapshot, 'working-copy')
    targetTree = await git.treeFromSnapshot(containedPath(snapshot, 'working-copy'))
    await assertSafeGitArchive(project.path, targetTree)
  }
  const rows = (await git.git(['diff-tree', '--no-commit-id', '-r', '--name-status', '-z', '--find-renames', headGitId, targetTree])).split('\0').filter(Boolean)
  const files: RestoreFile[] = []
  const path = () => {
    const value = rows[i++]
    if (!value) throw new GitValidationError('Diff Git incompleto')
    return relativeContained(project.path, value)
  }
  let i = 0
  for (; i < rows.length;) {
    const status = rows[i++]
    if (/^R\d+$/.test(status)) files.push({ kind: 'renamed', beforePath: path(), afterPath: path() })
    else if (status === 'A') files.push({ kind: 'added', beforePath: null, afterPath: path() })
    else if (status === 'D') files.push({ kind: 'removed', beforePath: path(), afterPath: null })
    else if (status === 'M' || status === 'T') { const value = path(); files.push({ kind: 'modified', beforePath: value, afterPath: value }) }
    else throw new GitValidationError('Diff Git contém um tipo de arquivo não suportado')
  }
  if (!files.length) throw new GitValidationError(change
    ? 'O projeto já corresponde ao estado após a mudança selecionada'
    : 'O projeto já corresponde ao commit selecionado')
  const revision = createHash('sha256').update(JSON.stringify([projectId, sourceCommitId, sourceGitId,
    change?.id ?? null, change?.snapshotId ?? null, targetTree, headGitId, branch.id, branch.name, files])).digest('hex')
  return { root: project.path, preview: { sourceCommitId, sourceGitId, headGitId,
    branchId: branch.id, branchName: branch.name, revision, files, sourceChangeId: change?.id ?? null,
    targetTree, ...(change ? { snapshotId: change.snapshotId } : {}) } }
}

export async function prepareCommitRestore(projectId: number, sourceCommitId: number): Promise<CommitRestorePreview> {
  return withExternalSyncLock(projectId, async connection => (await inspect(connection, projectId, sourceCommitId)).preview)
}

/** Reconstruction happens outside the edit lock; inspection freezes and verifies its result. */
export async function prepareChangeRestore(projectId: number, sourceChangeId: number): Promise<CommitRestorePreview> {
  validId(projectId); validId(sourceChangeId)
  const context = await findRestoreContextByChangeId(sourceChangeId)
  if (!context || context.projectId !== projectId) throw new GitValidationError('Mudança não pertence a este projeto ou ainda não foi commitada')
  const snapshot = await applyRestoreChangeService({ projectId, changeId: sourceChangeId })
  try {
    return await withExternalSyncLock(projectId, async connection =>
      (await inspect(connection, projectId, context.commitId, { id: sourceChangeId, snapshotId: snapshot.snapshotId })).preview)
  } catch (error) {
    await releasePreview(context.tempPath, snapshot.snapshotId, projectId).catch(() => {})
    throw error
  }
}

export async function applyCommitRestore(projectId: number, expected: CommitRestorePreview, requestId: string): Promise<{ commitId: number }> {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(requestId)
    || !expected || !/^[a-f0-9]{64}$/.test(expected.revision)) throw new GitValidationError('Confirmação de restauração inválida')
  return withExternalSyncLock(projectId, async connection => {
    const [receipts] = await connection.query<Receipt[]>(
      'SELECT state,commit_id,payload FROM lusiad_git_operations WHERE project_id=? AND operation_id=?', [projectId, requestId])
    if (receipts.length) {
      const frozen = typeof receipts[0].payload === 'string' ? JSON.parse(receipts[0].payload) : receipts[0].payload
      if (receipts[0].state === 'applied' && frozen?.restoreSourceCommitId === expected.sourceCommitId
        && (frozen?.restoreSourceChangeId ?? null) === (expected.sourceChangeId ?? null) && receipts[0].commit_id)
        return { commitId: receipts[0].commit_id }
      throw new GitValidationError('Esta confirmação já pertence a outra operação; atualize o histórico')
    }
    const change = expected.sourceChangeId == null ? undefined : { id: expected.sourceChangeId, snapshotId: expected.snapshotId ?? '' }
    const { preview, root } = await inspect(connection, projectId, expected.sourceCommitId, change)
    if (preview.revision !== expected.revision || preview.branchId !== expected.branchId
      || preview.headGitId !== expected.headGitId || preview.sourceGitId !== expected.sourceGitId
      || preview.targetTree !== expected.targetTree)
      throw new GitValidationError('O projeto ou a branch mudou; abra uma nova prévia')
    const result = await recordRestoreCommit(connection, projectId, root, expected.sourceCommitId, requestId,
      preview.sourceChangeId == null ? undefined : { changeId: preview.sourceChangeId, tree: preview.targetTree })
    return { commitId: result.commitId }
  })
}
