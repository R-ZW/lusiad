"use client"

import { Feedback } from '@/components/ui/feedback'
import { useId, useMemo, useState } from 'react'
import { Braces, GitBranch, GitCommitHorizontal, GitMerge, History, Loader2, Plus, RefreshCw, RotateCcw, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TutorialButton } from '@/components/tutorials/tutorial-provider'
import { Input } from '@/components/ui/input'
import { buildGraph, laneColor, DOT_R, type GraphChangeMarker, type GraphEdge } from '@/lib/models/change-history/commit-graph'
import { cn } from '@/lib/utils'
import { useCommitGraph, useTrackControlInteractions } from './track-control.interactions'
import { useI18n } from '@/lib/i18n/locale-provider'
import type { AppLocale } from '@/lib/i18n/core'
import { generatedChangeText } from '@/lib/i18n/change-text'
import type { HistoryTag } from '@/lib/models/history-tags/history-tags.model'
import type { TrackControlBranch as Branch, TrackControlCommit as Commit } from '@/controllers/track-control/track-control.controller'
import type { HistoryLocation } from '@/lib/models/change-history/history-navigation'
import type { MutationGate } from '@/lib/models/model-editor/editor-session'

interface TrackControlProps {
  isDrawerOpen?: boolean
  projectPath?: string
  changeSignal?: number
  operationsBlocked?: boolean
  mutationGate?: MutationGate
  onWorkingChange?: (busy: boolean) => void
  onRepositoryChanged?: () => Promise<void> | void
  onViewHistory?: (target: HistoryLocation) => void
}

