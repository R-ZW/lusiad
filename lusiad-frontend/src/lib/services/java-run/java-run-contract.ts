import { BackendApiError } from '../backend-response'

export interface JavaMain { className: string; file: string; test: boolean }
export interface JavaRunList { status: 'ok'; contextRevision: string; mains: JavaMain[] }
export type JavaRunState = 'idle' | 'preparing' | 'compiling' | 'running' | 'succeeded' | 'failed' | 'stopped'
export interface JavaRunStatus {
  status: 'ok'; state: JavaRunState; id?: string; projectId?: number; main?: string; contextRevision?: string
  output?: string; errors?: string; exitCode?: number; message?: string
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const revision = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
function invalid(): never { throw new BackendApiError('Executar Java', 'Resposta inválida do plugin', 'invalid_response', 200) }
export function requireJavaRunList(body: Record<string, unknown>): JavaRunList {
  const mains = body.mains
  if (body.status !== 'ok' || !revision(body.contextRevision)) invalid()
  if (!Array.isArray(mains)) invalid()
  const seen = new Set<string>()
  for (const item of mains) {
    if (!object(item) || typeof item.className !== 'string' || !item.className || typeof item.file !== 'string' || !item.file
        || typeof item.test !== 'boolean' || seen.has(item.className)) invalid()
    seen.add(item.className)
  }
  return body as unknown as JavaRunList
}
export function requireJavaRunStatus(body: Record<string, unknown>): JavaRunStatus {
  if (body.status !== 'ok' || !['idle', 'preparing', 'compiling', 'running', 'succeeded', 'failed', 'stopped'].includes(String(body.state))) invalid()
  if (body.state === 'idle') return body as unknown as JavaRunStatus
  const { id, projectId, main, contextRevision, output, errors, exitCode, message } = body
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)
      || typeof projectId !== 'number' || !Number.isSafeInteger(projectId)
      || typeof main !== 'string' || !main || !revision(contextRevision)) invalid()
  if (typeof output !== 'string' || typeof errors !== 'string') invalid()
  if (output.length + errors.length > 256 * 1024
      || exitCode !== undefined && (typeof exitCode !== 'number' || !Number.isSafeInteger(exitCode))
      || message !== undefined && typeof message !== 'string') invalid()
  return body as unknown as JavaRunStatus
}
