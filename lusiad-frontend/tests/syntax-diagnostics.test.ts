import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { syntaxSource, requireSyntaxResult, type SyntaxExpectation } from '../src/lib/services/syntax-diagnostics/syntax-contract.ts'
import { BackendApiError, requirePsiModel } from '../src/lib/services/backend-response.ts'
import { requestBackendJson } from '../src/lib/services/backend-transport.ts'

const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const source = 'class Demo {\r\n String text = "😀 café";\r\n int value = ;\r\n}\r\n'
const expected: SyntaxExpectation = { file: 'src/Demo.java', source, revision: hash(source), baseRevision: hash(source) }
const good = () => ({ status: 'ok', version: 1, source: 'psi-syntax', file: expected.file, revision: expected.revision,
  baseRevision: expected.baseRevision, sourceLength: source.length, languageLevel: 'JDK_25', diagnostics: [] as unknown[] })

test('syntax proposals retain the entire original file and exact CRLF/Unicode, including insertion and deletion', () => {
  const start = source.indexOf('int value'), end = source.indexOf(';', start) + 1
  assert.equal(syntaxSource(source), source)
  assert.equal(syntaxSource(source, { startOffset: start, endOffset: end, newContent: 'int valid = 1;' }), source.slice(0, start) + 'int valid = 1;' + source.slice(end))
  assert.equal(syntaxSource(source, { startOffset: source.length, endOffset: source.length, newContent: '\r\n' }), source + '\r\n')
  assert.equal(syntaxSource(source, { startOffset: 0, endOffset: source.length, newContent: '' }), '')
  const emoji = source.indexOf('😀')
  assert.throws(() => syntaxSource(source, { startOffset: emoji, endOffset: emoji + 1, newContent: '' }))
  assert.throws(() => syntaxSource('\uD800'))
  for (const edit of [{ startOffset: -1, endOffset: 0, newContent: '' }, { startOffset: 5, endOffset: 4, newContent: '' },
    { startOffset: 0, endOffset: source.length + 1, newContent: '' }, { startOffset: 0.5, endOffset: 4, newContent: '' }])
    assert.throws(() => syntaxSource(source, edit))
})

test('syntax success identifies the exact revision, distinguishes PSI, and preserves original and zero-width coordinates', () => {
  assert.deepEqual(requireSyntaxResult(good(), 'syntax', expected), good())
  const body = good(), offset = source.indexOf(';', source.indexOf('int value'))
  body.diagnostics = [{ severity: 'error', message: 'Expression expected', range: { startOffset: offset, endOffset: offset,
    startLine: 3, startColumn: 14, endLine: 3, endColumn: 14 } }, { severity: 'error', message: 'Parser location unavailable', range: null }]
  assert.equal(requireSyntaxResult(body, 'syntax', expected).diagnostics.length, 2)
  body.diagnostics = [{ severity: 'error', message: "'}' expected", range: { startOffset: source.length, endOffset: source.length,
    startLine: 5, startColumn: 1, endLine: 5, endColumn: 1 } }]
  assert.equal(requireSyntaxResult(body, 'syntax', expected).diagnostics[0].range?.startOffset, source.length)
  assert.throws(() => requirePsiModel(body, 'psi'), BackendApiError)
  for (const patch of [{ status: 'partial' }, { status: 'cancelled' }, { status: 'error', error: 'failed' }, { error: 'failed' },
    { version: 2 }, { file: 'Other.java' }, { baseRevision: 'c'.repeat(64) }, { revision: hash(source.replaceAll('\r\n', '\n')) },
    { sourceLength: source.length - 1 }, { diagnostics: {} }, { source: 'compiler' }, { languageLevel: true }])
    assert.throws(() => requireSyntaxResult({ ...good(), ...patch }, 'syntax', expected), BackendApiError)
  for (const patch of [{ endOffset: source.length + 1 }, { startOffset: -1 }, { startLine: 4 }, { endColumn: 2 }]) {
    const invalid = { ...body, diagnostics: [{ severity: 'error', message: 'bad', range: {
      startOffset: source.length, endOffset: source.length, startLine: 5, startColumn: 1, endLine: 5, endColumn: 1, ...patch } }] }
    assert.throws(() => requireSyntaxResult(invalid, 'syntax', expected), BackendApiError)
  }
})

test('syntax HTTP failure, cancellation, malformed response and recovery use the existing transport without fake empty success', async () => {
  let mode = 'ok', calls = 0
  const server = createServer((_req, res) => {
    calls++; res.setHeader('Content-Type', 'application/json')
    if (mode === 'error') { res.statusCode = 500; res.end(JSON.stringify({ status: 'error', code: 'syntax_analysis_failed', error: 'failed' })); return }
    if (mode === 'cancelled') { res.statusCode = 409; res.end(JSON.stringify({ status: 'error', code: 'syntax_analysis_cancelled', error: 'cancelled' })); return }
    if (mode === 'malformed') { res.end(JSON.stringify({ status: 'ok', diagnostics: [] })); return }
    res.end(JSON.stringify(good()))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const apiUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const run = () => requestBackendJson({ apiUrl, token: 'fixture-token', timeoutMs: 2000 }, apiUrl + '/psi/diagnose', {}, 'syntax',
    (body, context) => requireSyntaxResult(body, context, expected))
  try {
    for (const [value, code] of [['error', 'syntax_analysis_failed'], ['cancelled', 'syntax_analysis_cancelled'], ['malformed', 'invalid_response']]) {
      mode = value; const before = calls
      await assert.rejects(run, (error: unknown) => error instanceof BackendApiError && error.code === code)
      assert.equal(calls, before + 1)
      mode = 'ok'; assert.deepEqual(await run(), good())
    }
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
