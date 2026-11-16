import { requireJavaContext, requireJavaResult, type JavaSettings } from './java-contract.ts'
import type { SyntaxOperation } from '../syntax-diagnostics/syntax-contract'
import { BackendApiError, decodeBackendResponse } from '../backend-response.ts'

/** Browser -> same-origin Next route -> existing authenticated local API client. No credential in this module. */
async function request(action: string, data: object): Promise<Record<string, unknown>> {
  const response = await fetch('/api/lusiad/java', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }), cache: 'no-store', redirect: 'error' })
  const value = await decodeBackendResponse(response, 'Java')
  if ('backendError' in value) {
    const error = value.backendError as { message?: string; code?: string }
    throw new BackendApiError('Java', typeof error?.message === 'string' ? error.message : 'Java request failed', error.code ?? 'java_request_failed', response.status)
  }
  return value
}
export async function javaContextController(projectId: number, settings?: JavaSettings, configurationRevision?: string) {
  return requireJavaContext(await request('context', { projectId, settings, configurationRevision }), 'Java')
}
export async function analyzeJavaProjectController(projectId: number, requestId: string) {
  return requireJavaResult(await request('analyze', { projectId, requestId }), 'Java', requestId)
}
export async function analyzeJavaOperationController(projectId: number, path: string, content: string, revision: string, operation: SyntaxOperation, requestId = crypto.randomUUID()) {
  return requireJavaResult(await request('proposal', { projectId, path, content, revision, operation, requestId }), 'Java', requestId)
}
export async function checkJavaContextController(projectId: number, revision: string) {
  const result = await request('check', { projectId, revision })
  if (result.status !== 'ok') throw new Error('Java context could not be checked')
  return true
}
export async function cancelJavaAnalysisController(projectId: number, channel: 'saved' | 'proposal', requestId: string) {
  const result = await request('cancel', { projectId, channel, requestId })
  if (result.status !== 'ok') throw new Error('Java analysis cancellation failed')
  return true
}
