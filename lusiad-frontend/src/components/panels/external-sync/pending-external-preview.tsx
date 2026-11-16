'use client'

import { useEffect, useState } from 'react'
import { unwrapBackendAction } from '@/lib/services/backend-action-result'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { loadPendingExternalTextDiffController, type PendingExternalTextDiff } from '@/controllers/external-sync/external-sync.controller'
import type { ExternalSyncChange } from '@/lib/services/external-sync/external-sync.model'
import { useI18n } from '@/lib/i18n/locale-provider'

interface PendingExternalPreviewProps {
  projectId: number
  change: ExternalSyncChange
  onClose: () => void
}

export function PendingExternalPreview({ projectId, change, onClose }: PendingExternalPreviewProps) {
  const { t } = useI18n()
  const [preview, setPreview] = useState<PendingExternalTextDiff | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPreview(null)
    setError(null)
    void loadPendingExternalTextDiffController(projectId, change.path, change.revision)
      .then((result) => {
        if (!cancelled) {
          setPreview(unwrapBackendAction(result))
          setError(null)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : t('sync.previewFailed'))
      })
    return () => { cancelled = true }
  }, [projectId, change.path, change.revision, t])

  let beforeLine = 0
  let afterLine = 0

  return (
    <div data-testid="external-preview" data-file-path={change.path} data-state={error ? 'error' : preview ? 'ready' : 'loading'} className="absolute inset-0 z-[100] flex min-h-0 flex-col bg-background text-foreground">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card/70 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t('sync.previewTitle')}</h2>
          <p className="truncate font-mono text-xs text-muted-foreground" title={change.path}>{change.path}</p>
        </div>
        <Badge variant="outline">{t(`sync.${change.type}`)}</Badge>
        <Button data-testid="external-preview-close" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label={t('sync.closePreview')}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!preview && !error && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('sync.scanning')}</div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {preview?.unavailableReason && <p className="rounded border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          {t(`sync.preview.${preview.unavailableReason}`)}
        </p>}
        {preview?.lines && <div className="min-w-max overflow-hidden rounded-md border border-border font-mono text-xs leading-6">
          <div className="flex gap-4 border-b border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
            <span>{t('sync.previewBeforeLine')}</span><span>{t('sync.previewAfterLine')}</span>
          </div>
          {preview.lines.length === 0 && <p className="px-3 py-2 text-muted-foreground">{t('sync.noLineChanges')}</p>}
          {preview.lines.map((line, index) => {
            const before = line.kind === 'added' ? '' : String(++beforeLine)
            const after = line.kind === 'deleted' ? '' : String(++afterLine)
            return <div data-testid="external-diff-line" data-line-kind={line.kind} key={index} className={line.kind === 'added'
              ? 'flex bg-emerald-500/10 diff-text-added dark:text-emerald-300'
              : line.kind === 'deleted'
                ? 'flex bg-red-500/10 diff-text-removed dark:text-red-300'
                : 'flex bg-background text-foreground'}>
              <span className="w-10 shrink-0 select-none border-r border-border/50 pr-2 text-right text-muted-foreground">{before}</span>
              <span className="w-10 shrink-0 select-none border-r border-border/50 pr-2 text-right text-muted-foreground">{after}</span>
              <span className="w-7 shrink-0 select-none text-center">{line.kind === 'added' ? '+' : line.kind === 'deleted' ? '−' : ' '}</span>
              <span className="whitespace-pre pr-4">{line.text || ' '}</span>
            </div>
          })}
        </div>}
      </div>
    </div>
  )
}
