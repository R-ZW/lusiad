'use client'

import { useEffect, useState } from 'react'
import { Lock, RefreshCw } from 'lucide-react'
import { ThemedCodeEditor } from '@/components/themed-code-editor'
import { Button } from '@/components/ui/button'
import { Feedback, EmptyState } from '@/components/ui/feedback'
import { useI18n } from '@/lib/i18n/locale-provider'
import { loadFileTextController } from '@/controllers/file-explorer/file-preview.controller'
import { unwrapBackendAction } from '@/lib/services/backend-action-result'
import type { FileTextPreview } from '@/lib/models/file-explorer/text-preview'

export function FileTextView({ projectId, path, signal }: { projectId: number; path: string; signal: string }) {
  const { t, locale } = useI18n()
  const [refresh, setRefresh] = useState(0)
  const [state, setState] = useState<{ key: string; result?: FileTextPreview; error?: string } | null>(null)
  const key = JSON.stringify([projectId, path, signal, locale, refresh])
  useEffect(() => {
    let cancelled = false
    void loadFileTextController(projectId, path).then(value => {
      const result = unwrapBackendAction(value); if (!cancelled) setState({ key, result })
    }).catch(error => { if (!cancelled) setState({ key, error: error instanceof Error ? error.message : t('explorer.text.error') }) })
    return () => { cancelled = true }
  }, [projectId, path, key, t])
  const current = state?.key === key ? state : null
  return <section data-testid="file-text-preview" data-path={path} data-state={!current ? 'loading' : current.error ? 'error' : 'ready'} data-readonly="true"
    data-revision={current?.result?.revision} className="flex h-full min-h-0 flex-col overflow-hidden">
    <header className="flex shrink-0 items-center gap-2 border-b bg-muted/20 px-4 py-2 text-xs text-muted-foreground"><Lock className="size-3.5" /><span className="flex-1">{t('explorer.text.readOnly')}</span>
      {current?.result && <span>{current.result.encoding} · {current.result.bytes} B</span>}
      <Button data-testid="file-text-refresh" variant="ghost" size="icon" className="size-8" aria-label={t('common.reloadView')} onClick={() => setRefresh(value => value + 1)}><RefreshCw /></Button></header>
    {!current && <EmptyState className="flex-1"><Feedback tone="loading">{t('editor.loadingFile')}</Feedback></EmptyState>}
    {current?.error && <EmptyState className="flex-1"><Feedback data-testid="file-text-error" tone="error">{current.error}</Feedback></EmptyState>}
    {current?.result && <ThemedCodeEditor data-testid="file-text-content" aria-label={t('explorer.text.readOnly')} value={current.result.text} readOnly editable={false} height="100%" className="min-h-0 flex-1 overflow-auto font-mono text-sm"
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false, autocompletion: false }} />}
  </section>
}
