import assert from 'node:assert/strict'
import test from 'node:test'
import { generatedChangeText, localizeGeneratedChange } from '../src/lib/i18n/change-text.ts'
import { bundleMetadata, elementKinds, readChangeMetadata, type ChangeMetadata, type ChangeSide } from '../src/lib/models/change-history/change-metadata.ts'
import { en, ptBR } from '../src/lib/i18n/messages.ts'
import { buildChangeHistoryRecordModel } from '../src/lib/models/change-history/change-history.model.ts'

const side = (name = 'count', path = 'src/Ω.java'): ChangeSide => ({ path,
  range: { start: 10, end: 20, startLine: 2, endLine: 2, startColumn: 3, endColumn: 12 },
  element: { kind: 'field', name }, context: [{ kind: 'class', name: 'Calculadora😀' }] })
const facts = (): ChangeMetadata => ({ version: 1, action: 'update', kind: 'code', before: side('n'), after: side(),
  differences: [{ field: 'name', before: 'n', after: 'count' }] })

test('semantic names, paths and before/after values are preserved across PT/EN without parsing stored prose', () => {
  const reqBody = { changeMetadata: facts() }
  const change = { id: '1', timestamp: new Date(), type: 'modified' as const, changeType: 'update',
    title: 'Ignored generated default', description: 'Nota livre Ω😀: "a,b:c\\d"\nlinha 2', fileName: 'wrong', reqBody }
  const pt = localizeGeneratedChange(change, 'pt-BR')
  const free = '\n  Nota livre Ω😀\n'
  assert.equal(buildChangeHistoryRecordModel({ id: 1, commit_id: null, summary: 'Literal', description: free,
    date_time: '2026-10-22', change_type: 'update', scope: 'file', req_body: reqBody }).description, free)
  assert.equal(pt.title, 'Alteração de nome: atributo count')
  assert.equal(pt.fileName, 'Ω.java')
  assert.match(pt.description, /Antes: src\/Ω.java · classe Calculadora😀 · linha 2/)
  assert.match(pt.description, /Alteração de nome: n → count/)
  assert.ok(pt.description.endsWith(change.description))
  const english = localizeGeneratedChange(pt, 'en')
  assert.equal(english.title, 'Name change: field count')
  assert.match(english.description, /Before: src\/Ω.java · class Calculadora😀 · line 2/)
  assert.ok(!english.description.includes('Antes:'))
  assert.ok(english.description.endsWith(change.description))
  assert.deepEqual(localizeGeneratedChange(english, 'pt-BR'), pt)
})
test('all emitted element kinds have translations, including leaves, whitespace and conservative selections', () => {
  for (const kind of elementKinds) {
    assert.ok(`changeFacts.element.${kind}` in ptBR)
    assert.ok(`changeFacts.element.${kind}` in en)
  }
  const m = facts(); m.differences = []; m.after!.element = { kind: 'method', name: 'run(int)' }
  assert.equal(generatedChangeText({ changeMetadata: m }, 'en')!.title, 'Change: method run(int)')
})
test('paths at root and actual rename/move endpoints do not confuse a parent folder with the affected entry', () => {
  const m: ChangeMetadata = { version: 1, action: 'file_rename', kind: 'file', differences: [],
    before: { ...side('Calculator.java', 'Calculator.java'), range: null, context: [], element: { kind: 'file', name: 'Calculator.java' } },
    after: { ...side('Basic.java', 'src/Basic.java'), range: null, context: [], element: { kind: 'file', name: 'Basic.java' } } }
  const result = generatedChangeText({ path: '', name: 'wrong', changeMetadata: m }, 'pt-BR')!
  assert.equal(result.title, 'Renomeação: arquivo Basic.java')
  assert.equal(result.description, 'Antes: Calculator.java\nDepois: src/Basic.java')
})
test('movement shows independently recorded contexts and uncertainty is explicit', () => {
  const m = facts(); m.action = 'move'; m.differences = []
  m.before!.context.push({ kind: 'case', name: '1' })
  m.after!.context.push({ kind: 'default', name: null }); m.after!.range = null
  const result = generatedChangeText({ changeMetadata: m }, 'en')!
  assert.match(result.description, /Before:.*case 1/)
  assert.match(result.description, /After:.*default.*location undetermined/)
})
test('bundle summary uses only cumulative accepted entries, including folder types and net-zero removal', () => {
  const m = bundleMetadata([
    { path: 'Ω.java', kind: 'added', beforeKind: null, afterKind: 'file' },
    { path: 'old', kind: 'deleted', beforeKind: 'directory', afterKind: null },
  ])
  const text = generatedChangeText({ changeMetadata: m }, 'en')!
  assert.match(text.description, /2 files\/folders with accepted external changes/)
  assert.match(text.description, /1 added · 0 modified · 1 removed/)
  assert.match(text.description, /Removed: old/)
  assert.ok(!text.description.includes('rejected.java'))
  assert.match(generatedChangeText({ changeMetadata: bundleMetadata([m.files![0]]) }, 'pt-BR')!.description, /^1 arquivo\/pasta/)
})
test('malformed/unsupported metadata and absent metadata never invent facts or translate free-form text', () => {
  for (const changeMetadata of [{}, { ...facts(), version: 2 }, { ...facts(), before: null },
    { ...facts(), after: { ...side(), range: { start: '1' } } }, { ...facts(), differences: [{ field: 'intent', before: 'a', after: 'b' }] }]) {
    assert.equal(readChangeMetadata({ changeMetadata }), null)
  }
  const custom = { id: '2', timestamp: new Date(), type: 'modified' as const, changeType: 'update',
    title: 'Título livre', description: 'Add in MyFile.java', fileName: 'MyFile.java' }
  assert.deepEqual(localizeGeneratedChange(custom, 'en'), custom)
  assert.deepEqual(localizeGeneratedChange({ ...custom, reqBody: { changeMetadata: { ...facts(), action: 'create' } } }, 'en').title, custom.title)
})
