import assert from 'node:assert/strict'
import test from 'node:test'
import { HistoryTagError, historyTagReference, historyTagTargetReference, isHistoryTagsTableMissing,
  normalizeHistoryTagName, normalizeHistoryTagTarget, tagsForTarget, type HistoryTag } from '../src/lib/models/history-tags/history-tags.model.ts'
import { historyWhere, normalizeHistoryQuery } from '../src/lib/models/change-history/history-query.model.ts'
import { directComparisonOption, normalizeComparisonSearch, resolveComparisonReference } from '../src/lib/services/model-comparison/comparison-reference.model.ts'

const tag: HistoryTag = { id: 7, name: 'Demonstração', targetKind: 'change', targetId: 42, commitId: 5,
  targetTitle: 'Edit', branchName: 'main', timestamp: '2026-10-07', changeType: 'update' }

test('tag names preserve display text, normalize duplicate keys and reject invalid inputs', () => {
  assert.deepEqual(normalizeHistoryTagName('  VERSÃO   1.0  '), { name: 'VERSÃO 1.0', key: 'versao 1.0' })
  assert.equal(normalizeHistoryTagName('Versa\u0303o 1.0').key, normalizeHistoryTagName('VERSAO 1.0').key)
  for (const value of ['', '  ', 'a'.repeat(81), 'demo\nother', 'demo\tother', '<script>', '-demo', 1, null]) {
    assert.throws(() => normalizeHistoryTagName(value), (error) => error instanceof HistoryTagError && error.code === 'invalidName')
  }
  assert.equal(normalizeHistoryTagName('演示/版本-1').name, '演示/版本-1')
})

test('tags select an exact target kind and keep stable references across renames', () => {
  assert.deepEqual(normalizeHistoryTagTarget({ kind: 'change', id: 42 }), { kind: 'change', id: 42 })
  for (const id of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => normalizeHistoryTagTarget({ kind: 'commit', id }))
  assert.throws(() => normalizeHistoryTagTarget({ kind: 'branch', id: 1 } as never))
  assert.equal(historyTagReference(tag), 'version:7')
  assert.equal(historyTagReference({ ...tag, name: 'Renamed' } as HistoryTag), 'version:7')
  assert.equal(historyTagTargetReference(tag), 'change:42')
  assert.throws(() => historyTagTargetReference({ ...tag, commitId: null }))
  assert.deepEqual(tagsForTarget([tag, { ...tag, id: 8, targetKind: 'commit' }], { kind: 'change', id: 42 }), [tag])
})

test('Lusiad tags resolve to individual changes or commits, preserving external bundle behavior', async () => {
  const findChange = async () => ({ projectId: 11, commitId: 5, changeType: 'update' })
  assert.equal(directComparisonOption('version:7')?.kind, 'version')
  assert.equal(normalizeComparisonSearch({ query: 'version:7' }).exactRef, 'version:7')
  assert.deepEqual(await resolveComparisonReference(11, 'version:7', findChange, async () => ({ projectId: 11, value: 'change:42' })), { value: 'change:42' })
  assert.deepEqual(await resolveComparisonReference(11, 'version:7', findChange, async () => ({ projectId: 11, value: 'commit:5' })), { value: 'commit:5' })
  assert.deepEqual(await resolveComparisonReference(11, 'version:7', async () => ({ projectId: 11, commitId: 5, changeType: 'external_bundle' }), async () => ({ projectId: 11, value: 'change:42' })), {
    value: 'commit:5', externalChange: { changeId: 42, commitId: 5 },
  })
  await assert.rejects(resolveComparisonReference(11, 'version:7', findChange, async () => ({ projectId: 22, value: 'commit:5' })))
  await assert.rejects(resolveComparisonReference(11, 'version:7', findChange, async () => null))
  await assert.rejects(resolveComparisonReference(11, 'version:7', findChange, async () => ({ projectId: 11, value: 'version:8' })))
})

test('missing tags schema is distinguished from connection errors and other missing tables', () => {
  assert.equal(isHistoryTagsTableMissing({ code: 'ER_NO_SUCH_TABLE', sqlMessage: "Table 'test.lusiad_history_tags' doesn't exist" }), true)
  assert.equal(isHistoryTagsTableMissing({ code: 'ER_NO_SUCH_TABLE', sqlMessage: "Table 'test.commits' doesn't exist" }), false)
  assert.equal(isHistoryTagsTableMissing({ code: 'ECONNREFUSED' }), false)
})

test('history filters are project-scoped, parameterized and apply equally to pages and counts', () => {
  const result = historyWhere(11, { query: "demo_100% ' OR 1=1", taggedOnly: true, showMerges: false, showBranches: false }, true)
  assert.equal(result.values[0], 11)
  assert.ok(result.values.includes('%demo=_100=%%'))
  assert.ok(!result.sql.includes("' OR 1=1"))
  assert.match(result.sql, /ht.project_id = b.project_id/)
  assert.match(result.sql, /ch.project_id = b.project_id/)
  assert.match(result.sql, /is_merge_commit = '0'/)
  assert.match(result.sql, /is_new_branch_commit = '0'/)
  assert.deepEqual(historyWhere(11, { query: 'commit:5' }, true).values, [11, 5])
  assert.deepEqual(historyWhere(11, { query: 'change:42' }, true).values, [11, 42])
  assert.match(historyWhere(11, { taggedOnly: true }).sql, /1 = 0/)
  assert.doesNotMatch(historyWhere(11, { query: 'demo' }).sql, /lusiad_history_tags/)
  assert.throws(() => normalizeHistoryQuery({ query: 'a'.repeat(201) }))
})
