import { BackendApiError } from '../backend-response.ts'
import { readChangeMetadata, type ChangeMetadata } from '../../models/change-history/change-metadata.ts'

export interface UndoStep { id: string; path: string; originalChangeId: number; metadata: ChangeMetadata }
export interface UndoState {
  status: 'ok'; version: 1; epoch: string; revision: number; undoCount: number; redoCount: number; evicted: number
  undo: UndoStep | null; redo: UndoStep | null; blockedCode?: string; blockedMessage?: string
}
export interface UndoCursor { direction: 'undo' | 'redo'; epoch: string; revision: number; requestId: string; corrections?: Record<string,string> }
export interface UndoFile { path: string; beforeKind: 'file' | 'directory' | null; afterKind: 'file' | 'directory' | null; beforeText?: string | null; afterText?: string | null; analysisError?: string }
export interface UndoProposal extends UndoCursor { status: 'ok'; version: 1; logicalId: string; path: string; metadata: ChangeMetadata; files: UndoFile[] }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)
const number = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const path = (value: unknown): value is string => typeof value === 'string' && !!value && !/^[\\/]|^[A-Za-z]:|[\\\0\r\n]/.test(value) && value.split('/').every(p => p && p !== '.' && p !== '..' && p.toLowerCase() !== '.git')
const invalid = (context: string): never => { throw new BackendApiError(context, 'Invalid undo/redo response', 'invalid_response', 200) }
export function requireUndoState(body: Record<string,unknown>, context: string): UndoState {
  if ('error' in body || body.status !== 'ok' || body.version !== 1 || !uuid(body.epoch) || !number(body.revision) || !number(body.evicted)) invalid(context)
  for (const direction of ['undo','redo']) {
    if (!number(body[direction+'Count'])) invalid(context)
    const step = body[direction]
    if (body[direction+'Count'] === 0 ? step !== null : !object(step) || !uuid(step.id) || !path(step.path) || !number(step.originalChangeId) || step.originalChangeId < 1 || !readChangeMetadata({ changeMetadata: step.metadata })) invalid(context)
  }
  for (const key of ['blockedCode','blockedMessage']) if (key in body && typeof body[key] !== 'string') invalid(context)
  return body as unknown as UndoState
}
export function requireUndoProposal(body: Record<string,unknown>, context: string, cursor: UndoCursor): UndoProposal {
  if ('error' in body || body.status !== 'ok' || body.version !== 1 || !uuid(body.logicalId) || !path(body.path)
      || ['direction','epoch','revision','requestId'].some(key => body[key] !== cursor[key as keyof UndoCursor])
      || !readChangeMetadata({ changeMetadata: body.metadata }) || !Array.isArray(body.files)) invalid(context)
  const paths = new Set<string>()
  for (const item of body.files as unknown[]) {
    if (!object(item)) return invalid(context)
    if (!path(item.path) || paths.has(item.path) || ![null,'file','directory'].includes(item.beforeKind as string | null)
      || ![null,'file','directory'].includes(item.afterKind as string | null)) invalid(context)
    paths.add(item.path as string)
    if (String(item.path).toLowerCase().endsWith('.java')) for (const key of ['beforeText','afterText']) if (item[key] !== null && typeof item[key] !== 'string') invalid(context)
  }
  return body as unknown as UndoProposal
}
export function requireUndoReceipt(body: Record<string,unknown>, context: string, requestId: string) {
  if ('error' in body || body.status !== 'ok' || body.operationId !== requestId || !number(body.operationOrder) || body.operationOrder < 1 || !number(body.changeId) || body.changeId < 1 || body.recordVersion !== 3) invalid(context)
  return body
}
/** A correction equal to the current state is acknowledged without inventing an event or receipt. */
export function requireUndoResult(body: Record<string,unknown>, context: string, cursor: UndoCursor) {
  if (body.noOp !== true) return requireUndoReceipt(body, context, cursor.requestId)
  if ('error' in body || body.status !== 'ok' || body.requestId !== cursor.requestId || !object(body.state)
      || ['operationId','operationOrder','changeId'].some(key => key in body)) invalid(context)
  const state = requireUndoState(body.state as Record<string,unknown>, context)
  if (state.epoch !== cursor.epoch || state.revision !== cursor.revision) invalid(context)
  return body
}
