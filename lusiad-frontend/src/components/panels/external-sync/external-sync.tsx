'use client'

import { Feedback, EmptyState } from '@/components/ui/feedback'
import { useEffect, useRef, useState } from 'react'
import { unwrapBackendAction } from '@/lib/services/backend-action-result'
import type { MutationGate } from '@/lib/models/model-editor/editor-session'
import { AlertTriangle, Check, FileCode, Folder, RefreshCw, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TutorialButton } from '@/components/tutorials/tutorial-provider'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/lib/i18n/locale-provider'
import {
  discardAcceptedBundleController,
  reviewExternalChangesController,
} from '@/controllers/external-sync/external-sync.controller'
import type { ExternalSyncSnapshot } from '@/lib/services/external-sync/external-sync.service'
import type { ExternalSyncChange } from '@/lib/services/external-sync/external-sync.model'

interface ExternalSyncProps {
  projectId: number
  snapshot: ExternalSyncSnapshot | null
  scanError?: string | null
  onRefresh: () => Promise<void>
  onStateChange?: (state: ExternalSyncSnapshot) => void
  onFilesChanged?: () => void | Promise<void>
  mutationGate: MutationGate
  operationsBlocked?: boolean
  onWorkingChange: (busy: boolean) => void
  onPreviewChange?: (change: ExternalSyncChange) => void
  activePreviewPath?: string | null
}

export function ExternalSync({ projectId, snapshot, scanError, onRefresh, onStateChange, onFilesChanged, onPreviewChange, activePreviewPath, mutationGate, operationsBlocked, onWorkingChange }: ExternalSyncProps) {
  const { t, tp } = useI18n()
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const blocked = busy || operationsBlocked || Boolean(scanError)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelected((previous) => {
      const updated: Record<string, boolean> = {}
      for (const change of snapshot?.changes ?? []) {
        const key = `${change.path}:${change.revision}`
        updated[key] = previous[key] ?? true
      }
      return updated
    })
  }, [snapshot])

  const review = async (keepSelection: boolean) => {
    if (!snapshot || snapshot.changes.length === 0 || inFlight.current || blocked) return
    const token = mutationGate.acquire()
    if (!token) return
    inFlight.current = true
    onWorkingChange(true)
    setBusy(true)
    try {
      const choices = snapshot.changes.map((change) => ({
        path: change.path,
        revision: change.revision,
        keep: keepSelection && selected[`${change.path}:${change.revision}`] !== false,
      }))
      onStateChange?.(unwrapBackendAction(await reviewExternalChangesController(projectId, choices, crypto.randomUUID())))
      setError(null)
      await onFilesChanged?.()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('sync.reviewFailed'))
      await onFilesChanged?.()
    } finally {
      setBusy(false)
      inFlight.current = false
      mutationGate.release(token)
      onWorkingChange(false)
      await onRefresh().catch(() => {})
    }
  }

  const discard = async () => {
    if (!snapshot?.bundleChangeId || inFlight.current || blocked) return
    const token = mutationGate.acquire()
    if (!token) return
    inFlight.current = true
    onWorkingChange(true)
    setBusy(true)
    try {
      onStateChange?.(unwrapBackendAction(await discardAcceptedBundleController(projectId, crypto.randomUUID(), snapshot.bundleChangeId)))
      setError(null)
      await onFilesChanged?.()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('sync.reviewFailed'))
      await onFilesChanged?.()
    } finally {
      setBusy(false)
      inFlight.current = false
      mutationGate.release(token)
      onWorkingChange(false)
      await onRefresh().catch(() => {})
    }
  }

  const changes = snapshot?.changes ?? []

  return (
    <div data-testid="external-sync" data-state={busy ? 'loading' : error || scanError ? 'error' : !snapshot ? 'loading' : snapshot.needsInitialCommit ? 'initial' : changes.length ? 'review' : snapshot.commitRequired ? 'commit' : 'ready'} data-commit-required={snapshot?.commitRequired ?? false} data-count={changes.length} aria-busy={busy} className="flex h-full min-h-0 flex-col bg-background">
      <div data-testid="sync-header" className="flex shrink-0 items-center justify-between border-b border-border bg-muted/50 px-3 py-0.5 dark:bg-black/15">
        <span className="text-xs font-semibold text-foreground">{tp('sync.detected', changes.length)}</span>
        <div className="flex items-center gap-1"><Button variant="ghost" size="icon" className="h-8 w-8" data-testid="sync-refresh" onClick={() => { setError(null); void onRefresh() }} disabled={busy || operationsBlocked} aria-label={t('sync.refresh')}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button><TutorialButton tutorial="sync" /></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {(error || scanError) && <Feedback tone="error" className="mb-3">{error || scanError}</Feedback>}
        {snapshot?.needsInitialCommit && <p className="text-xs text-muted-foreground">{t('sync.needsInitialCommit')}</p>}
        {!snapshot && !error && !scanError && <Feedback tone="loading">{t('sync.scanning')}</Feedback>}
        {snapshot?.commitRequired && (
          <div className="mb-3 rounded-md border border-amber-400/50 bg-amber-100/20 p-2 text-xs text-foreground">
            <AlertTriangle className="mb-1 h-4 w-4 diff-text-modified" />{t('sync.commitRequired')}
          </div>
        )}
        {snapshot && changes.length === 0 && !snapshot.needsInitialCommit && !snapshot.commitRequired && (
          <EmptyState icon={<Check className="text-status-added" />}>{t('sync.empty')}</EmptyState>
        )}
        <div className="space-y-2">
          {changes.map((change) => {
            const key = `${change.path}:${change.revision}`
            return (
              <div data-testid="external-change" data-file-path={change.path} data-revision={change.revision} key={key} className="flex items-start gap-2 rounded border border-border p-2 text-xs hover:bg-muted/40">
                <input type="checkbox" className="mt-0.5" checked={selected[key] !== false} disabled={blocked}
                  aria-label={t('sync.keepPath', { path: change.path })}
                  onChange={(event) => setSelected((previous) => ({ ...previous, [key]: event.target.checked }))} />
                <button type="button" disabled={blocked} onClick={() => onPreviewChange?.(change)}
                  aria-label={t('sync.openPreview', { path: change.path })}
                  aria-pressed={activePreviewPath === change.path}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {change.entryKind === 'directory' ? <Folder className="h-4 w-4 shrink-0" /> : <FileCode className="h-4 w-4 shrink-0" />}
                  <span className="min-w-0 flex-1 break-all">{change.path}</span>
                  <Badge variant="outline" className="text-xs">{t(`sync.${change.type}`)}</Badge>
                </button>
              </div>
            )
          })}
        </div>
      </div>
      <div data-testid="sync-actions" className="shrink-0 space-y-2 border-t border-border bg-muted/50 p-3 dark:bg-black/15">
        <Button data-testid="sync-apply" className="w-full" size="sm" disabled={blocked || changes.length === 0} onClick={() => void review(true)}>{t('sync.applySelection')}</Button>
        <Button data-testid="sync-reject" className="w-full" size="sm" variant="outline" disabled={blocked || changes.length === 0} onClick={() => void review(false)}>{t('sync.rejectAll')}</Button>
        {snapshot?.commitRequired && Boolean(snapshot.bundleChangeId) && <Button className="w-full" size="sm" variant="outline" disabled={blocked || changes.length > 0} data-testid="sync-discard-bundle" onClick={() => void discard()}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" />{t('sync.discardAccepted')}
        </Button>}
      </div>
    </div>
  )
}
