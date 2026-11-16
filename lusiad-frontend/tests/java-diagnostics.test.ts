import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { requireJavaContext, requireJavaResult } from '../src/lib/services/java-diagnostics/java-contract.ts'
import { BackendApiError, requirePsiModel } from '../src/lib/services/backend-response.ts'
import { requestBackendJson } from '../src/lib/services/backend-transport.ts'
import { analyzeJavaProjectController, cancelJavaAnalysisController, checkJavaContextController } from '../src/lib/services/java-diagnostics/java-client.ts'

const id = 'b3dce567-fc7c-4b82-91bd-b5723cb4a043', hash = 'a'.repeat(64)
const result = () => ({ status: 'ok', version: 1, source: 'javac', requestId: id, contextRevision: hash, runtime: '21.0.8', release: 21,
  files: [{ file: 'A.java', revision: hash, sourceLength: 10, test: false }], diagnostics: [] as unknown[], file: null, baseRevision: null, revision: null, proposedContent: null })

test('Java result identifies the exact request, context and all source revisions without masquerading as PSI', () => {
  assert.equal(requireJavaResult(result(), 'Java', id).diagnostics.length, 0)
  assert.throws(() => requirePsiModel(result(), 'PSI'), BackendApiError)
  for (const patch of [{ requestId: 'previous request' }, { source: 'psi-syntax' }, { status: 'partial' }, { status: 'cancelled' }, { error: 'failed' },
    { files: [{ file: '../A.java', revision: hash, sourceLength: 0, test: false }] }, { contextRevision: 'old' }, { files: [...result().files, ...result().files] },
    { diagnostics: [{ severity: 'error', code: 'code', message: 'message', file: 'Other.java', revision: hash, range: null }] },
    { file: 'A.java', baseRevision: hash, revision: hash, proposedContent: '' }])
    assert.throws(() => requireJavaResult({ ...result(), ...patch }, 'Java', id), BackendApiError)
})

test('Java errors retain file provenance, global errors and EOF ranges; malformed ranges and revision mixing are rejected', () => {
  const range = { startOffset: 10, endOffset: 10, startLine: 1, startColumn: 11, endLine: 1, endColumn: 11 }
  const problem = { severity: 'error', code: 'compiler.err.premature.eof', message: 'reached end of file while parsing', file: 'A.java', revision: hash, range }
  const valid = { ...result(), diagnostics: [problem, { ...problem, file: null, revision: null, range: null }] }
  assert.equal(requireJavaResult(valid, 'Java', id).diagnostics.length, 2)
  for (const patch of [{ revision: 'b'.repeat(64) }, { range: { ...range, endOffset: 11 } }, { range: { ...range, startLine: 0 } }, { range: { ...range, startOffset: -1 } }])
    assert.throws(() => requireJavaResult({ ...result(), diagnostics: [{ ...problem, ...patch }] }, 'Java', id), BackendApiError)
})

test('Java configuration projection requires explicit source/dependency arrays and supported runtime details', () => {
  const context = { status: 'ok', version: 1, configurationRevision: 'missing', runtimeHome: 'C:/jdk', runtimeVersion: '21', available: true, supportedReleases: [17, 21],
    settings: { jdkHome: 'C:/jdk', release: 21, sourceRoots: ['.'], testRoots: [], classpath: [], modulePath: [] } }
  assert.deepEqual(requireJavaContext(context, 'Java'), context)
  assert.throws(() => requireJavaContext({ ...context, settings: { ...context.settings, classpath: 'ambient' } }, 'Java'), BackendApiError)
  assert.throws(() => requireJavaContext({ ...context, available: null }, 'Java'), BackendApiError)
})

test('unavailable, invalid, stale and cancelled compiler responses cannot become green; recovery uses one normal request', async () => {
  let mode = 'ok'
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (mode === 'invalid') { response.end(JSON.stringify({ status: 'ok', diagnostics: [] })); return }
    if (mode !== 'ok') { response.statusCode = mode === 'unavailable' ? 503 : 409; response.end(JSON.stringify({ status: 'error', code: mode, error: mode })); return }
    response.end(JSON.stringify(result()))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const run = () => requestBackendJson({ apiUrl: url, token: 'fixture', timeoutMs: 2000 }, url + '/java/analyze', {}, 'Java', (body, context) => requireJavaResult(body, context, id))
  try {
    for (const failure of ['unavailable', 'stale', 'cancelled', 'invalid']) {
      mode = failure
      await assert.rejects(run, (error: unknown) => error instanceof BackendApiError && error.code === (failure === 'invalid' ? 'invalid_response' : failure))
      mode = 'ok'; assert.equal((await run()).source, 'javac')
    }
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})

test('browser Java gateway preserves failure codes and sends cancellation concurrently for the exact request', async () => {
  const original = globalThis.fetch, requests: Record<string, unknown>[] = []
  let finish: ((response: Response) => void) | undefined
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/lusiad/java')
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>; requests.push(body)
    assert.equal((init?.headers as Record<string, string>)['X-Lusiad-Token'], undefined)
    if (body.action === 'analyze') return new Promise<Response>(resolve => { finish = resolve })
    if (body.action === 'check') return Response.json({ backendError: { code: 'java_context_stale', message: 'Sources changed' } })
    return Response.json({ status: 'ok' })
  }
  try {
    const analysis = analyzeJavaProjectController(1, id)
    await cancelJavaAnalysisController(1, 'saved', id)
    assert.equal(requests.length, 2); assert.equal(requests[1].requestId, id)
    finish!(Response.json(result())); assert.equal((await analysis).requestId, id)
    await assert.rejects(checkJavaContextController(1, hash), (error: unknown) => error instanceof BackendApiError && error.code === 'java_context_stale')
  } finally { globalThis.fetch = original }
})
