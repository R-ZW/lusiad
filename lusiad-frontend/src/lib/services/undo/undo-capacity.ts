import { unwrapBackendAction, type BackendActionResult } from '../backend-action-result.ts'

/** Retry only a proven pre-write capacity refusal, after explicit user consent; never a pending write. */
export async function withUndoCapacity<T>(operation: (allowWithoutUndo: boolean) => Promise<BackendActionResult<T>>, question: string): Promise<T> {
  let result = await operation(false)
  if (result && typeof result === 'object' && 'backendError' in result && result.backendError.code === 'undo_capacity') {
    if (window.confirm(question)) result = await operation(true)
  }
  return unwrapBackendAction(result)
}
