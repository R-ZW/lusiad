import { backendAction } from '@/lib/services/backend-action'
import { javaRunRequest } from '@/lib/services/java-run/java-run.service'

export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  let valid = false
  try {
    const reader = request.body?.getReader()
    if (!reader) throw new Error('JSON body required')
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 4096) { await reader.cancel(); return Response.json({ code: 'body_too_large', error: 'Java run request exceeds 4 KiB' }, { status: 413 }) }
      chunks.push(value)
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
    if (!body || !Number.isSafeInteger(body.projectId) || Number(body.projectId) <= 0
        || !['list', 'status', 'start', 'stop'].includes(String(body.action))) throw new Error('Invalid request')
    const action = body.action as 'list' | 'status' | 'start' | 'stop'
    if (action === 'start' && (typeof body.main !== 'string' || !body.main || typeof body.contextRevision !== 'string')) throw new Error('Invalid selection')
    if (action === 'stop' && typeof body.runId !== 'string') throw new Error('Invalid execution')
    valid = true
    const result = await backendAction(() => javaRunRequest(Number(body.projectId), action, {
      main: body.main as string | undefined, contextRevision: body.contextRevision as string | undefined, runId: body.runId as string | undefined,
    }))
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ code: valid ? 'java_gateway_unavailable' : 'invalid_request',
      error: valid ? 'Java run gateway is unavailable' : 'Invalid Java run request' }, { status: valid ? 503 : 400 })
  }
}
