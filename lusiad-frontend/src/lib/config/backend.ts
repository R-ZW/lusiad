import "server-only"
import { loadRuntimeConfig } from "./runtime-config"
import { loadApiToken } from "./operational-config"
import type { BackendConnection } from "../services/backend-transport"

export function backendUrl(path: string): string { return `${loadRuntimeConfig().apiUrl}${path}` }

export function backendConnection(): BackendConnection {
  const config = loadRuntimeConfig()
  return {
    apiUrl: config.apiUrl, token: loadApiToken(),
    timeoutMs: config.requestTimeoutMs || 60000,
    headers: { ...(config.test ? {
      "X-Lusiad-Test-Run": config.test.runId, "X-Lusiad-Test-Config": config.test.configHash,
    } : {}) },
  }
}

/** Readiness checks are server-only too; never expose this object to a browser. */
export function backendRequestOptions(): Pick<RequestInit, "headers" | "signal" | "redirect" | "cache"> {
  const connection = backendConnection()
  return { headers: { ...connection.headers, "Content-Type": "application/json", "X-Lusiad-Token": connection.token },
    signal: AbortSignal.timeout(connection.timeoutMs), redirect: "error", cache: "no-store" }
}
