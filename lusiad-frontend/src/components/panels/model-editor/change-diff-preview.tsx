"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Code2, Network } from "lucide-react"
import { loadChangeDiffController } from "@/controllers/change-diff/change-diff.controller"
import { ChangeUmlPreview } from "@/components/panels/model-editor/change-uml-preview"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import type { ChangeDiffSnapshot } from "@/lib/models/change-diff/change-diff.model"
import { resolveChangeFocus } from "@/lib/services/change-diff/change-focus.service"
import type { ChangeFocus } from "@/lib/services/change-diff/change-focus.service"
import type { Change, JavaModel } from "@/lib/types"
import { LINE_HEIGHT_REM, buildReferencePathContext, collectBoxOverlays } from "@/lib/models/model-editor/model-canvas.model"
import { renderLeafTextContent } from "@/lib/models/model-editor/model-tree.model"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n/locale-provider"

interface ChangeDiffPreviewProps {
  projectId: number
  projectTempPath: string
  change: Change
  activeView?: 'code' | 'uml'
  onActiveViewChange?: (view: 'code' | 'uml') => void
  mode?: 'full' | 'compact'
}

interface ReadOnlyCanvasProps {
  side: "before" | "after"
  title: string
  model: JavaModel | null
  focus: ChangeFocus
  emptyLabel: string
  operation: ChangeDiffSnapshot['operation']
  hideHeader?: boolean
}

function normalizeChangeBody(reqBody: unknown): Record<string, unknown> {
  return reqBody && typeof reqBody === "object" ? reqBody as Record<string, unknown> : {}
}

function findLineNumberByOffset(sourceText: string, offset: number): number {
  return sourceText.slice(0, offset).split("\n").length
}

const HIGHLIGHT_CLASS = {
  create: "diff-block diff-added",
  update: "diff-block diff-modified",
  delete: "diff-block diff-removed",
  move: "diff-block diff-moved",
  unknown: "border-border bg-muted/30",
} satisfies Record<ChangeDiffSnapshot['operation'], string>

const INLINE_HIGHLIGHT_CLASS = {
  create: "diff-inline diff-added",
  update: "diff-inline diff-modified",
  delete: "diff-inline diff-removed",
  move: "diff-inline diff-moved",
  unknown: "bg-muted/30",
} satisfies Record<ChangeDiffSnapshot['operation'], string>