function formatDate(timestamp: string, locale: AppLocale): string {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return '--/--/--, --:--'
  return parsed.toLocaleDateString(locale, {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Data types
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_TAGS: HistoryTag[] = []
const EMPTY_CHANGES: GraphChangeMarker[] = []

function graphTagText(tags: HistoryTag[]) {
  const names = tags.map(tag => tag.name).join(' · ')
  const letters = [...names]
  const label = letters.length > 34 ? letters.slice(0, 33).join('') + '…' : names
  return { names, label, width: Math.min(254, [...label].length * 6.5 + 28) }
}

function GraphTagLabel({ x, y, tags, onSelect, changeId, commitId, description }: {
  x: number; y: number; tags: HistoryTag[]; onSelect: () => void; changeId?: number; commitId: number; description: string
}) {
  const { names, label, width } = graphTagText(tags)
  return <g data-testid={changeId ? 'graph-change-tags' : 'graph-commit-tags'} data-commit-id={commitId} data-change-id={changeId}
    role="button" tabIndex={0} aria-label={description + ': ' + names} style={{ cursor: 'pointer' }}
    onClick={event => { event.stopPropagation(); onSelect() }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onSelect() } }}>
    <title>{description + '\n' + names}</title>
    <rect x={x} y={y - 10} width={width} height={20} rx={5} fill="var(--muted)" stroke="var(--history-tag)" strokeOpacity={0.4} />
    <Tag x={x + 6} y={y - 6} size={12} color="var(--history-tag)" />
    <text x={x + 23} y={y + 4} fontSize={11} fill="var(--foreground)">{label}</text>
  </g>
}

function TagList({ tags }: { tags: HistoryTag[] }) {
  return <div className="flex flex-wrap gap-1">{tags.map(tag => <span key={tag.id} data-testid="branch-detail-tag" data-tag-id={tag.id} title={tag.targetTitle} className="inline-flex max-w-full items-center gap-1 rounded border bg-background/50 px-1.5 py-0.5 text-xs"><Tag className="h-3 w-3 shrink-0" /><span className="truncate">{tag.name}</span></span>)}</div>
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG Graph
// ─────────────────────────────────────────────────────────────────────────────

interface CommitGraphSVGProps {
  branches: Branch[]
  commits: Commit[]
  selectedCommit: Commit | null
  focusedBranchId: number | null
  onSelectCommit: (id: number) => void
  onSelectBranch: (id: number) => void
  tags?: HistoryTag[]
  changeMarkers?: GraphChangeMarker[]
  selectedChangeId?: number | null
  onSelectChange?: (id: number) => void
}

export function CommitGraphSVG({
  branches, commits, selectedCommit, focusedBranchId, onSelectCommit, onSelectBranch, tags = EMPTY_TAGS, changeMarkers = EMPTY_CHANGES, selectedChangeId, onSelectChange,
}: CommitGraphSVGProps) {
  const { t, changeTextLocale } = useI18n()
  const arrowId = 'restore-' + useId().replace(/:/g, '')
  const [hoveredRestore, setHoveredRestore] = useState<number | null>(null)
  const markers = useMemo(() => {
    const needed = new Set([...tags.filter(tag => tag.targetKind === 'change').map(tag => tag.targetId), ...commits.flatMap(commit => commit.restoredFromChangeId ? [commit.restoredFromChangeId] : [])])
    return changeMarkers.filter(marker => needed.has(marker.id))
  }, [tags, commits, changeMarkers])
  const graph = useMemo(() => buildGraph(branches, commits, markers), [branches, commits, markers])
  const commitById = useMemo(() => new Map(commits.map(c => [c.id, c])), [commits])
  const branchById = useMemo(() => new Map(branches.map(b => [b.id, b])), [branches])

  const { nodes, edges, branchLabels, svgHeight, colX, rowY } = graph
  const commitTags = (id: number) => tags.filter(tag => tag.targetKind === 'commit' && tag.commitId === id)
  const changeTags = (id: number, commitId: number) => tags.filter(tag => tag.targetKind === 'change' && tag.targetId === id && tag.commitId === commitId)
  const annotationX = (node: { col: number; row: number }) => {
    const branchLabel = branchLabels.find(label => label.row === node.row)
    return colX(node.col) + DOT_R + 9 + (branchLabel ? Math.max(branchLabel.name.length * 7.5 + 14, 32) + 4 : 0)
  }
  const commitTagX = (node: typeof nodes[number]) => annotationX(node) + (commitById.get(node.commitId)?.restoredFromCommitId || commitById.get(node.commitId)?.restoreSourceUnavailable ? 26 : 0)
  const svgWidth = Math.max(graph.svgWidth,
    ...nodes.map(node => commitTagX(node) + (commitTags(node.commitId).length ? graphTagText(commitTags(node.commitId)).width : 0) + 12),
    ...graph.changeNodes.map(change => annotationX(change) + (changeTags(change.id, change.commitId).length ? graphTagText(changeTags(change.id, change.commitId)).width : [...t('branches.restoreChangeSource')].length * 6.5) + 12))

  if (nodes.length === 0) return null

  function edgePath(e: GraphEdge) {
    if (e.via?.length) {
      const first = e.via[0], mid = (e.y1 + first.y) / 2
      return `M ${e.x1} ${e.y1} C ${e.x1} ${mid}, ${first.x} ${mid}, ${first.x} ${first.y}` + e.via.slice(1).map(point => ` L ${point.x} ${point.y}`).join('') + ` L ${e.x2} ${e.y2}`
    }
    if (Math.abs(e.x1 - e.x2) < 2) return `M ${e.x1} ${e.y1} L ${e.x2} ${e.y2}`
    const mid = (e.y1 + e.y2) / 2
    return `M ${e.x1} ${e.y1} C ${e.x1} ${mid}, ${e.x2} ${mid}, ${e.x2} ${e.y2}`
  }

  return (
    <svg data-testid="commit-graph"
      width={svgWidth}
      height={svgHeight}
      style={{ display: 'block', overflow: 'visible' }}
      aria-label={t('branches.graphLabel')}
    >
      <defs><marker id={arrowId} markerWidth={7} markerHeight={7} refX={6} refY={3.5} orient="auto"><path d="M 0 0 L 7 3.5 L 0 7" fill="none" stroke="var(--history-restore-link)" /></marker></defs>
      {/* Edges */}
      {edges.map((e, i) => (
        <path
          key={i}
          data-testid="graph-edge" data-from-id={e.fromId} data-to-id={e.toId} data-kind={e.kind}
          d={edgePath(e)}
          fill="none"
          stroke={e.color}
          strokeWidth={2}
          strokeDasharray={e.kind === 'solid' ? undefined : '6 3'}
          strokeOpacity={e.kind === 'solid' ? 0.9 : 0.8}
          strokeLinecap="round"
        />
      ))}

      {/* Restoration references have their own rounded tracks, separate from Git ancestry. */}
      {graph.restoreLinks.map(link => {
        const radius = 8
        const path = `M ${link.x1 - 2} ${link.y1} H ${link.trackX + radius} Q ${link.trackX} ${link.y1} ${link.trackX} ${link.y1 - radius} V ${link.y2 + radius} Q ${link.trackX} ${link.y2} ${link.trackX + radius} ${link.y2} H ${link.x2 - 3}`
        const emphasized = hoveredRestore === link.commitId || selectedCommit?.id === link.commitId
          || (link.sourceChangeId ? selectedChangeId === link.sourceChangeId : selectedCommit?.id === link.sourceCommitId)
        return <g key={link.commitId}>
          <path d={path} fill="none" stroke="var(--background)" strokeWidth={6} pointerEvents="none" />
          <path data-testid="graph-restore-link" data-restore-commit-id={link.commitId} data-source-commit-id={link.sourceCommitId} data-source-change-id={link.sourceChangeId ?? ''} data-track-x={link.trackX}
            d={path} fill="none" stroke="var(--history-restore-link)" strokeWidth={emphasized ? 2.5 : 1.8} strokeOpacity={emphasized ? 1 : 0.75} strokeDasharray="5 4" strokeLinecap="round" markerEnd={`url(#${arrowId})`}
            role="button" tabIndex={0} aria-label={link.sourceChangeId ? t('history.restoredFromChange', { change: link.sourceChangeId, commit: link.sourceCommitId }) : t('history.restoredFrom', { id: link.sourceCommitId })}
            style={{ cursor: 'pointer' }} onMouseEnter={() => setHoveredRestore(link.commitId)} onMouseLeave={() => setHoveredRestore(null)} onFocus={() => setHoveredRestore(link.commitId)} onBlur={() => setHoveredRestore(null)}
            onClick={() => onSelectCommit(link.commitId)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectCommit(link.commitId) } }}>
            <title>{link.sourceChangeId ? t('history.restoredFromChange', { change: link.sourceChangeId, commit: link.sourceCommitId }) : t('history.restoredFrom', { id: link.sourceCommitId })}</title>
          </path>
        </g>
      })}

      {/* Branch name pills */}
      {branchLabels.map(label => {
        const branch = branchById.get(label.branchId)
        if (!branch) return null

        const cx    = colX(label.col)
        const cy    = rowY(label.row)
        const color = laneColor(label.col)
        const pillW = Math.max(label.name.length * 7.5 + 14, 32)
        const pillX = cx + DOT_R + 4
        const pillY = cy - 6

        const isSelected = branch.selected
        const isActive   = branch.active
        const isFocused  = focusedBranchId === branch.id

        return (
          <g data-testid="branch-label" data-branch-id={label.branchId} key={`lbl-${label.branchId}`} style={{ cursor: 'pointer' }}
            role="button" tabIndex={0} aria-label={label.name}
            onClick={() => onSelectBranch(label.branchId)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectBranch(label.branchId) } }}>
            <title>{label.name + ' · ' + t(branch.selected ? 'branches.selected' : branch.active ? 'branches.active' : 'branches.inactive')}</title>
            <rect
              x={pillX} y={pillY - 1}
              width={pillW} height={14}
              rx={4}
              fill={color}
              opacity={isSelected || isActive ? 1 : 0.12}
            />
            <text
              x={pillX + pillW / 2} y={pillY + 8.5}
              textAnchor="middle"
              fontSize={12}
              fontFamily="var(--font-sans)"
              fontWeight={500}
              fill={isSelected || isActive ? 'var(--card)' : color}
              dominantBaseline="auto"
            >
              {label.name}
            </text>
            {isFocused && (
              <rect x={pillX} y={pillY + 14} width={pillW} height={1.5}
                fill={color} rx={1} />
            )}
          </g>
        )
      })}

      {/* Commit dots — cada <g> recebe data-commit-id para que o scroll
          automático do ChangeDetailsModal consiga localizar o nó pelo
          seletor [data-commit-id="<id>"] e centralizar verticalmente. */}
      {nodes.map(node => {
        const commit = commitById.get(node.commitId)
        const branch = branchById.get(node.branchId)
        if (!commit || !branch) return null

        const cx    = colX(node.col)
        const cy    = rowY(node.row)
        const color = laneColor(node.col)

        const isCommitSelected = selectedCommit?.id === node.commitId
        const opacity = branch.selected ? 1 : branch.active ? 0.82 : 0.35
        const ownTags = commitTags(commit.id)

        return (
          <g
            key={`dot-${node.commitId}`}
            data-testid="graph-commit" data-commit-id={node.commitId} data-branch-id={node.branchId}
            data-missing-parents={node.missingParentIds.join(",")} data-incomplete-merge={node.incompleteMerge}
            style={{ cursor: 'pointer' }}
            role="button" tabIndex={0} aria-label={commit.summary}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectCommit(node.commitId) } }}
            onClick={() => onSelectCommit(node.commitId)}
          >
            <title>{commit.summary}</title>
            {(commit.restoredFromCommitId || commit.restoreSourceUnavailable) && <>
              <circle data-testid="graph-restored" data-commit-id={commit.id} cx={cx} cy={cy} r={DOT_R + 3} fill="none" stroke="var(--history-restore-link)" strokeWidth={1.5} />
              <RotateCcw data-testid="graph-restore-icon" data-commit-id={commit.id} x={annotationX(node)} y={cy - 7} size={14} color="var(--history-restore-link)" />
              {graph.missingRestoreSources.includes(commit.id) && <text data-testid="graph-restore-unavailable" x={annotationX(node) + 16} y={cy + 4} fontSize={11} fill="var(--muted-foreground)"><title>{t('branches.missingRestore')}</title>?</text>}
            </>}
            {(node.missingParentIds.length > 0 || node.incompleteMerge) && <text x={cx - 12} y={cy + 3} fontSize={12} fill="currentColor"><title>{t('branches.missingLinks')}</title>?</text>}
            {isCommitSelected && (
              <circle cx={cx} cy={cy} r={DOT_R + 5}
                fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.35} />
            )}
            {node.isMergeCommit ? (
              <rect
                x={cx - DOT_R + 1} y={cy - DOT_R + 1}
                width={(DOT_R - 1) * 2} height={(DOT_R - 1) * 2}
                rx={2}
                fill={isCommitSelected ? color : 'var(--background)'}
                stroke={color} strokeWidth={2}
                opacity={opacity}
                transform={`rotate(45 ${cx} ${cy})`}
              />
            ) : node.isNewBranchCommit ? (
              <path
                d={(() => {
                  const r = DOT_R
                  const ir = r * 0.4
                  let p = ''
                  for (let i = 0; i < 10; i++) {
                    const angle = (i * Math.PI) / 5 - Math.PI / 2
                    const radius = i % 2 === 0 ? r : ir
                    const x = cx + radius * Math.cos(angle)
                    const y = cy + radius * Math.sin(angle)
                    p += (i === 0 ? 'M ' : 'L ') + x + ' ' + y + ' '
                  }
                  return p + 'Z'
                })()}
                fill={isCommitSelected ? color : 'var(--background)'}
                stroke={color} strokeWidth={2}
                opacity={opacity}
              />
            ) : (
              <>
                <circle cx={cx} cy={cy} r={DOT_R}
                  fill={isCommitSelected ? color : 'var(--background)'}
                  stroke={color} strokeWidth={2} opacity={opacity} />
                {!isCommitSelected && (
                  <circle cx={cx} cy={cy} r={2.5} fill={color} opacity={opacity} />
                )}
              </>
            )}
            {/* Hit area maior para facilitar o clique */}
            <circle data-testid="graph-commit-hit" cx={cx} cy={cy} r={DOT_R + 7} fill="transparent" />
            {ownTags.length > 0 && <GraphTagLabel x={commitTagX(node)} y={cy} tags={ownTags} commitId={commit.id} description={t('branches.commitTags')} onSelect={() => onSelectCommit(commit.id)} />}
          </g>
        )
      })}
      {graph.changeNodes.map(change => {
        const x = colX(change.col), y = rowY(change.row)
        const ownTags = changeTags(change.id, change.commitId)
        const title = generatedChangeText({ changeMetadata: change.metadata }, changeTextLocale)?.title ?? change.summary
        const select = () => onSelectChange ? onSelectChange(change.id) : onSelectCommit(change.commitId)
        return <g key={change.id} data-testid="graph-change" data-change-id={change.id} data-commit-id={change.commitId} role="button" tabIndex={0} aria-label={t('branches.changeTagDescription', { title })}
          style={{ cursor: 'pointer' }} onClick={select} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select() } }}>
          <title>{t('branches.changeTagDescription', { title })}</title>
          <rect x={x - 7} y={y - 7} width={14} height={14} rx={3} fill="var(--background)" stroke="var(--history-tag)" strokeWidth={selectedChangeId === change.id ? 2.5 : 1} />
          <Braces x={x - 5} y={y - 5} size={10} color="var(--history-tag)" />
          {ownTags.length > 0 ? <GraphTagLabel x={annotationX(change)} y={y} tags={ownTags} changeId={change.id} commitId={change.commitId} description={t('branches.changeTagDescription', { title })} onSelect={select} />
            : <text x={annotationX(change)} y={y + 4} fontSize={11} fill="var(--foreground)">{t('branches.restoreChangeSource')}</text>}
        </g>
      })}
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Details panel
// ─────────────────────────────────────────────────────────────────────────────

