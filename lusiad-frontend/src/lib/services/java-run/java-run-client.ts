import { decodeBackendResponse, BackendApiError } from '../backend-response'
import { requireJavaRunList, requireJavaRunStatus } from './java-run-contract'
import type { JavaRunList, JavaRunStatus } from './java-run-contract'

export function javaRunClient(projectId: number, action: 'list'): Promise<JavaRunList>
export function javaRunClient(projectId: number, action: 'status'): Promise<JavaRunStatus>
export function javaRunClient(projectId: number, action: 'start', values: { main: string; contextRevision: string }): Promise<JavaRunStatus>
export function javaRunClient(projectId: number, action: 'stop', values: { runId: string }): Promise<JavaRunStatus>
export async function javaRunClient(projectId: number, action: 'list' | 'status' | 'start' | 'stop', values: { main?: string; contextRevision?: string; runId?: string } = {}) {
  const response = await fetch('/api/lusiad/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, action, ...values }), redirect: 'error', cache: 'no-store' })
  const body = await decodeBackendResponse(response, 'Executar Java')
  if ('backendError' in body) {
    const error = body.backendError as { code?: string; message?: string }
    throw new BackendApiError('Executar Java', error.message ?? 'Execução indisponível', error.code ?? 'java_run_unavailable', response.status)
  }
  return action === 'list' ? requireJavaRunList(body) : requireJavaRunStatus(body)
}