function ReadOnlyCanvas({
  side,
  title,
  model,
  focus,
  emptyLabel,
  operation,
  hideHeader = false,
}: ReadOnlyCanvasProps) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const sourceText = model ? renderLeafTextContent(model.tree) : emptyLabel
  const sourceLines = useMemo(() => sourceText.split("\n"), [sourceText])
  const lineNumberDigits = String(sourceLines.length).length
  const referencePathContext = useMemo(
    () => model ? buildReferencePathContext(model.tree, sourceLines) : null,
    [model, sourceLines],
  )
  const visibleOverlays = useMemo(
    () => model && referencePathContext ? collectBoxOverlays(model.tree, sourceLines, referencePathContext) : [],
    [model, referencePathContext, sourceLines],
  )

  const range = useMemo(
    () => focus.range && focus.range.start >= 0 && focus.range.end <= sourceText.length ? focus.range : null,
    [focus.range, sourceText.length],
  )
  const focusedOverlay = visibleOverlays.find((overlay) =>
    overlay.node === focus.node && range &&
    typeof overlay.node.startOffset === "number" &&
    typeof overlay.node.endOffset === "number" &&
    overlay.node.startOffset <= range.start &&
    overlay.node.endOffset >= range.end &&
    overlay.node.endOffset - overlay.node.startOffset <= range.end - range.start + 4
  )
  const inlineFocus = range && !focusedOverlay ? range : null

  useEffect(() => {
    if (!range) return
    const container = scrollRef.current
    const target = container?.querySelector<HTMLElement>('[data-change-focus="true"]')
    if (!container || !target) return
    const frame = requestAnimationFrame(() => {
      const containerRect = container.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      container.scrollTop += targetRect.top - containerRect.top - containerRect.height / 2
      container.scrollLeft += targetRect.left - containerRect.left - containerRect.width / 2
    })
    return () => cancelAnimationFrame(frame)
  }, [range, focusedOverlay?.id])

  const whitespaceFocus = range && sourceText.slice(range.start, range.end).trim() === ""
    ? {
        first: findLineNumberByOffset(sourceText, range.start),
        last: findLineNumberByOffset(sourceText, range.end - 1),
      }
    : null

  return (
    <section data-testid="history-canvas" data-side={side} data-focus-source={focus.source} className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-card/30 pr-3 pl-3 pb-3">
      {!hideHeader && (
        <div className="shrink-0 pl-9 pb-1">
          <h3 className="text-base font-semibold">{title}</h3>
        </div>
      )}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto pt-2">
        <div className="inline-flex min-h-full min-w-full items-stretch gap-3">
          <aside
            className="select-none pt-4 text-right text-xs text-muted-foreground"
            style={{ width: `${lineNumberDigits + 1}ch` }}
          >
            <div className="m-0 font-mono">
              {sourceLines.map((_, index) => {
                const lineNumber = index + 1
                return (
                  <div
                    key={lineNumber}
                    className={cn(
                      "group relative flex items-center justify-end transition-colors",
                      whitespaceFocus && lineNumber >= whitespaceFocus.first && lineNumber <= whitespaceFocus.last &&
                        (operation === "delete" ? "diff-line diff-removed font-semibold" :
                          operation === "create" ? "diff-line diff-added font-semibold" :
                            operation === "move" ? "diff-line diff-moved font-semibold" :
                              "diff-line diff-modified font-semibold"),
                    )}
                    style={{ height: `${LINE_HEIGHT_REM}rem` }}
                  >
                    <span>{lineNumber}</span>
                  </div>
                )
              })}
            </div>
          </aside>
          <div className="min-h-full min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-background p-4">
            <div className="relative w-full min-w-max font-mono text-sm" style={{ lineHeight: `${LINE_HEIGHT_REM}rem` }}>
              <pre className="m-0 whitespace-pre font-mono text-sm text-foreground" data-model-text="true" style={{ lineHeight: `${LINE_HEIGHT_REM}rem` }}>
                {inlineFocus ? (
                  <>
                    {sourceText.slice(0, inlineFocus.start)}
                    <span data-change-focus="true" className={cn("rounded-sm", INLINE_HIGHLIGHT_CLASS[operation])}>
                      {sourceText.slice(inlineFocus.start, inlineFocus.end)}
                    </span>
                    {sourceText.slice(inlineFocus.end)}
                  </>
                ) : sourceText}
              </pre>
              <div className="absolute inset-0 font-mono text-sm">
                {visibleOverlays.map((overlay) => {
                  const isHighlighted = focusedOverlay?.id === overlay.id
                  return (
                    <div
                      key={overlay.id}
                      data-testid="history-node"
                      data-node-path={overlay.nodePath}
                      data-node-type={overlay.node.type}
                      data-start-offset={overlay.node.startOffset}
                      data-end-offset={overlay.node.endOffset}
                      data-model-overlay="true"
                      data-change-focus={isHighlighted ? "true" : undefined}
                      className={cn(
                        "absolute cursor-pointer rounded-none border transition-colors",
                        isHighlighted ? HIGHLIGHT_CLASS[operation] : "border-border/30 bg-transparent",
                      )}
                      style={{
                        top: `${overlay.topRem}rem`,
                        left: `${overlay.leftCh}ch`,
                        width: `${overlay.widthCh}ch`,
                        height: `${overlay.heightRem}rem`,
                        zIndex: overlay.depth + 1,
                      }}
                      title={t("editor.nodeLocation", {
                        type: overlay.node.type,
                        line: overlay.node.startLine,
                        column: overlay.node.startColumn,
                      })}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}


// ---------------------------------------------------------------------------
// Helpers para o modo compact
// ---------------------------------------------------------------------------

/** Dado uma operação, retorna qual painel deve ser exibido no modo compact. */
function resolveCompactPanel(operation: ChangeDiffSnapshot['operation']): 'before' | 'after' {
  // delete → mostra o "antes" (o que foi removido)
  // create | update | move → mostra o "depois" (o estado resultante)
  return operation === 'delete' ? 'before' : 'after'
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

const snapshotRequests = new Map<string, ReturnType<typeof loadChangeDiffController>>()
function loadPreview(params: Parameters<typeof loadChangeDiffController>[0], refresh: boolean) {
  const key = `${params.projectId}:${params.snapshotId}:${params.changeId}`
  if (refresh) snapshotRequests.delete(key)
  let pending = snapshotRequests.get(key)
  if (!pending) {
    pending = loadChangeDiffController(params)
    snapshotRequests.set(key, pending)
    if (snapshotRequests.size > 4) snapshotRequests.delete(snapshotRequests.keys().next().value!)
    void pending.then(result => { if (result.status !== 'ok' && snapshotRequests.get(key) === pending) snapshotRequests.delete(key) }, () => { if (snapshotRequests.get(key) === pending) snapshotRequests.delete(key) })
  }
  return pending
}

export function ChangeDiffPreview({
  projectId,
  projectTempPath,
  change,
  activeView = 'code',
  onActiveViewChange,
  mode = 'full',
}: ChangeDiffPreviewProps) {
  const { t } = useI18n()
  const [snapshot, setSnapshot] = useState<ChangeDiffSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const isExplorerOnlyChange = useMemo(() => {
    const scope = String(change.scope ?? '').toLowerCase()
    if (scope && scope !== 'file') {
      return true
    }

    const changeType = String(change.changeType ?? '').toLowerCase()
    return changeType.startsWith('file_') || changeType.startsWith('dir_')
  }, [change.changeType, change.scope])

  useEffect(() => {
    let cancelled = false

    setIsLoading(true)
    setSnapshot(null)
    setError(null)

    if (isExplorerOnlyChange) {
      setSnapshot(null)
      setIsLoading(false)
      return () => {
        cancelled = true
      }
    }

    if (!change.preview) { setError(t('diff.incompleteSnapshot')); setIsLoading(false); return }
    void loadPreview({
      snapshotId: change.preview.snapshotId,
      projectId,
      changeId: change.id,
    }, reload > 0)
      .then((result) => {
        if (!cancelled) {
          if (result.status === 'ok') setSnapshot(result.snapshot)
          else setError(result.message ?? t(result.code === 'incomplete' ? 'diff.incompleteSnapshot' : 'diff.loadError'))
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : t('errors.loadChanges'))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [change.changeType, change.id, change.reqBody, change.type, change.preview, projectId, projectTempPath, isExplorerOnlyChange, t, reload])

  const parsedBody = useMemo(() => normalizeChangeBody(change.reqBody), [change.reqBody])
  const focus = useMemo(() => snapshot
    ? resolveChangeFocus({ operation: snapshot.operation, beforeModel: snapshot.beforeModel, afterModel: snapshot.afterModel, reqBody: parsedBody })
    : { before: { node: null, range: null, source: "none" as const }, after: { node: null, range: null, source: "none" as const } },
    [parsedBody, snapshot],
  )

  // ── Explorer-only: mesma mensagem em ambos os modos ──────────────────────
  if (isExplorerOnlyChange) {
    const explorerMessage = (
      <div data-testid="history-explorer-preview" className="rounded-lg border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
        {t('diff.openExplorer')}
      </div>
    )

    if (mode === 'compact') {
      return <div className="flex h-full items-center justify-center p-4">{explorerMessage}</div>
    }

    return (
      <main className="h-full bg-background p-4 md:p-6">
        <div className="flex h-full min-h-60 flex-col overflow-hidden rounded-xl border border-border bg-card/30 p-6">
          <div className="shrink-0 border-b border-border pb-4">
            <h2 className="text-base font-semibold">{t('diff.changeView')}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {change.title} | {change.fileName} | Change #{change.id}
            </p>
          </div>
          <div className="mt-6 flex min-h-0 flex-1 items-center justify-center">
            {explorerMessage}
          </div>
        </div>
      </main>
    )
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    const loadingEl = (
      <div className="flex h-full min-h-80 items-center justify-center text-sm text-muted-foreground">
        {t('diff.loadingPsi')}
      </div>
    )

    if (mode === 'compact') {
      return <div className="h-full">{loadingEl}</div>
    }

    return (
      <main className="h-full bg-background p-4 md:p-6">
        <div className="flex h-full min-h-80 items-center justify-center rounded-xl border border-border bg-card/30 p-6 text-sm text-muted-foreground">
          {t('diff.loadingPsi')}
        </div>
      </main>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !snapshot) {
    const errorEl = (
      <div data-testid="history-diff-error" role="alert" className="flex h-full min-h-80 flex-col items-center justify-center gap-3 text-sm text-destructive">
        {error ?? t('diff.loadError')}
        <Button data-testid="history-diff-reload" variant="outline" onClick={() => setReload((value) => value + 1)}>{t('common.reloadView')}</Button>
      </div>
    )

    if (mode === 'compact') {
      return <div className="h-full">{errorEl}</div>
    }

    return (
      <main className="h-full bg-background p-4 md:p-6">
        <div className="rounded-xl border border-border bg-card/30 p-6">
          {errorEl}
        </div>
      </main>
    )
  }

  const focusUnavailable =
    ((snapshot.operation === 'move' || snapshot.operation === 'update' || snapshot.operation === 'delete') &&
      Boolean(snapshot.beforeModel) && !focus.before.range) ||
    (snapshot.operation !== 'delete' && Boolean(snapshot.afterModel) && !focus.after.range)
  const focusWarning = focusUnavailable ? (
    <p data-testid="history-focus-unavailable" role="status" className="mx-3 mt-2 shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs diff-text-modified dark:text-amber-200">
      {t('diff.locationUnavailable')}
    </p>
  ) : null

  // ── Compact mode: apenas o painel relevante, sem wrapper ─────────────────
  if (mode === 'compact') {
    const compactPanel = resolveCompactPanel(snapshot.operation)

    const model = compactPanel === 'before' ? snapshot.beforeModel : snapshot.afterModel
    const emptyLabel = compactPanel === 'before'
      ? t('diff.noBeforeModel')
      : t('diff.noAfterModel')

    return (
      // h-full garante que o canvas estira até o pai; o scroll acontece
      // dentro do ReadOnlyCanvas (flex-1 + overflow-auto no div interno)
      <div className="h-full min-h-0 flex flex-col">
        {focusWarning}
        <ReadOnlyCanvas
          side={compactPanel}
          title={compactPanel === 'before' ? t('diff.before') : t('diff.after')}
          model={model}
          focus={compactPanel === 'before' ? focus.before : focus.after}
          operation={snapshot.operation}
          emptyLabel={emptyLabel}
          hideHeader
        />
      </div>
    )
  }

  // ── Full mode: layout original com Antes + Depois ────────────────────────
  return (
    <main className="h-full bg-background pr-2 pl-2 pb-2">
      <Tabs
        value={activeView}
        onValueChange={(value) => {
          if (value === 'code' || value === 'uml') onActiveViewChange?.(value)
        }}
        className="h-full gap-0 rounded-xl bg-card/30"
      >
        <div className="shrink-0 border-b border-border/60 px-2 pt-2">
          <TabsList aria-label={t('diff.changeView')}>
            <TabsTrigger data-testid="history-view-tab" value="code"><Code2 />{t('diff.code')}</TabsTrigger>
            <TabsTrigger data-testid="history-view-tab" value="uml"><Network />{t('diff.uml')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="code" className="min-h-0 flex-1 overflow-hidden p-0">
          <div className="flex h-full min-h-0 flex-col">
            {focusWarning}
            <div className="grid min-h-0 flex-1 gap-4 pt-2 lg:grid-cols-2">
            <ReadOnlyCanvas
              side="before"
              title={t('diff.before')}
              model={snapshot.beforeModel}
              focus={focus.before}
              operation={snapshot.operation}
              emptyLabel={t('diff.noBeforeModel')}
            />
            <ReadOnlyCanvas
              side="after"
              title={t('diff.after')}
              model={snapshot.afterModel}
              focus={focus.after}
              operation={snapshot.operation}
              emptyLabel={t('diff.noAfterModel')}
            />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="uml" className="min-h-0 flex-1 overflow-hidden p-0">
          <ChangeUmlPreview
            projectId={projectId}
            snapshotId={change.preview?.snapshotId ?? ''}
            changeId={change.id}
          />
        </TabsContent>
      </Tabs>
    </main>
  )
}
