'use client'

import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/lib/i18n/locale-provider'
import type { ComparisonFile } from '@/lib/services/model-comparison/model-comparison.service'
import { cn } from '@/lib/utils'

export function ComparisonGitDiff({ file }: { file: ComparisonFile }) {
  const { t, tp } = useI18n()
  const lines = file.hunks ? file.hunks.replace(/\n$/, '').split('\n').map((line) => line.replace(/\r$/, '')) : []

  return <section data-testid="comparison-git-diff" className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background"
    aria-label={t('comparison.gitDiff')}>
    <header className="shrink-0 border-b border-border bg-card/30 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="flex-1 text-xs text-muted-foreground">{t('comparison.gitDiffDescription')}</p>
        <Badge variant="outline" className="diff-text-added" title={tp('comparison.addedLines', file.addedLines)}
          aria-label={tp('comparison.addedLines', file.addedLines)}>+{file.addedLines}</Badge>
        <Badge variant="outline" className="diff-text-removed" title={tp('comparison.removedLines', file.removedLines)}
          aria-label={tp('comparison.removedLines', file.removedLines)}>−{file.removedLines}</Badge>
      </div>
      <p className="break-all font-mono text-xs diff-text-removed">--- {file.beforeSource === null ? '/dev/null' : `a/${file.path}`}</p>
      <p className="break-all font-mono text-xs diff-text-added">+++ {file.afterSource === null ? '/dev/null' : `b/${file.path}`}</p>
    </header>
    {lines.length === 0 ? <p className="m-auto p-8 text-center text-sm text-muted-foreground">{t('comparison.gitDiffEmpty')}</p> :
      <div className="min-h-0 flex-1 overflow-auto">
        <pre className="m-0 w-max min-w-full py-2 font-mono text-xs leading-6"><code>
          {lines.map((line, index) => <span key={index} className={cn('block min-h-6 whitespace-pre px-4',
            line.startsWith('+') ? 'diff-line diff-added'
              : line.startsWith('-') ? 'diff-line diff-removed'
                : line.startsWith('@@') ? 'diff-line diff-moved'
                  : line.startsWith('\\') ? 'italic text-muted-foreground' : 'text-foreground')}>{line}</span>)}
        </code></pre>
      </div>}
  </section>
}
