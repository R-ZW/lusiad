import type { JavaModel, PsiNode } from "../types"

/** Pure contract checks shared by all four backend consumers (also runnable without Next). */
export class BackendApiError extends Error {
  readonly code: string
  readonly status: number
  readonly detail: string

  constructor(context: string, detail: string, code: string, status: number) {
    super(`${context}: ${detail}`)
    this.name = "BackendApiError"
    this.code = code
    this.status = status
    this.detail = detail
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export async function decodeBackendResponse(response: Response, context: string): Promise<Record<string, unknown>> {
  if (response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new BackendApiError(context, `tipo de resposta inválido (HTTP ${response.status})`, "invalid_response", response.status)
  }
  let body: unknown
  try { body = await response.json() }
  catch (failure) {
    if (!(failure instanceof SyntaxError)) throw failure // Broken/aborted body reads belong to transport, not JSON syntax.
    throw new BackendApiError(context, `JSON inválido (HTTP ${response.status})`, "invalid_json", response.status)
  }
  if (!record(body)) {
    throw new BackendApiError(context, `resposta inválida (HTTP ${response.status})`, "invalid_response", response.status)
  }
  if (!response.ok || "error" in body || body.status === "error" || body.status === "partial") {
    const detail = typeof body.error === "string" && body.error ? body.error : `HTTP ${response.status}: operação não concluída`
    throw new BackendApiError(context, detail, typeof body.code === "string" ? body.code : "operation_failed", response.status)
  }
  return body
}

function invalid(context: string): never { throw new BackendApiError(context, "resposta inválida do backend", "invalid_response", 200) }
function integer(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum
}

export interface MutationResult { status: "ok"; message?: string; path?: string }

export type FormattingStatus = "formatted" | "skipped_whitespace" | "rejected" | "failed"
export interface PsiSaveMetadata { saved: true; formatting: { status: FormattingStatus } }

export function requirePsiMutationResult<T extends MutationResult & PsiSaveMetadata>(body: Record<string, unknown>, context: string, requiredFields: readonly string[] = []): T {
  requireMutationResult(body, context, requiredFields)
  if (body.saved !== true || !record(body.formatting) || typeof body.formatting.status !== "string"
    || !["formatted", "skipped_whitespace", "rejected", "failed"].includes(body.formatting.status)) invalid(context)
  if (body.noOp === true && typeof body.revision === 'string' && /^[a-f0-9]{64}$/.test(body.revision)) return body as T
  if (body.recordVersion !== 2 || typeof body.revision !== "string" || !/^[a-f0-9]{64}$/.test(body.revision)
    || typeof body.operationId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(body.operationId)
    || !integer(body.operationOrder, 1) || !integer(body.changeId, 1)) invalid(context)
  return body as T
}

export function requireMutationResult<T extends MutationResult>(body: Record<string, unknown>, context: string, requiredFields: readonly string[] = []): T {
  if ("error" in body || body.status !== "ok") invalid(context)
  if (requiredFields.some((key) => !(key in body))) invalid(context)
  for (const key of ["message", "path", "name", "oldName", "newName", "oldPath", "newPath", "mode"]) {
    if (key in body && typeof body[key] !== "string") invalid(context)
  }
  for (const key of ["size", "startOffset", "endOffset", "removedChars", "insertedChars", "movedChars", "targetOriginalOffset", "offset", "line", "lineEnd", "column"]) {
    if (key in body && !integer(body[key])) invalid(context)
  }
  return body as T
}

export function requirePsiModel(body: Record<string, unknown>, context: string): JavaModel {
  if ("error" in body || typeof body.file !== "string" || !record(body.tree)) invalid(context)
  if ("revision" in body && (typeof body.revision !== "string" || !/^[a-f0-9]{64}$/.test(body.revision))) invalid(context)
  // Iterative validation avoids a second recursive stack on deeply nested source files.
  const pending: unknown[] = [body.tree]
  while (pending.length) {
    const node = pending.pop()
    if (!record(node) || "error" in node || typeof node.type !== "string" || !node.type.trim()) invalid(context)
    for (const key of ["startLine", "startColumn", "endLine", "endColumn"]) {
      if (!integer(node[key], 1)) invalid(context)
    }
    for (const key of ["startOffset", "endOffset"]) {
      if (key in node && !integer(node[key])) invalid(context)
    }
    if (typeof node.startOffset === "number" && typeof node.endOffset === "number" && node.endOffset < node.startOffset) invalid(context)
    if ("text" in node && typeof node.text !== "string") invalid(context)
    if ("children" in node) {
      if (!Array.isArray(node.children)) invalid(context)
      for (const child of node.children) pending.push(child)
    }
  }
  return body as unknown as { file: string; tree: PsiNode }
}

export interface RestoreResult {
  status: "ok"
  targetChangeId: number
  errorCount: number
  appliedCount: number
  applied: Array<{ id: number; result?: string }>
  errors: Array<{ id?: number; result?: string }>
}

export function requireRestoreResult(body: Record<string, unknown>, context: string, targetChangeId: number, expected?: { snapshotId: string; projectId: number; commitId: number; gitId: string }): RestoreResult {
  if ("error" in body || body.status !== "ok" || body.targetChangeId !== targetChangeId
      || body.errorCount !== 0 || !integer(body.appliedCount, 1)
      || !Array.isArray(body.applied) || body.appliedCount !== body.applied.length
      || !Array.isArray(body.errors) || body.errors.length !== 0
      || !body.applied.every((entry) => record(entry) && integer(entry.id, 1))
      || !body.applied.some((entry) => entry.id === targetChangeId)) invalid(context)
  const ids = (body.applied as Array<{ id: number }>).map(entry => entry.id)
  if (ids.at(-1) !== targetChangeId || ids.some((id, index) => id > targetChangeId || (index > 0 && id <= ids[index - 1]))) invalid(context)
  if (expected && Object.entries(expected).some(([key,value]) => body[key] !== value)) invalid(context)
  return body as unknown as RestoreResult
}
