import 'server-only'
import { backendUrl } from '../../config/backend'
import { postBackendJson } from '../backend-client'
import { requireUndoState, requireUndoProposal, requireUndoReceipt, requireUndoResult, type UndoCursor } from './undo-contract'
import { withLusiadMutation } from '../external-sync/external-sync.service'
import { requireJavaResult } from '../java-diagnostics/java-contract'
import { requireSyntaxResult } from '../syntax-diagnostics/syntax-contract'
import { BackendApiError } from '../backend-response'
import { createHash } from 'node:crypto'
import { findProjectById } from '../../repositories/track-control/track-control.repository'
import { getPool } from '../../repositories/database'
import type { RowDataPacket } from 'mysql2/promise'
import { GitOperation } from '../commit-menu/git-operation'
import { testGitEnvironment } from '../../config/test-git'

async function requireGitContext(projectId: number) {
  const project = await findProjectById(projectId)
  if (!project) throw new BackendApiError('Undo/redo', 'Project not found', 'undo_context_changed', 409)
  const [rows] = await getPool().query<Array<RowDataPacket & { name: string; sha: string | null }>>(
    'SELECT b.name,(SELECT c.git_id FROM commits c WHERE c.branch_id=b.id ORDER BY c.id DESC LIMIT 1) AS sha FROM branches b WHERE b.project_id=? AND b.selected=\'1\'', [projectId])
  if (rows.length > 1) throw new BackendApiError('Undo/redo', 'Ambiguous branch', 'undo_context_changed', 409)
  if (!rows[0]?.sha) return // Registered project before Git initialization.
  const git = new GitOperation(project.path, testGitEnvironment())
  try {
    const ref = await git.headRef()
    if (ref !== 'refs/heads/'+rows[0].name || await git.ref(ref) !== rows[0].sha) throw new Error('Git and the recorded branch differ')
  } catch { throw new BackendApiError('Undo/redo', 'Git context changed outside Lusiad; reconcile it before undo/redo', 'undo_context_changed', 409) }
}

export async function undoRequest(projectId: number, action: string, cursor: UndoCursor, semantic = false, contextRevision?: string) {
  if (action === 'status') return postBackendJson(backendUrl('/undo/status'), { projectId }, 'Undo/redo', requireUndoState)
  if (['preview','analyze','apply'].includes(action)) await requireGitContext(projectId)
  const request = { projectId, ...cursor, semantic, contextRevision }
  if (action === 'preview') return postBackendJson(backendUrl('/undo/preview'), request, 'Undo/redo', (body, context) => requireUndoProposal(body, context, cursor))
  if (action === 'analyze') {
    const proposal = await postBackendJson(backendUrl('/undo/preview'), request, 'Undo/redo', (body, context) => requireUndoProposal(body, context, cursor))
    return postBackendJson(backendUrl('/undo/analyze'), request, 'Undo/redo analysis', (body, context) => {
      if (semantic) return requireJavaResult(body, context, cursor.requestId)
      if (body.status !== 'ok' || !Array.isArray(body.files)) throw new BackendApiError(context, 'Incomplete syntax analysis', 'invalid_response', 200)
      const expected = proposal.files.filter(file => typeof file.afterText === 'string')
      if (expected.length !== body.files.length) throw new BackendApiError(context, 'Incomplete syntax scope', 'invalid_response', 200)
      const results = body.files.map((value, index) => {
        const file = expected[index], source = file.afterText!, revision = createHash('sha256').update(source).digest('hex')
        return requireSyntaxResult(value, context, { file: file.path, baseRevision: revision, revision, source })
      })
      return { status: 'ok', files: results }
    })
  }
  if (action === 'apply') return withLusiadMutation(projectId, [], () => postBackendJson(backendUrl('/undo/apply'), request, 'Undo/redo', (body, context) => requireUndoResult(body, context, cursor)))
  if (action === 'receipt') return postBackendJson(backendUrl('/undo/receipt'), request, 'Undo/redo recovery', (body, context) => requireUndoReceipt(body, context, cursor.requestId))
  if (action === 'cancel') return postBackendJson(backendUrl('/undo/cancel'), request, 'Cancel undo analysis', body => body)
  throw new Error('Unknown undo action')
}
