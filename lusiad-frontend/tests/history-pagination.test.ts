import assert from 'node:assert/strict'
import test from 'node:test'
import { compareHistoryIds, historyCursor, historyLimit } from '../src/lib/models/change-history/history-page.ts'
import { buildGraph, type GraphCommit } from '../src/lib/models/change-history/commit-graph.ts'

const branches = [{ id: 1, name: 'main' }, { id: 2, name: 'left' }, { id: 3, name: 'right' }]
const commit = (id: number, branchId: number, prevId: number | null, overrides: Partial<GraphCommit> = {}): GraphCommit =>
  ({ id, branchId, prevId, isMergeCommit: false, isNewBranchCommit: false, ...overrides })

test('history uses recorded order even with equal/reversed clocks and validates page boundaries', () => {
  const rows = [{ id: '100', timestamp: '2000-01-01' }, { id: '9', timestamp: '2030-01-01' }, { id: '99', timestamp: '2030-01-01' }]
  assert.deepEqual(rows.sort(compareHistoryIds).map(row => row.id), ['9', '99', '100'])
  assert.equal(historyLimit(), 250)
  assert.equal(historyCursor(), undefined)
  for (const value of [0, -1, 1.5, NaN, Infinity]) { assert.throws(() => historyLimit(value)); assert.throws(() => historyCursor(value)) }
  assert.throws(() => historyLimit(2001))
})

test('sibling lanes and fork/merge edges follow exact recorded parents, not adjacent rows', () => {
  const rows = [commit(1, 1, null), commit(2, 2, 1, { isNewBranchCommit: true }), commit(3, 1, 1),
    commit(4, 3, 1, { isNewBranchCommit: true }), commit(5, 2, 2),
    commit(6, 1, 3, { isMergeCommit: true, mergeSourceId: 5 })]
  const graph = buildGraph(branches, rows.reverse())
  assert.notEqual(graph.branchCol.get(2), graph.branchCol.get(3))
  assert.deepEqual(graph.nodes.map(node => node.commitId), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(graph.edges.map(edge => [edge.fromId, edge.toId]).sort(), [[1, 2], [1, 3], [1, 4], [2, 5], [3, 6], [5, 6]].sort())
  assert.equal(graph.edges.find(edge => edge.fromId === 5 && edge.toId === 6)?.kind, 'dashed-merge')
  assert.deepEqual(buildGraph([...branches].reverse(), rows).branchCol, graph.branchCol)
})

test('a truncated page, unknown merge source or corrupt link never invents ancestry', () => {
  const graph = buildGraph(branches, [commit(3, 1, 1), commit(4, 1, 8), commit(5, 2, null, { isMergeCommit: true })])
  assert.equal(graph.edges.length, 0)
  assert.deepEqual(graph.nodes[0].missingParentIds, [1])
  assert.deepEqual(graph.nodes[1].missingParentIds, [8])
  assert.equal(graph.nodes[2].incompleteMerge, true)
})

test('loading older records fills only their real edges without changing lanes', () => {
  const rows = Array.from({ length: 502 }, (_, index) => commit(index + 1, 1, index || null))
  const first = buildGraph(branches, rows.slice(-250))
  const complete = buildGraph(branches, rows)
  assert.deepEqual(first.nodes[0].missingParentIds, [252])
  assert.equal(complete.edges.length, 501)
  assert.deepEqual(first.branchCol, complete.branchCol)
})


test('change annotations and restore references keep the Git parent set intact', () => {
  const rows = [commit(1, 1, null), commit(2, 1, 1),
    commit(3, 1, 2, { restoredFromCommitId: 2 }),
    commit(4, 1, 3, { restoredFromCommitId: 2, restoredFromChangeId: 17 })]
  const graph = buildGraph(branches, rows, [
    { id: 19, commitId: 2, summary: 'second', timestamp: '2026-01-01' },
    { id: 17, commitId: 2, summary: 'first', timestamp: '2026-01-01' }])
  assert.deepEqual(graph.changeNodes.map(change => change.id), [17, 19])
  assert.equal(graph.nodes.length, 4)
  assert.deepEqual(graph.edges.map(edge => [edge.fromId, edge.toId]), [[1, 2], [2, 3], [3, 4]])
  assert.ok(graph.changeNodes[0].row > graph.nodes[0].row && graph.changeNodes[1].row < graph.nodes[1].row)
  assert.deepEqual(graph.restoreLinks.map(link => [link.commitId, link.sourceCommitId, link.sourceChangeId]), [[3, 2, null], [4, 2, 17]])
  assert.equal(graph.restoreLinks[1].y2, graph.rowY(graph.changeNodes[0].row))
  assert.notEqual(graph.restoreLinks[0].trackX, graph.restoreLinks[1].trackX)
  assert.equal(graph.edges[0].via?.length, 2)
})

test('restoration tracks separate overlapping spans and reuse space after a span ends', () => {
  const rows = [commit(1, 1, null), commit(2, 1, 1),
    commit(3, 1, 2, { restoredFromCommitId: 1 }), commit(4, 1, 3),
    commit(5, 1, 4, { restoredFromCommitId: 2 }),
    commit(6, 1, 5, { restoredFromCommitId: 4 })]
  const graph = buildGraph(branches, rows)
  const [first, overlapping, later] = graph.restoreLinks
  assert.notEqual(first.trackX, overlapping.trackX)
  assert.equal(first.trackX, later.trackX)
  assert.ok(graph.restoreLinks.every(link => link.trackX < link.x1 && link.trackX < link.x2))
  assert.deepEqual(buildGraph(branches, [...rows].reverse()).restoreLinks, graph.restoreLinks)
  assert.deepEqual(graph.edges.map(edge => [edge.fromId, edge.toId]), [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6]])
})

test('a missing or mismatched restore source stays unavailable until its real source loads', () => {
  const restored = commit(3, 1, 2, { restoredFromCommitId: 2, restoredFromChangeId: 17 })
  const marker = { id: 17, commitId: 2, summary: 'state', timestamp: '2026-01-01' }
  assert.deepEqual(buildGraph(branches, [restored]).missingRestoreSources, [3])
  assert.equal(buildGraph(branches, [commit(2, 1, null), restored], [{ ...marker, commitId: 1 }]).restoreLinks.length, 0)
  const complete = buildGraph(branches, [commit(2, 1, null), restored], [marker])
  assert.equal(complete.restoreLinks.length, 1)
  assert.deepEqual(complete.missingRestoreSources, [])
  assert.equal(complete.edges.length, 1)
  assert.equal(buildGraph(branches, [commit(2, 1, null), { ...restored, restoreSourceUnavailable: true }], [marker]).restoreLinks.length, 0)
})