interface DetailsPanelProps {
  selectedCommit: Commit | null
  selectedChange: GraphChangeMarker | null
  focusedBranch: Branch | null
  branchLookup: Map<number, Branch>
  commits: Commit[]
  commitsByBranch: Map<number, Commit[]>
  tags: HistoryTag[]
  markers: GraphChangeMarker[]
  activeChainLabel: string
  onSelectCommit: (id: number) => void
  onSelectChange: (id: number) => void
  onViewHistory?: (target: HistoryLocation) => void
}

function DetailsPanel({ selectedCommit, selectedChange, focusedBranch, branchLookup, commits, commitsByBranch, tags, markers, activeChainLabel, onSelectCommit, onSelectChange, onViewHistory }: DetailsPanelProps) {
  const { locale, changeTextLocale, t, tp } = useI18n()
  if (selectedChange) {
    const owner = commits.find(commit => commit.id === selectedChange.commitId)
    const title = generatedChangeText({ changeMetadata: selectedChange.metadata }, changeTextLocale)?.title ?? selectedChange.summary
    return <div data-testid="branches-details" data-kind="change" data-change-id={selectedChange.id} className="space-y-2">
      <p className="text-xs font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{t('branches.changeInsideCommit', { commit: owner?.summary ?? '—' })}</p>
      <TagList tags={tags.filter(tag => tag.targetKind === 'change' && tag.targetId === selectedChange.id)} />
      {onViewHistory && <Button data-testid="branch-view-history" size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => onViewHistory({ commitId: selectedChange.commitId, changeId: selectedChange.id })}><History className="h-3.5 w-3.5" />{t('branches.viewHistory')}</Button>}
    </div>
  }
  if (selectedCommit) {
    const branch = branchLookup.get(selectedCommit.branchId)
    const sourceLoaded = selectedCommit.restoredFromChangeId ? markers.some(marker => marker.id === selectedCommit.restoredFromChangeId && marker.commitId === selectedCommit.restoredFromCommitId) : commits.some(commit => commit.id === selectedCommit.restoredFromCommitId)
    return <div data-testid="branches-details" data-kind="commit" data-commit-id={selectedCommit.id} className="space-y-2">
      <p className="text-xs font-semibold text-foreground">{selectedCommit.summary}</p>
      {selectedCommit.description && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{selectedCommit.description}</p>}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{branch?.name ?? '—'}</span><span>{formatDate(selectedCommit.timestamp, locale)}</span></div>
      {(selectedCommit.restoredFromCommitId || selectedCommit.restoreSourceUnavailable) && <div>
        <Button data-testid="branch-restore-source" variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={!sourceLoaded || selectedCommit.restoreSourceUnavailable}
          title={selectedCommit.restoredFromChangeId ? t('history.restoredFromChange', { change: selectedCommit.restoredFromChangeId, commit: selectedCommit.restoredFromCommitId ?? '' }) : t('history.restoredFrom', { id: selectedCommit.restoredFromCommitId ?? '' })}
          onClick={() => selectedCommit.restoredFromChangeId ? onSelectChange(selectedCommit.restoredFromChangeId) : selectedCommit.restoredFromCommitId && onSelectCommit(selectedCommit.restoredFromCommitId)}><RotateCcw className="h-3 w-3" />{t(selectedCommit.restoredFromChangeId ? 'branches.restoreChangeSource' : 'branches.restoreCommitSource')}</Button>
        {(!sourceLoaded || selectedCommit.restoreSourceUnavailable) && <p className="mt-1 text-xs text-muted-foreground">{t('branches.missingRestore')}</p>}
      </div>}
      {onViewHistory && <Button data-testid="branch-view-history" size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => onViewHistory({ commitId: selectedCommit.id })}><History className="h-3.5 w-3.5" />{t('branches.viewHistory')}</Button>}
      <TagList tags={tags.filter(tag => tag.targetKind === 'commit' && tag.commitId === selectedCommit.id)} />
      {tags.filter(tag => tag.targetKind === 'change' && tag.commitId === selectedCommit.id).length > 0 && <div className="space-y-1"><p className="text-xs text-muted-foreground">{t('branches.changeTags')}</p><TagList tags={tags.filter(tag => tag.targetKind === 'change' && tag.commitId === selectedCommit.id)} /></div>}
    </div>
  }
  if (focusedBranch) {
    const base = focusedBranch.baseId ? branchLookup.get(focusedBranch.baseId) : null
    return <div data-testid="branches-details" data-kind="branch" data-branch-id={focusedBranch.id} className="space-y-1.5">
      <p className="text-xs font-semibold">{focusedBranch.name}</p>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{t('branches.base')}: {base?.name ?? '—'}</span><span>{tp('branches.commits', (commitsByBranch.get(focusedBranch.id) ?? []).length)}</span></div>
      <p className="text-xs text-muted-foreground">{t('branches.activeChain')}: {activeChainLabel}</p>
    </div>
  }
  return <p className="text-xs text-muted-foreground">{t('branches.selectForDetails')}</p>
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function TrackControl({ isDrawerOpen = false, projectPath, changeSignal, operationsBlocked = false,
  mutationGate, onWorkingChange, onRepositoryChanged, onViewHistory }: TrackControlProps) {
  const { t } = useI18n()
  const [newBranchName, setNewBranchName] = useState('')

  const {
    branches,
    commits,
    selectedBranch,
    activeBranches,
    focusedBranch,
    selectedCommit, selectedChange, historyTags, changeMarkers, handleSelectChange,
    isLoading,
    isWorking,
    error,
    repositoryPath,
    handleCreateBranch,
    handleMergeSelectedBranch,
    handleSelectCommit,
    handleSelectBranch,
    handleRefresh, hasMore, isLoadingMore, handleLoadMore,
  } = useTrackControlInteractions({ isVisible: isDrawerOpen, repositoryPath: projectPath, changeSignal })

  const { commitsByBranch } = useCommitGraph(branches, commits)

  const branchLookup = useMemo(
    () => new Map(branches.map(b => [b.id, b])),
    [branches]
  )

  const focused: Branch | null = focusedBranch ?? selectedBranch ?? null

  const activeChainLabel = activeBranches.length
    ? activeBranches.map(b => b.name).join(' → ')
    : t('branches.noActiveDependencies')

  const handleSubmitBranch = async () => {
    if (!newBranchName.trim() || isWorking) return
    try { if (await mutate(() => handleCreateBranch(newBranchName.trim()))) setNewBranchName('') }
    catch { /* handled in hook */ }
  }

  const handleMerge = async () => {
    if (!selectedBranch?.baseId || isWorking) return
    try { await mutate(handleMergeSelectedBranch) }
    catch { /* handled in hook */ }
  }

  const mutate = async (action: () => Promise<void>) => {
    if (operationsBlocked || isWorking || isLoading) return false
    const token = mutationGate?.acquire()
    if (mutationGate && !token) return false
    onWorkingChange?.(true)
    try { await action(); await onRepositoryChanged?.(); return true }
    finally { if (token) mutationGate?.release(token); onWorkingChange?.(false) }
  }

  return <div data-testid="track-control" className="flex h-full min-h-0 flex-col bg-background">
    <div data-testid="branches-header" className="shrink-0 space-y-2 border-b border-border bg-muted/50 px-3 py-2 dark:bg-black/15">
      <div className="flex min-w-0 items-center gap-2">
        <GitBranch className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold" title={selectedBranch?.name}>{selectedBranch?.name ?? '—'}</span>
        <Button data-testid="branches-refresh" variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh} disabled={isLoading || isWorking} title={t('branches.refresh')}><RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} /></Button>
        <Button data-testid="branch-merge" variant="outline" size="icon" className="h-7 w-7" onClick={handleMerge} disabled={!selectedBranch?.baseId || isWorking || isLoading || operationsBlocked} title={t('branches.mergeToBase')}><GitMerge className="h-3.5 w-3.5" /></Button>
        <TutorialButton tutorial="branches" />
      </div>
      <form className="flex min-w-0 items-center gap-1.5" onSubmit={event => { event.preventDefault(); void handleSubmitBranch() }}>
        <Input data-testid="branch-name" aria-label={t('branches.new')} value={newBranchName} onChange={event => setNewBranchName(event.target.value)} placeholder={t('branches.new')} className="h-8 min-w-0 flex-1 text-xs" disabled={isWorking} />
        <Button data-testid="branch-create" type="submit" size="icon" className="h-8 w-8" disabled={!newBranchName.trim() || !selectedBranch || isWorking || isLoading || operationsBlocked} title={t('branches.create')}>{isWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-4 w-4" />}</Button>
      </form>
      {error && <Feedback data-testid="branches-error" tone="error">{error}</Feedback>}
    </div>
    <div data-testid="branches-graph-area" className="min-h-0 flex-1 overflow-auto p-3">
      {isLoading ? <div role="status" className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /><span className="sr-only">{t('common.loading')}</span></div>
        : branches.length === 0 ? <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground"><GitBranch className="h-6 w-6" /><p>{t('branches.empty')}</p><p>{t('branches.initializeHint')}</p></div>
        : <>
          {historyTags?.available === false && <Feedback tone="warning" className="mb-2">{t('tags.errors.migrationRequired')}</Feedback>}
          {hasMore && <Button data-testid="branches-more" variant="ghost" size="sm" disabled={isLoadingMore} onClick={() => void handleLoadMore()} className="mb-2 h-7 text-xs">{t('history.loadMore')}</Button>}
          <CommitGraphSVG branches={branches} commits={commits} selectedCommit={selectedCommit} focusedBranchId={focused?.id ?? null}
            onSelectCommit={handleSelectCommit} onSelectBranch={handleSelectBranch} tags={historyTags?.tags} changeMarkers={changeMarkers} selectedChangeId={selectedChange?.id} onSelectChange={handleSelectChange} />
        </>}
    </div>
    <div data-testid="branches-footer" className="max-h-[45%] shrink-0 space-y-2 overflow-y-auto border-t border-border bg-muted/50 px-3 py-2 dark:bg-black/15">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">{selectedChange ? <Braces className="h-3.5 w-3.5" /> : selectedCommit ? <GitCommitHorizontal className="h-3.5 w-3.5" /> : <GitBranch className="h-3.5 w-3.5" />}{t(selectedChange ? 'branches.changeDetails' : selectedCommit ? 'branches.commitDetails' : 'branches.branchDetails')}</div>
      <DetailsPanel selectedCommit={selectedCommit} selectedChange={selectedChange} focusedBranch={focused} branchLookup={branchLookup} commits={commits} commitsByBranch={commitsByBranch} tags={historyTags?.tags ?? EMPTY_TAGS} markers={changeMarkers} activeChainLabel={activeChainLabel} onSelectCommit={handleSelectCommit} onSelectChange={handleSelectChange} onViewHistory={onViewHistory} />
    </div>
  </div>
}
