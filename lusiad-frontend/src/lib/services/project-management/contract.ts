import { BackendApiError } from '../backend-response.ts'

export type ProjectAction = 'remove' | 'delete' | 'relink' | 'move'
export interface RegistrationView {
  status: 'ok'; id: number; name: string; description: string; path: string; revision: string
  pending: number; changes: number; commits: number; tags: number
}
export interface ProjectPlan extends RegistrationView {
  kind: ProjectAction; newPath?: string; destinationDirectory?: string; files?: number; bytes?: number; snapshotsRetained: string
}
export interface ProjectReceipt { status: 'ok'; operationId: string; state: 'prepared' | 'applied' | 'completed' | 'aborted'; completed: boolean }
export interface ProjectOperation { operationId: string; projectId: number; kind: ProjectAction; state: 'prepared' | 'applied'; path: string; stagedPath?: string; newPath?: string }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const integer = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const action = (v: unknown) => typeof v === 'string' && ['remove', 'delete', 'relink', 'move'].includes(v)
const uuid = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
function invalid(context: string): never { throw new BackendApiError(context, 'Invalid project response', 'invalid_response', 200) }
export function registration(body: Record<string, unknown>, context: string): RegistrationView {
  if (body.status !== 'ok' || !integer(body.id) || Number(body.id) < 1
    || ['name', 'description', 'path'].some(k => typeof body[k] !== 'string')
    || typeof body.revision !== 'string' || !/^[a-f0-9]{64}$/.test(body.revision)
    || ['pending', 'changes', 'commits', 'tags'].some(k => !integer(body[k]))) invalid(context)
  return body as unknown as RegistrationView
}
export function plan(body: Record<string, unknown>, context: string): ProjectPlan {
  registration(body, context)
  if (!action(body.kind) || typeof body.snapshotsRetained !== 'string'
    || (['relink', 'move'].includes(String(body.kind)) && typeof body.newPath !== 'string')
    || (body.kind === 'move' && (typeof body.destinationDirectory !== 'string' || !integer(body.files) || !integer(body.bytes)))
    || (body.kind === 'delete' && (!integer(body.files) || !integer(body.bytes)))) invalid(context)
  return body as unknown as ProjectPlan
}
export function receipt(body: Record<string, unknown>, context: string): ProjectReceipt {
  if (body.status !== 'ok' || !uuid(body.operationId) || typeof body.completed !== 'boolean'
    || !['prepared', 'applied', 'completed', 'aborted'].includes(String(body.state))
    || body.completed !== (body.state === 'completed')) invalid(context)
  return body as unknown as ProjectReceipt
}
export function operations(body: Record<string, unknown>, context: string): ProjectOperation[] {
  const items = body.operations
  if (body.status !== 'ok' || !Array.isArray(items)) invalid(context)
  for (const item of items) if (!object(item) || !uuid(item.operationId) || !integer(item.projectId)
    || Number(item.projectId) < 1 || !action(item.kind) || !['prepared', 'applied'].includes(String(item.state))
    || typeof item.path !== 'string' || (item.kind === 'move' && typeof item.newPath !== 'string') || ('stagedPath' in item && typeof item.stagedPath !== 'string')) invalid(context)
  return items as ProjectOperation[]
}
