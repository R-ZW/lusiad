export interface GraphBranch { id: number; name: string }
export interface GraphCommit {
  id: number; branchId: number; prevId: number | null; mergeSourceId?: number | null
  isMergeCommit: boolean; isNewBranchCommit: boolean
  restoredFromCommitId?: number | null; restoredFromChangeId?: number | null; restoreSourceUnavailable?: boolean
}

export interface GraphChangeMarker { id: number; commitId: number; summary: string; timestamp: string; metadata?: unknown }

export const ROW_H = 38, COL_W = 26, DOT_R = 5, GRAPH_LEFT = 14
const COLORS = Array.from({ length: 8 }, (_, i) => `var(--graph-lane-${i})`)
export const laneColor = (col: number) => COLORS[col % COLORS.length]
export type EdgeKind = 'solid' | 'dashed-fork' | 'dashed-merge'
export interface GraphEdge {
  fromId: number; toId: number; x1: number; y1: number; x2: number; y2: number; kind: EdgeKind; color: string; via?: { x: number; y: number }[]
}

/** Layout never supplies ancestry. Only recorded first/merge parents supply edges.
 * Separate lanes for siblings, stable across pages and active/selected branch changes. */
export function buildGraph(branches: GraphBranch[], commits: GraphCommit[], changes: GraphChangeMarker[] = []) {
  const branchCol = new Map([...branches].sort((a, b) => a.id - b.id).map((b, i) => [b.id, i]))
  const rowY = (row: number) => row * ROW_H + ROW_H / 2
  let row = 0
  const changeNodes: (GraphChangeMarker & { col: number; row: number })[] = []
  const groups = new Map<number, GraphChangeMarker[]>()
  for (const change of changes) {
    const group = groups.get(change.commitId) ?? []
    if (!group.some(item => item.id === change.id)) group.push(change)
    groups.set(change.commitId, group)
  }
  const nodes = [...commits].sort((a, b) => a.id - b.id).filter(c => branchCol.has(c.branchId)).map(c => {
    const col = branchCol.get(c.branchId)!
    // Only referenced changes get annotation rows, ordered by their real event ids.
    // These are states inside the receiving commit, never additional Git commits.
    for (const change of (groups.get(c.id) ?? []).sort((a, b) => a.id - b.id)) changeNodes.push({ ...change, col, row: row++ })
    return { commitId: c.id, branchId: c.branchId, col, row: row++,
      isMergeCommit: c.isMergeCommit, isNewBranchCommit: c.isNewBranchCommit,
      missingParentIds: [] as number[], incompleteMerge: c.isMergeCommit && (!c.prevId || !c.mergeSourceId) }
  })
  const byId = new Map(nodes.map(node => [node.commitId, node]))
  const changeById = new Map(changeNodes.map(change => [change.id, change]))
  const references: { commitId: number; sourceCommitId: number; sourceChangeId: number | null; fromCol: number; fromRow: number; toCol: number; toRow: number; track: number }[] = []
  const missingRestoreSources: number[] = []
  for (const commit of commits) {
    if (commit.restoreSourceUnavailable) { missingRestoreSources.push(commit.id); continue }
    if (!commit.restoredFromCommitId) continue
    const from = byId.get(commit.id)
    const to = commit.restoredFromChangeId ? changeById.get(commit.restoredFromChangeId) : byId.get(commit.restoredFromCommitId)
    if (!from || !to || to.commitId !== commit.restoredFromCommitId || to.row >= from.row) { missingRestoreSources.push(commit.id); continue }
    references.push({ commitId: commit.id, sourceCommitId: commit.restoredFromCommitId, sourceChangeId: commit.restoredFromChangeId ?? null,
      fromCol: from.col, fromRow: from.row, toCol: to.col, toRow: to.row, track: 0 })
  }
  // Overlapping restoration references get separate tracks. Disjoint spans reuse
  // a track, so the gutter grows with overlap rather than total commit count.
  const trackEnds: number[] = []
  for (const link of references.sort((a, b) => a.toRow - b.toRow || a.fromRow - b.fromRow || a.commitId - b.commitId)) {
    let track = trackEnds.findIndex(end => end < link.toRow)
    if (track < 0) track = trackEnds.length
    trackEnds[track] = link.fromRow
    link.track = track
  }
  const restoreGutter = trackEnds.length ? trackEnds.length * 16 + 8 : 0
  const colX = (col: number) => GRAPH_LEFT + restoreGutter + col * COL_W + COL_W / 2
  const restoreLinks = references.sort((a, b) => a.commitId - b.commitId).map(link => ({
    commitId: link.commitId, sourceCommitId: link.sourceCommitId, sourceChangeId: link.sourceChangeId,
    trackX: GRAPH_LEFT + (trackEnds.length - 1 - link.track) * 16,
    x1: colX(link.fromCol) - DOT_R, y1: rowY(link.fromRow), x2: colX(link.toCol) - DOT_R, y2: rowY(link.toRow),
  }))
  const edges: GraphEdge[] = []
  for (const commit of commits) {
    const node = byId.get(commit.id)
    if (!node) continue
    const parents = [...new Set([commit.prevId, commit.mergeSourceId].filter((id): id is number => id != null))]
    for (const id of parents) {
      const parent = byId.get(id)
      // Missing/out-of-window/inconsistent links remain explicit; never join adjacent dots instead.
      if (!parent || parent.commitId >= node.commitId) { node.missingParentIds.push(id); continue }
      const kind: EdgeKind = id === commit.mergeSourceId ? 'dashed-merge'
        : parent.branchId !== node.branchId ? 'dashed-fork' : 'solid'
      edges.push({ fromId: id, toId: commit.id, x1: colX(parent.col), y1: rowY(parent.row) + DOT_R,
        x2: colX(node.col), y2: rowY(node.row) - DOT_R, kind, color: laneColor(kind === 'dashed-merge' ? parent.col : node.col),
        via: id === commit.prevId ? changeNodes.filter(change => change.commitId === commit.id).map(change => ({ x: colX(change.col), y: rowY(change.row) })) : undefined })
    }
  }
  const labelled = new Set<number>()
  const branchLabels = nodes.filter(node => {
    if (labelled.has(node.branchId)) return false
    labelled.add(node.branchId); return true
  }).map(node => ({ branchId: node.branchId, col: node.col, row: node.row, name: branches.find(b => b.id === node.branchId)!.name }))
  const totalCols = Math.max(1, branchCol.size)
  // Reserve room for the longest branch pill, even for a single lane.
  const svgWidth = Math.max(GRAPH_LEFT + restoreGutter + totalCols * COL_W + 8,
    ...branchLabels.map(label => colX(label.col) + DOT_R + 4 + Math.max(label.name.length * 7.5 + 14, 32)))
  return { nodes, edges, branchLabels, changeNodes, restoreLinks, missingRestoreSources, branchCol, svgWidth, svgHeight: Math.max(ROW_H, row * ROW_H + ROW_H / 2),
    colX, rowY, totalCols }
}
