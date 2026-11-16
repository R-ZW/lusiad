'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n/locale-provider'
import {
  LINE_HEIGHT_REM,
  buildReferencePathContext,
  collectBoxOverlays,
  collectLeafTextSegments,
} from '@/lib/models/model-editor/model-canvas.model'
import { buildCanvasDiff, resolveCanvasHighlights, type SemanticToken } from '@/lib/services/model-comparison/model-comparison.model'
import type { JavaModel, PsiNode } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ComparisonCanvasProps {
  title: string
  model: JavaModel | null
  tokens: SemanticToken[]
  matched: Set<number>
  unpaired: WeakSet<PsiNode>
  modified: WeakSet<PsiNode>
  counterpart: JavaModel | null
  counterparts: WeakMap<PsiNode, PsiNode>
  side: 'before' | 'after'
  empty: string
}

/** Read-only canvas using the editor's PSI geometry and the history diff's neutral palette. */
export function ComparisonCanvas({ title, model, tokens, matched, unpaired, modified, counterpart, counterparts, side, empty }: ComparisonCanvasProps) {
  const { t } = useI18n()
  const diff = useMemo(() => model ? buildCanvasDiff(model.tree, tokens, matched, unpaired, modified) : null,
    [model, tokens, matched, unpaired, modified])
  const sourceText = useMemo(() => diff?.segments.map((segment) => segment.text).join('') ?? '', [diff])
  const lines = useMemo(() => sourceText.split('\n'), [sourceText])
  const overlays = useMemo(() => {
    if (!model || !sourceText) return []
    return collectBoxOverlays(model.tree, lines, buildReferencePathContext(model.tree, lines))
  }, [model, lines, sourceText])
  const counterpartOverlays = useMemo(() => {
    if (!counterpart) return []
    const lines = collectLeafTextSegments(counterpart.tree).map((segment) => segment.text).join('').split('\n')
    return collectBoxOverlays(counterpart.tree, lines, buildReferencePathContext(counterpart.tree, lines))
  }, [counterpart])
  const highlights = useMemo(() => diff ? resolveCanvasHighlights(diff, overlays, { counterparts, counterpartOverlays }) : null,
    [diff, overlays, counterparts, counterpartOverlays])

  return <section data-testid="comparison-canvas" data-side={side} className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card/30">
    <h3 className="shrink-0 border-b border-border px-4 py-3 text-sm font-semibold">{title}</h3>
    {!model || !sourceText ? <p className="m-auto p-8 text-center text-sm text-muted-foreground">{empty}</p> :
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="inline-flex min-h-full min-w-full items-stretch gap-3">
          <aside className="shrink-0 select-none pt-4 text-right font-mono text-xs text-muted-foreground"
            style={{ width: `${String(lines.length).length + 1}ch` }}>
            {lines.map((_, index) => <div key={index} className="flex items-center justify-end"
              style={{ height: `${LINE_HEIGHT_REM}rem` }}>{index + 1}</div>)}
          </aside>
          <div className="min-h-full min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-background p-4">
            <div className="relative w-full min-w-max font-mono text-sm" style={{ lineHeight: `${LINE_HEIGHT_REM}rem` }}>
              <pre className="m-0 whitespace-pre font-mono text-sm text-foreground" data-model-text="true"
                style={{ lineHeight: `${LINE_HEIGHT_REM}rem` }}>
                {diff?.segments.map((segment) => <span data-diff-changed={segment.changed} data-diff-covered={highlights?.coveredSegments.has(segment.id) ?? false} key={segment.id} className={cn(segment.changed && !highlights?.coveredSegments.has(segment.id) && (
                  side === 'before'
                    ? 'rounded-sm diff-token diff-removed'
                    : 'rounded-sm diff-token diff-added'
                ))}>{segment.text}</span>)}
              </pre>
              <div className="pointer-events-none absolute inset-0 font-mono text-sm">
                {overlays.map((overlay) => {
                  const status = highlights?.overlayStatus.get(overlay.nodePath)
                  return <div data-testid="diff-node" data-node-path={overlay.nodePath} data-node-type={overlay.node.type} data-start-offset={overlay.node.startOffset} data-end-offset={overlay.node.endOffset} data-diff-status={status ?? 'unchanged'} key={overlay.id} data-model-overlay="true"
                    className={cn('absolute rounded-none border', status === 'complete'
                      ? side === 'before'
                        ? 'diff-block diff-removed border-r-4'
                        : 'diff-block diff-added border-r-4'
                      : status === 'partial'
                        ? 'diff-block diff-modified border-r-4'
                        : 'border-border/30 bg-transparent')}
                    style={{ top: `${overlay.topRem}rem`, left: `${overlay.leftCh}ch`,
                      width: `${overlay.widthCh}ch`, height: `${overlay.heightRem}rem`, zIndex: overlay.depth + 1 }}
                    title={t('editor.nodeLocation', { type: overlay.node.type,
                      line: overlay.node.startLine, column: overlay.node.startColumn })} />
                })}
              </div>
            </div>
          </div>
        </div>
      </div>}
  </section>
}
