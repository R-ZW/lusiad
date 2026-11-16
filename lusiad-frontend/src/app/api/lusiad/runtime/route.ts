import { loadRuntimeConfig } from '@/lib/config/runtime-config'
import { databaseIdentity, getPool } from '@/lib/repositories/database'
import { backendRequestOptions } from '@/lib/config/backend'
import { decodeBackendResponse } from '@/lib/services/backend-response'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const config = loadRuntimeConfig()
    if (config.test) return Response.json({}, { status: 404 })
    await getPool().query('SELECT 1')
    const apiPort = Number(new URL(config.apiUrl).port || 80), databaseId = databaseIdentity()
    // Prove Next itself can authenticate; comparing public configuration alone misses token overrides.
    const backend = await decodeBackendResponse(await fetch(`${config.apiUrl}/_lusiad/runtime`, backendRequestOptions()), 'Backend readiness')
    if (backend.version !== 1 || backend.apiAccessVersion !== 1 || backend.apiPort !== apiPort || backend.databaseId !== databaseId) throw new Error('Backend identity mismatch')
    return Response.json({ version: 1, apiAccessVersion: 1, apiPort, databaseId }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ code: 'configuration_unavailable' }, { status: 503 }) }
}
