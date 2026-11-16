'use client'

import { unwrapBackendAction } from "@/lib/services/backend-action-result"

import { useEffect, useMemo, useState } from 'react'
import { Code2, GitCompare, Layers3, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { parseComparedFileController } from '@/controllers/model-comparison/model-comparison.controller'
import { buildModelOutline, compareModelTrees, type ModelOutlineNode } from '@/lib/services/model-comparison/model-comparison.model'
import type { ComparisonFile } from '@/lib/services/model-comparison/model-comparison.service'
import type { JavaModel } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/locale-provider'
import { ComparisonCanvas } from './comparison-canvas'
import { ComparisonGitDiff } from './comparison-git-diff'

interface ComparisonPreviewProps {
  projectId: number
  file: ComparisonFile
  onClose: () => void
}

function OutlineRow({ node, depth = 0 }: { node: ModelOutlineNode; depth?: number }) {
  const color = node.status === 'added' ? 'diff-block diff-added'
    : node.status === 'removed' ? 'diff-block diff-removed' : 'border-border bg-background'
  const content = <span className={cn('flex min-w-0 items-start gap-2 rounded border-l-2 px-2 py-1', color)}>
    <span className="shrink-0 text-xs text-muted-foreground">{node.type.replace(/^Psi/, '').replace(/Impl$/, '')}</span>
    <code className="min-w-0 whitespace-pre-wrap break-all text-xs">{node.label || '…'}</code>
    {node.status === 'added' && <span className="ml-auto diff-text-added">+</span>}
    {node.status === 'removed' && <span className="ml-auto diff-text-removed">−</span>}
  </span>
  if (!node.children.length) return <div className="my-0.5" style={{ marginLeft: depth * 12 }}>{content}</div>
  return <details className="my-0.5" open={node.changedCount > 0 || depth < 2} style={{ marginLeft: depth * 12 }}>
    <summary className="cursor-pointer list-inside">{content}</summary>
    <div className="border-l border-border/60 pl-1">{node.children.map((child) => <OutlineRow key={child.id} node={child} depth={depth + 1} />)}</div>
  </details>
}

function ModelPanel({ title, outline, empty, side }: { title: string; outline: ModelOutlineNode | null; empty: string; side: 'before' | 'after' }) {
  return <section data-testid="comparison-psi" data-side={side} className="min-h-0 overflow-auto rounded-lg border border-border bg-card/30 p-3">
    <h3 className="mb-3 text-sm font-semibold">{title}</h3>
    {outline ? <OutlineRow node={outline} /> : <p className="py-12 text-center text-sm text-muted-foreground">{empty}</p>}
  </section>
}

export function ComparisonPreview({ projectId, file, onClose }: ComparisonPreviewProps) {
  const { t } = useI18n()
  const [models, setModels] = useState<{ beforeModel: JavaModel | null; afterModel: JavaModel | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    setModels(null)
    setError(null)
    void parseComparedFileController(projectId, file.path, file.beforeSource, file.afterSource).then(unwrapBackendAction)
      .then((value) => { if (!cancelled) setModels(value) })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : t('comparison.loadError')) })
    return () => { cancelled = true }
  }, [projectId, file, t, reload])

  const tokenDiff = useMemo(() => {
    if (!models) return null
    const comparison = compareModelTrees(models.beforeModel?.tree ?? null, models.afterModel?.tree ?? null)
    return { beforeTokens: comparison.beforeTokens, afterTokens: comparison.afterTokens, matched: comparison }
  }, [models])

  const outline = useMemo(() => {
    if (!models || !tokenDiff) return null
    return {
      before: models.beforeModel ? buildModelOutline(models.beforeModel.tree, tokenDiff.matched.beforeMatched, 'before',
        tokenDiff.matched.beforeUnpaired, tokenDiff.matched.beforeModified) : null,
      after: models.afterModel ? buildModelOutline(models.afterModel.tree, tokenDiff.matched.afterMatched, 'after',
        tokenDiff.matched.afterUnpaired, tokenDiff.matched.afterModified) : null,
    }
  }, [models, tokenDiff])

  const modelStatus = error ? <div className="space-y-3"><p role="alert" className="text-sm text-destructive">{error}</p>
    <Button data-testid="comparison-reload" variant="outline" onClick={() => setReload((value) => value + 1)}>{t('common.reloadView')}</Button></div>
    : !models ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('diff.loadingPsi')}</p>
      : null

  return <div data-testid="comparison-preview" aria-busy={!models && !error} data-file-path={file.path} data-state={error ? 'error' : models ? 'ready' : 'loading'} className="absolute inset-0 z-[100] flex min-h-0 flex-col bg-background text-foreground">
    <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card/70 px-4 py-3">
      <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{t('comparison.title')}</h2>
        <p className="truncate font-mono text-xs text-muted-foreground" title={file.path}>{file.path}</p></div>
      <Button data-testid="comparison-close" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label={t('comparison.close')}><X className="h-4 w-4" /></Button>
    </header>
    <Tabs defaultValue="canvas" className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-2"><TabsList>
        <TabsTrigger data-testid="comparison-view-tab" data-view="canvas" value="canvas"><Layers3 className="mr-1 h-4 w-4" />{t('comparison.canvas')}</TabsTrigger>
        <TabsTrigger data-testid="comparison-view-tab" data-view="psi" value="psi"><Code2 className="mr-1 h-4 w-4" />{t('comparison.psi')}</TabsTrigger>
        <TabsTrigger data-testid="comparison-view-tab" data-view="git" value="git"><GitCompare className="mr-1 h-4 w-4" />{t('comparison.gitDiff')}</TabsTrigger>
      </TabsList></div>
      <TabsContent value="psi" className="min-h-0 flex-1 overflow-auto p-4">
        {modelStatus}
        {outline && !error && <><div className="mb-3 flex gap-3 text-xs"><span className="diff-text-removed">− {t('comparison.removed')}</span><span className="diff-text-added">+ {t('comparison.added')}</span><span>{t('comparison.unchanged')}</span></div>
        <div className="grid min-h-full gap-4 lg:grid-cols-2">
          <ModelPanel side="before" title={t('diff.before')} outline={outline.before} empty={t('diff.noBeforeModel')} />
          <ModelPanel side="after" title={t('diff.after')} outline={outline.after} empty={t('diff.noAfterModel')} />
        </div></>}
      </TabsContent>
      <TabsContent value="canvas" className="min-h-0 flex-1 overflow-auto p-4">
        {modelStatus}
        {models && tokenDiff && !error && <><div className="mb-3 flex gap-3 text-xs"><span className="diff-text-removed">− {t('comparison.removed')}</span><span className="diff-text-added">+ {t('comparison.added')}</span><span className="diff-text-modified">≈ {t('comparison.modified')}</span><span>{t('comparison.unchanged')}</span></div>
        <div className="grid min-h-full gap-4 lg:grid-cols-2">
          <ComparisonCanvas title={t('diff.before')} model={models.beforeModel} tokens={tokenDiff.beforeTokens}
            matched={tokenDiff.matched.beforeMatched} unpaired={tokenDiff.matched.beforeUnpaired}
            modified={tokenDiff.matched.beforeModified}
            counterpart={models.afterModel} counterparts={tokenDiff.matched.beforeCounterparts}
            side="before" empty={t('diff.noBeforeModel')} />
          <ComparisonCanvas title={t('diff.after')} model={models.afterModel} tokens={tokenDiff.afterTokens}
            matched={tokenDiff.matched.afterMatched} unpaired={tokenDiff.matched.afterUnpaired}
            modified={tokenDiff.matched.afterModified}
            counterpart={models.beforeModel} counterparts={tokenDiff.matched.afterCounterparts}
            side="after" empty={t('diff.noAfterModel')} />
        </div></>}
      </TabsContent>
      <TabsContent value="git" className="min-h-0 flex-1 overflow-hidden p-4">
        <ComparisonGitDiff file={file} />
      </TabsContent>

    </Tabs>
  </div>
}
