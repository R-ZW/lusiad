import { decodeBackendResponse, BackendApiError } from '../backend-response'
import { requireUndoState, requireUndoProposal, requireUndoReceipt, requireUndoResult, type UndoCursor } from './undo-contract'
import type { SyntaxResult } from '../syntax-diagnostics/syntax-contract'
import { requireJavaResult, type JavaResult } from '../java-diagnostics/java-contract'
async function call(projectId: number, action: string, cursor?: UndoCursor, semantic?: boolean, contextRevision?: string) {
  const response = await fetch('/api/lusiad/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, action, cursor, semantic, contextRevision }) })
  const body = await decodeBackendResponse(response, 'Undo/redo')
  if ('backendError' in body) { const error = body.backendError as { code: string; message: string }; throw new BackendApiError('Undo/redo', error.message, error.code, 409) }
  return body
}
export const undoState = async (projectId: number) => requireUndoState(await call(projectId, 'status'), 'Undo/redo')
export const undoPreview = async (projectId: number, cursor: UndoCursor) => requireUndoProposal(await call(projectId, 'preview', cursor), 'Undo/redo', cursor)
export async function undoApply(projectId: number, cursor: UndoCursor, contextRevision?: string) {
  try { return requireUndoResult(await call(projectId, 'apply', cursor, false, contextRevision), 'Undo/redo', cursor) }
  catch (original) {
    // A lost HTTP/SQL acknowledgement does not permit a second mutation. Query only its same-id receipt.
    try { return requireUndoReceipt(await call(projectId, 'receipt', cursor), 'Undo/redo recovery', cursor.requestId) }
    catch { throw original }
  }
}
export const undoCancel = (projectId: number, cursor: UndoCursor) => call(projectId, 'cancel', cursor)
export async function undoAnalyze(projectId: number, cursor: UndoCursor, semantic: boolean): Promise<JavaResult | { status: 'ok'; files: SyntaxResult[] }> {
  const result = await call(projectId, 'analyze', cursor, semantic)
  if (semantic) return requireJavaResult(result, 'Undo/redo', cursor.requestId)
  if (result.status !== 'ok' || !Array.isArray(result.files)) throw new BackendApiError('Undo/redo', 'Invalid syntax analysis', 'invalid_response', 200)
  // The same-origin server validates every parser result against the exact backend proposal.
  return result as unknown as { status: 'ok'; files: SyntaxResult[] }
}
