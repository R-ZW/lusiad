import assert from 'node:assert/strict'
import test from 'node:test'
import { directComparisonOption, matchesComparisonOption, normalizeComparisonSearch, pageComparisonOptions, parseComparisonRef, resolveComparisonReference,
  type ComparisonOption } from '../src/lib/services/model-comparison/comparison-reference.model.ts'

test('pasted history references and bare SHAs select the intended state', () => {
  assert.deepEqual(directComparisonOption(' commit:4 '), { value: 'commit:4', label: '4', kind: 'commit' })
  assert.deepEqual(directComparisonOption('change:388'), { value: 'change:388', label: '388', kind: 'change' })
  assert.equal(directComparisonOption('abc1234')?.value, 'sha:abc1234')
  assert.equal(directComparisonOption('sha:1234567')?.value, 'sha:1234567')
  assert.equal(directComparisonOption('1234567'), null, 'numeric IDs must not silently become SHAs')
  assert.equal(directComparisonOption('tag:demo/v1')?.kind, 'tag')
  assert.equal(directComparisonOption('tag:versão-1')?.value, 'tag:versão-1')
  assert.equal(directComparisonOption('empty')?.kind, 'empty')
  assert.equal(directComparisonOption('change:0'), null)
  assert.equal(directComparisonOption('commit:9007199254740992'), null)
  assert.equal(directComparisonOption('branch:main..other'), null)
  assert.equal(directComparisonOption('sha:not-a-hash'), null)
})

test('external changes resolve to their own full commit while ordinary changes stay individual', async () => {
  const lookups: number[] = []
  const findChange = async (id: number) => {
    lookups.push(id)
    return { projectId: 11, commitId: 12, changeType: id === 434 ? 'external_bundle' : 'update' }
  }
  assert.deepEqual(await resolveComparisonReference(11, 'change:434', findChange), {
    value: 'commit:12', externalChange: { changeId: 434, commitId: 12 },
  })
  assert.deepEqual(await resolveComparisonReference(11, 'change:433', findChange), { value: 'change:433' })
  assert.deepEqual(await resolveComparisonReference(11, 'commit:10', findChange), { value: 'commit:10' })
  assert.deepEqual(await resolveComparisonReference(11, 'empty', findChange), { value: 'empty' })
  assert.deepEqual(lookups, [434, 433], 'Git references and empty state must not trigger a change lookup')
})

test('change references outside the project or without a committed state cannot be compared', async () => {
  await assert.rejects(resolveComparisonReference(11, 'change:434', async () => null))
  await assert.rejects(resolveComparisonReference(11, 'change:434', async () => ({ projectId: 22, commitId: 12, changeType: 'external_bundle' })))
  await assert.rejects(resolveComparisonReference(11, 'change:434', async () => ({ projectId: 11, commitId: 0, changeType: 'external_bundle' })))
})

test('paging keeps every reference once when Git refs and committed history share pages', async () => {
  const history: ComparisonOption[] = Array.from({ length: 65 }, (_, index) => ({
    value: `${index % 2 ? 'change' : 'commit'}:${Math.floor(index / 2) + 1}`,
    kind: index % 2 ? 'change' : 'commit', label: `State ${index}`,
  }))
  for (const count of [0, 1, 29, 30, 31, 65]) {
    const refs: ComparisonOption[] = Array.from({ length: count }, (_, index) => ({
      value: `tag:version-${index}`, kind: 'tag', label: `Version ${index}`,
    }))
    const collected: ComparisonOption[] = []
    let offset: number | null = 0
    while (offset !== null) {
      const page = await pageComparisonOptions(refs, offset, async (limit, from) => history.slice(from, from + limit))
      assert.ok(page.options.length <= 30)
      collected.push(...page.options)
      offset = page.nextOffset
    }
    assert.deepEqual(collected, [...refs, ...history])
    assert.equal(new Set(collected.map((option) => option.value)).size, collected.length)
  }
  assert.deepEqual(await pageComparisonOptions([], 0), { options: [], nextOffset: null })
})

test('IDs, type-prefixed references and numeric SHAs remain distinct search criteria', () => {
  assert.equal(normalizeComparisonSearch({ query: '#388', kind: 'change' }).exactId, 388)
  const commit = normalizeComparisonSearch({ query: 'commit:4' })
  assert.equal(commit.kind, 'commit')
  assert.equal(commit.exactId, 4)
  const numericSha = normalizeComparisonSearch({ query: 'sha:1234567' })
  assert.equal(numericSha.kind, 'commit')
  assert.equal(numericSha.exactId, null)
  assert.equal(numericSha.query, '1234567')
  const tag = normalizeComparisonSearch({ query: 'tag:version-1' })
  assert.equal(tag.exactRef, 'tag:version-1')
  assert.equal(tag.kind, 'tag')
  assert.equal(normalizeComparisonSearch({ query: ' Calculator 2026-09 ', offset: 60 }).query, 'Calculator 2026-09')
  assert.throws(() => normalizeComparisonSearch({ offset: -1 }))
  assert.throws(() => normalizeComparisonSearch({ query: 'a'.repeat(201) }))
  assert.throws(() => normalizeComparisonSearch({ kind: 'unknown' as 'all' }))
})

test('Git reference searches ignore accents and case and search metadata with all terms', () => {
  const option = { value: 'tag:v1', kind: 'tag' as const, label: 'Versão Cálculo', sha: 'abc123456', timestamp: '2026-10-07T10:00:00Z' }
  assert.equal(matchesComparisonOption(option, 'VERSAO calculo'), true)
  assert.equal(matchesComparisonOption(option, 'abc123 2026-10'), true)
  assert.equal(matchesComparisonOption(option, 'calculo missing'), false)
  assert.deepEqual(parseComparisonRef(option.value), { kind: 'tag', id: 'v1' })
})
