import "server-only"
import { backendUrl } from "@/lib/config/backend"
import { postBackendJson } from "@/lib/services/backend-client"
import { BackendApiError, requireMutationResult } from "@/lib/services/backend-response"

/** Reconciles only recorded edit intents; never resets a project or overwrites a file. */
export async function recoverPsiEdits(projectId: number): Promise<void> {
  await postBackendJson(backendUrl("/psi/recover"), { projectId }, "Falha ao recuperar edição", (body, context) => {
    requireMutationResult(body, context)
    if (!Number.isSafeInteger(body.recovered) || Number(body.recovered) < 0)
      throw new BackendApiError(context, "resposta inválida de recuperação", "invalid_response", 200)
    return body
  })
}
