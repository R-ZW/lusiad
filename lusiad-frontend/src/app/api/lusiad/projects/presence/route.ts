import { projectPresence } from '@/lib/services/project-presence'
export const dynamic = 'force-dynamic'
export async function GET() {
  try { return Response.json(await projectPresence({ action: 'status' }, true), { headers: { 'Cache-Control': 'no-store' } }) }
  catch { return Response.json({ error: 'IDE status unavailable' }, { status: 503 }) }
}
export async function POST(request: Request) {
  try {
    const reader = request.body?.getReader(); if (!reader) throw new Error()
    const chunks: Uint8Array[] = []; let size = 0
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 4096) { await reader.cancel(); return Response.json({ error: 'Presence too large' }, { status: 413 }) } chunks.push(value) }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!Number.isSafeInteger(body.projectId) || body.projectId <= 0 || typeof body.tabId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(body.tabId) || body.close !== undefined && typeof body.close !== 'boolean') throw new Error()
    return Response.json(await projectPresence({ action: 'presence', projectId: body.projectId, tabId: body.tabId, close: body.close ?? false }))
  } catch { return Response.json({ error: 'Presence unavailable' }, { status: 503 }) }
}
