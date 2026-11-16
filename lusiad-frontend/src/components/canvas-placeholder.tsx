'use client'

import { Layers } from 'lucide-react'
import { useI18n } from '@/lib/i18n/locale-provider'

interface CanvasPlaceholderProps {
  showDiff?: boolean
  diffFileName?: string
}

export function CanvasPlaceholder({ showDiff, diffFileName }: CanvasPlaceholderProps) {
  const { t } = useI18n()
  if (showDiff && diffFileName) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/20 text-muted-foreground">
        <div className="text-center p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-background shadow-sm border border-border mb-4">
            <Layers className="h-8 w-8 text-muted-foreground/60" />
          </div>
          <h2 className="text-lg font-medium text-foreground mb-2">
            {t('editor.modelComparison')}
          </h2>
          <p className="text-sm max-w-md">
            {t('editor.modelComparisonDescription', { fileName: diffFileName })}
          </p>
          <div className="mt-6 p-4 bg-background rounded-lg border border-border shadow-sm">
            <p className="text-xs font-mono text-muted-foreground">
              [{t('editor.modelComparisonPlaceholder')}]
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-muted/20 text-muted-foreground">
      <div className="text-center p-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-background shadow-sm border border-border mb-4">
          <Layers className="h-8 w-8 text-muted-foreground/60" />
        </div>
        <h2 className="text-lg font-medium text-foreground mb-2">
          {t('editor.canvas')}
        </h2>
        <p className="text-sm max-w-md">
          {t('editor.mainArea')}
        </p>
      </div>
    </div>
  )
}
