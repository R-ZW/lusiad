import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { catalogSyntaxSources, readSyntaxSource, syntaxRevision } from '../src/lib/services/syntax-diagnostics/project-sources.ts'
import { finishedStatus, ProblemsSequence, reusableAnalysis } from '../src/lib/models/model-editor/problems.model.ts'
import type { SyntaxResult } from '../src/lib/services/syntax-diagnostics/syntax-contract.ts'

test('source catalog shares ignored policy, contains paths and leaves CRLF/Unicode bytes untouched', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'lusiad-problems-')), root = join(fixture, 'project'), temp = join(fixture, 'previews')
  mkdirSync(root); mkdirSync(temp)
  const text = 'class Árvore {\r\n String emoji = "🌳";\r\n}\r\n'
  writeFileSync(join(root, 'Árvore.java'), text)
  for (const name of ['.git', '.lusiad-sync-sample', 'target', 'node_modules']) {
    mkdirSync(join(root, name)); writeFileSync(join(root, name, 'Ignored.java'), 'bad')
  }
  writeFileSync(join(temp, 'Snapshot.java'), 'bad')
  const catalog = await catalogSyntaxSources(root, temp)
  assert.deepEqual(catalog.files, [{ file: 'Árvore.java', revision: syntaxRevision(text.replaceAll('\r\n', '\n')) }])
  assert.deepEqual(catalog.failures, [])
  assert.equal(readFileSync(join(root, 'Árvore.java'), 'utf8'), text)
  await assert.rejects(readSyntaxSource(root, '../previews/Snapshot.java'))
  await assert.rejects(readSyntaxSource(root, '.git/Ignored.java'))
  await assert.rejects(catalogSyntaxSources(root, join(root, 'temporary')))
})

test('unreadable Unicode and junctions are failures, never a complete clean scan', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'lusiad-problems-failure-')), root = join(fixture, 'project'), temp = join(fixture, 'temp')
  mkdirSync(root); mkdirSync(temp)
  writeFileSync(join(root, 'Bad.java'), Buffer.from([0xff, 0xfe]))
  writeFileSync(join(temp, 'Outside.java'), 'class Outside {}')
  symlinkSync(temp, join(root, 'redirect'), process.platform === 'win32' ? 'junction' : 'dir')
  const catalog = await catalogSyntaxSources(root, temp)
  assert.equal(catalog.files.length, 0)
  assert.deepEqual(catalog.failures.map(item => item.code).sort(), ['path', 'read'])
  assert.equal(finishedStatus([], catalog.failures), 'unavailable')
  await assert.rejects(readSyntaxSource(root, 'redirect/Outside.java'))
  assert.equal(readFileSync(join(temp, 'Outside.java'), 'utf8'), 'class Outside {}')
})

test('only complete current scopes are eligible for clean, including empty projects; stale/failed results are separate', () => {
  const result = { diagnostics: [] } as unknown as SyntaxResult
  const entry = { file: 'A.java', revision: 'a', result }
  const cache = new Map([['A.java', entry]])
  assert.equal(reusableAnalysis(cache, { file: 'A.java', revision: 'a' }), entry)
  assert.equal(reusableAnalysis(cache, { file: 'A.java', revision: 'b' }), undefined)
  assert.equal(reusableAnalysis(cache, { file: 'B.java', revision: 'a' }), undefined)
  assert.equal(finishedStatus([], []), 'complete')
  assert.equal(finishedStatus([entry], []), 'complete')
  assert.equal(finishedStatus([entry], [], true), 'stale')
  assert.equal(finishedStatus([entry], ['read failure']), 'partial')
  assert.equal(finishedStatus([{ file: 'A.java', revision: 'b', error: 'unavailable' }], []), 'unavailable')
})

test('late file/project scan progress and final results cannot publish after switching scope, path or project', () => {
  const sequence = new ProblemsSequence(), file = sequence.next(), project = sequence.next()
  assert.equal(sequence.current(file), false)
  assert.equal(sequence.current(project), true)
  sequence.invalidate()
  assert.equal(sequence.current(project), false)
  assert.equal(sequence.current(sequence.next()), true)
})
