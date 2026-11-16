import { BackendApiError } from "../backend-response.ts"
import { captureBackendAction } from "../backend-action-result.ts"

/** Never serialize raw SQL/child-process errors (including their credentials/output). */
export function captureGitAction<T>(operation: () => Promise<T>, message: (error: BackendApiError) => Promise<string>) {
  return captureBackendAction(async () => {
    try { return await operation() }
    catch (error) {
      if (error instanceof BackendApiError) throw error
      throw new BackendApiError("Git", "", "git_operation_failed", 503)
    }
  }, message)
}
