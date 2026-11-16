"use client"

import { useEffect, useState } from "react"
import { Focus, Loader2, Network, RotateCcw, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useI18n } from "@/lib/i18n/locale-provider"
import { renderChangeUmlController } from "@/controllers/change-diff/change-uml.controller"
import type { UmlPanel, UmlResult, UmlView } from "@/lib/models/change-diff/change-uml.model"

export function DiagramPanel({ panel, side, title, emptyText }: { panel: UmlPanel; side: "before" | "after" | "current"; title: string; emptyText?: string }) {
  const { t } = useI18n()
  const [zoom, setZoom] = useState(1)
  return <section data-testid="uml-panel" data-side={side} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card text-foreground">
    <header className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="flex items-center gap-1">
        <Button data-testid="uml-zoom-out" variant="ghost" size="icon" disabled={zoom <= .25 || !panel.svg} aria-label={t('diff.umlZoomOut')} onClick={() => setZoom(v => Math.max(.25, v - .25))}><ZoomOut className="h-4 w-4" /></Button>
        <Button data-testid="uml-zoom-reset" variant="ghost" size="sm" disabled={!panel.svg} aria-label={t('diff.umlZoomReset')} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</Button>
        <Button data-testid="uml-zoom-in" variant="ghost" size="icon" disabled={zoom >= 4 || !panel.svg} aria-label={t('diff.umlZoomIn')} onClick={() => setZoom(v => Math.min(4, v + .25))}><ZoomIn className="h-4 w-4" /></Button>
      </div>
    </header>
    {panel.svg ? <div data-testid="uml-scroll" data-theme-surface="paper" role="region" aria-label={title} tabIndex={0} className="diagram-paper min-h-0 flex-1 overflow-auto p-3">
      {/* SVG is passive, server-sanitized and displayed as an isolated image, never inserted into the page DOM. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-testid="uml-svg" data-engine="plantuml-smetana" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(panel.svg)}`}
        alt={`${title}: ${panel.classifiers.join(', ')}`} draggable={false}
        style={{ width: `${zoom * 100}%`, maxWidth: 'none', minWidth: 240 }} />
    </div> : <p data-testid="uml-empty" className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">{emptyText ?? t('diff.umlNoClassifier')}</p>}
  </section>
}

/** Request identity guards both pending renders and visible content when changing the selected event. */
export function ChangeUmlPreview({ projectId, snapshotId, changeId }: { projectId: number; snapshotId: string; changeId: string }) {
  const { t, locale } = useI18n()
  const [view, setView] = useState<UmlView>('focus')
  const [reload, setReload] = useState(0)
  const [state, setState] = useState<{ key: string; result?: UmlResult; error?: string } | null>(null)
  const key = JSON.stringify([projectId, snapshotId, changeId, view, locale, reload])
  useEffect(() => {
    let cancelled = false
    void renderChangeUmlController({ projectId, snapshotId, changeId, view }).then(value => {
      if (!cancelled) setState({ key, ...value })
    }).catch(() => { if (!cancelled) setState({ key, error: t('diff.umlError') }) })
    return () => { cancelled = true }
  }, [projectId, snapshotId, changeId, view, key, t])
  const current = state?.key === key ? state : null
  return <section data-testid="uml-preview" data-view={view} data-state={!current ? 'loading' : current.error ? 'error' : 'ready'} className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-3 pb-3">
    <div className="flex shrink-0 items-center border-b border-border py-2">
      <ToggleGroup type="single" value={view} onValueChange={v => { if (v === 'focus' || v === 'project') setView(v) }} aria-label={t('diff.uml')}>
        <ToggleGroupItem data-testid="uml-view" value="focus"><Focus className="mr-1 h-4 w-4" />{t('diff.umlView.focus')}</ToggleGroupItem>
        <ToggleGroupItem data-testid="uml-view" value="project"><Network className="mr-1 h-4 w-4" />{t('diff.umlView.project')}</ToggleGroupItem>
      </ToggleGroup>
    </div>
    {!current && <p role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('diff.umlLoading')}</p>}
    {current?.error && <div role="alert" data-testid="uml-error" className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-destructive">
      <p>{current.error}</p><Button data-testid="uml-reload" variant="outline" onClick={() => setReload(v => v + 1)}><RotateCcw className="mr-1 h-4 w-4" />{t('common.reloadView')}</Button>
    </div>}
    {current?.result && <>
      {current.result.noStructuralChange && <p data-testid="uml-no-structural-change" className="text-xs text-muted-foreground">{t('diff.umlNoStructuralChange')}</p>}
      {current.result.movement && <p data-testid="uml-movement" className="text-xs text-muted-foreground">{current.result.movement}</p>}
      {!current.result.before.focusFound && !current.result.after.focusFound && <p className="text-xs text-muted-foreground">{t('diff.locationUnavailable')}</p>}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <DiagramPanel key={`${key}:before`} side="before" title={t('diff.before')} panel={current.result.before} />
        <DiagramPanel key={`${key}:after`} side="after" title={t('diff.after')} panel={current.result.after} />
      </div>
    </>}
  </section>
}
