'use client'

import { Button } from '@/components/ui/button'
import { EmptyState, Feedback } from '@/components/ui/feedback'
import { useI18n } from '@/lib/i18n/locale-provider'

export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n()
  return <main className="flex min-h-[70dvh] items-center justify-center p-6">
    <EmptyState className="max-w-xl">
      <Feedback tone="error" data-testid="page-load-error">{t('interface.loadFailed')}</Feedback>
      <Button onClick={reset}>{t('syntax.retry')}</Button>
    </EmptyState>
  </main>
}
