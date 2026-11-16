'use client'

import { useEffect, useState } from 'react'
import { unwrapBackendAction } from '@/lib/services/backend-action-result'
import { FileCode, Folder, Loader2 } from 'lucide-react'
import { loadExternalBundleDiffController, type ExternalBundleDiffFile } from '@/controllers/external-sync/external-sync.controller'
import { useI18n } from '@/lib/i18n/locale-provider'

interface ExternalBundleDiffProps {
  projectId: number
  changeId: number
}

export function ExternalBundleDiff({ projectId, changeId }: ExternalBundleDiffProps) {
  const { t } = useI18n()
  const [files, setFiles] = useState<ExternalBundleDiffFile[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setFiles(null)
    setError(null)
    void loadExternalBundleDiffController(projectId, changeId).then((result) => {
      if (!cancelled) setFiles(unwrapBackendAction(result))
    }).catch((caught: unknown) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : t('sync.diffFailed'))
    })
    return () => { cancelled = true }
  }, [projectId, changeId, t])

  return (
    <div data-testid="external-bundle-diff" aria-busy={!files && !error} className="h-full overflow-y-auto bg-background p-4 text-foreground">
      <div className="mx-auto max-w-5xl space-y-3">
        <div>
          <h3 className="text-sm font-semibold">{t('sync.bundleTitle')}</h3>
        </div>
        {!files && !error && <Loader2 className="h-5 w-5 animate-spin" aria-label={t('sync.scanning')} />}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        {files?.length === 0 && <p className="text-xs text-muted-foreground">{t('sync.noBundleFiles')}</p>}
        {files?.map((file) => {
          const lines = file.javaDiff?.filter((line) => line.kind !== 'context') ?? null
          return <section key={file.path} className="overflow-hidden rounded-md border border-border">
            <div className="flex items-center gap-2 bg-muted/40 px-3 py-2 text-xs">
              {file.entryKind === 'directory' ? <Folder className="h-4 w-4 shrink-0" /> : <FileCode className="h-4 w-4 shrink-0" />}
              <span className="min-w-0 flex-1 break-all font-medium">{file.path}</span>
              <span className="text-muted-foreground">{t(`sync.${file.kind}`)}</span>
            </div>
            {lines && <div className="max-h-72 overflow-auto bg-card font-mono text-xs">
              {lines.length === 0 ? <p className="p-3 text-muted-foreground">{t('sync.noLineChanges')}</p> : lines.map((line, index) => (
                <div key={index} className={line.kind === 'added' ? 'diff-line diff-added' : 'diff-line diff-removed'}>
                  <span className="inline-block w-6 select-none text-center">{line.kind === 'added' ? '+' : '−'}</span>
                  <span className="whitespace-pre-wrap break-all">{line.text || ' '}</span>
                </div>
              ))}
            </div>}
            {lines === null && <p className="px-3 py-2 text-xs text-muted-foreground">{t('sync.fileOnly')}</p>}
          </section>
        })}
      </div>
    </div>
  )
}
