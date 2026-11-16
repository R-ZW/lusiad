import { backendAction } from '@/lib/services/backend-action'
import { analyzeJavaOperation, analyzeJavaProject, cancelJavaAnalysis, checkJavaContext, javaContext } from '@/lib/services/java-diagnostics/java-diagnostics.service'
import type { JavaSettings } from '@/lib/services/java-diagnostics/java-contract'
import type { SyntaxOperation } from '@/lib/services/syntax-diagnostics/syntax-contract'

export const dynamic = 'force-dynamic'

/** Same-origin JSON facade: keeps the API token private and allows cancel/refresh outside Next's serial action queue. */
export async function POST(request: Request) {
  let valid = false
  try {
    const reader = request.body?.getReader()
    if (!reader) throw new Error('JSON body required')
    const buffers: Uint8Array[] = []; let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 4 * 1024 * 1024) { await reader.cancel(); return Response.json({ error: 'Java request exceeds 4 MiB' }, { status: 413 }) }
      buffers.push(value)
    }
    const body = JSON.parse(Buffer.concat(buffers).toString('utf8')) as Record<string, unknown>
    if (!body || !Number.isSafeInteger(body.projectId) || Number(body.projectId) <= 0) throw new Error('Invalid project')
    if (!['context', 'analyze', 'proposal', 'check', 'cancel'].includes(String(body.action))) throw new Error('Invalid Java action')
    valid = true
    const projectId = Number(body.projectId)
    const result = await backendAction(async () => {
      switch (body.action) {
        case 'context': return javaContext(projectId, body.settings as JavaSettings | undefined, body.configurationRevision as string | undefined)
        case 'analyze': return analyzeJavaProject(projectId, String(body.requestId))
        case 'proposal': return analyzeJavaOperation(projectId, String(body.path), body.content as string, String(body.revision), body.operation as SyntaxOperation, String(body.requestId))
        case 'check': await checkJavaContext(projectId, String(body.revision)); return { status: 'ok' }
        case 'cancel': {
          if (body.channel !== 'saved' && body.channel !== 'proposal') throw new Error('Invalid analysis channel')
          await cancelJavaAnalysis(projectId, body.channel, String(body.requestId)); return { status: 'ok' }
        }
        default: throw new Error('Invalid Java action')
      }
    })
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ error: valid ? 'Java checks are unavailable' : 'Invalid Java request', code: valid ? 'java_gateway_unavailable' : 'invalid_request' }, { status: valid ? 503 : 400 }) }
}
