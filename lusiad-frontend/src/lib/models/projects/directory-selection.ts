import { BackendApiError } from '../../services/backend-response.ts'

export type DirectorySelectionOperation = 'start' | 'status' | 'cancel'
export interface DirectorySelection {
  status: 'ok'
  requestId: string
  state: 'pending' | 'selected' | 'cancelled' | 'failed'
  path?: string
}

export function directorySelection(body: Record<string, unknown>, context: string, requestId: string): DirectorySelection {
  const path = body.path
  if (body.status !== 'ok' || body.requestId !== requestId || typeof body.state !== 'string' || !['pending', 'selected', 'cancelled', 'failed'].includes(body.state)
    || (body.state === 'selected' ? typeof path !== 'string' || !path || path.includes('\0') || !/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(path) : path !== undefined)) {
    throw new BackendApiError(context, 'Invalid folder selection response', 'invalid_response', 200)
  }
  return body as unknown as DirectorySelection
}
