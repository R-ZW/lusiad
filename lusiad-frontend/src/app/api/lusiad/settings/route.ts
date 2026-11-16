import { readPreferences, savePreferences } from '@/lib/config/shared-ui-settings'

export const dynamic = 'force-dynamic'
export async function GET() {
  try { return Response.json({ status: 'ok', preferences: readPreferences() }, { headers: { 'Cache-Control': 'no-store' } }) }
  catch { return Response.json({ error: 'Shared settings unavailable' }, { status: 503 }) }
}
export async function POST(request: Request) {
  try {
    const reader = request.body?.getReader(); if (!reader) throw new Error()
    const chunks: Uint8Array[] = []; let size = 0
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 16384) { await reader.cancel(); return Response.json({ error: 'Preferences too large' }, { status: 413 }) } chunks.push(value) }
    const preferences = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return Response.json({ status: 'ok', preferences: savePreferences(preferences) })
  } catch { return Response.json({ error: 'Could not save shared preferences; reload or retry' }, { status: 409 }) }
}
