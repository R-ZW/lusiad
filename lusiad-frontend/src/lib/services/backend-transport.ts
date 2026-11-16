import { BackendApiError, decodeBackendResponse } from "./backend-response.ts"

export interface BackendConnection {
  apiUrl: string
  token: string
  timeoutMs: number
  headers?: Record<string, string>
}

/** One deadline covers headers AND the JSON body. No retries: a timed-out mutation may still finish. */
export async function requestBackendJson<T>(
  connection: BackendConnection,
  endpoint: string,
  body: unknown,
  context: string,
  validate: (body: Record<string, unknown>, context: string) => T,
): Promise<T> {
  if (new URL(endpoint).origin !== new URL(connection.apiUrl).origin || !connection.token) {
    throw new BackendApiError(context, "Confira a configuração compartilhada e inicie novamente o plugin e o frontend.", "backend_configuration", 0)
  }
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), connection.timeoutMs)
  try {
    const response = await fetch(endpoint, {
      method: "POST", headers: { ...connection.headers, "Content-Type": "application/json", "X-Lusiad-Token": connection.token },
      body: JSON.stringify(body), signal: controller.signal, redirect: "error", cache: "no-store",
    })
    return validate(await decodeBackendResponse(response, context), context)
  } catch (failure) {
    if (controller.signal.aborted) {
      throw new BackendApiError(context, "Tempo limite de comunicação excedido. A operação pode continuar no plugin; confira o estado antes de repetir.", "backend_timeout", 0)
    }
    if (failure instanceof BackendApiError) throw failure
    throw new BackendApiError(context, "Não foi possível concluir a comunicação com o plugin. Confira sua execução e o estado da operação antes de repetir.", "backend_unavailable", 0)
  } finally {
    clearTimeout(deadline)
    controller.abort() // Also release an unread body after a rejected Content-Type/contract.
  }
}
