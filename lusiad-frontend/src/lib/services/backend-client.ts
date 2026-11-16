import "server-only"
import { backendConnection } from "../config/backend"
import { requestBackendJson } from "./backend-transport"

export async function postBackendJson<T>(
  endpoint: string,
  body: unknown,
  context: string,
  validate: (body: Record<string, unknown>, context: string) => T,
): Promise<T> {
  return requestBackendJson(backendConnection(), endpoint, body, context, validate)
}
