import { backendAction } from '@/lib/services/backend-action'
import { undoRequest } from '@/lib/services/undo/undo.service'
import type { UndoCursor } from '@/lib/services/undo/undo-contract'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  let valid = false
  try {
    const reader = request.body?.getReader(); if (!reader) throw new Error('Missing JSON')
    const parts: Uint8Array[] = []; let size = 0
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 4*1024*1024) { await reader.cancel(); return Response.json({ error: 'Request exceeds 4 MiB' }, { status: 413 }) }; parts.push(value) }
    const body = JSON.parse(Buffer.concat(parts).toString('utf8')) as Record<string,unknown>
    if (!body || !Number.isSafeInteger(body.projectId) || Number(body.projectId) <= 0 || !['status','preview','analyze','apply','receipt','cancel'].includes(String(body.action))) throw new Error('Invalid request')
    valid = true
    const result = await backendAction(() => undoRequest(Number(body.projectId), String(body.action), body.cursor as UndoCursor, body.semantic === true, body.contextRevision as string | undefined))
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ error: valid ? 'Undo/redo is unavailable' : 'Invalid undo request', code: valid ? 'undo_unavailable' : 'invalid_request' }, { status: valid ? 503 : 400 }) }
}
