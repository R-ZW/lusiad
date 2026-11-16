import { BackendApiError } from "./backend-response.ts"

export interface BackendActionFailure { backendError: { code: string; message: string } }
export type BackendActionResult<T> = T | BackendActionFailure

/** Expected backend errors cross the Server Action boundary as data, not redacted production exceptions. */
export async function captureBackendAction<T>(operation: () => Promise<T>, message: (error: BackendApiError) => Promise<string>): Promise<BackendActionResult<T>> {
  try { return await operation() }
  catch (error) {
    if (!(error instanceof BackendApiError)) throw error
    return { backendError: { code: error.code, message: await message(error) } }
  }
}

export function unwrapBackendAction<T>(result: BackendActionResult<T>): T {
  if (result && typeof result === "object" && "backendError" in result) {
    throw new Error((result as BackendActionFailure).backendError.message)
  }
  return result as T
}
