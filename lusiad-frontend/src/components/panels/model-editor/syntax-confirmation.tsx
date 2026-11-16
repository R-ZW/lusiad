'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n/locale-provider'
import { SyntaxReviewSession, type SyntaxDecision } from '@/lib/models/model-editor/syntax-review.model'
import type { SyntaxResult } from '@/lib/services/syntax-diagnostics/syntax-contract'
import type { JavaResult } from '@/lib/services/java-diagnostics/java-contract'

type AnalysisResult = SyntaxResult | JavaResult

interface Review {
  ticket: object; file: string; phase: 'checking' | 'problems' | 'unavailable'
  result?: AnalysisResult; error?: string; retry: () => void; engine: 'syntax' | 'java'; verify?: () => Promise<void>
}

export function useSyntaxConfirmation(identity: unknown) {
  const [session] = useState(() => new SyntaxReviewSession())
  const [review, setReview] = useState<Review | null>(null)
  const mounted = useRef(true)
  const invalidate = useCallback(() => { session.invalidate(); setReview(null) }, [session])
  useLayoutEffect(() => { invalidate() }, [identity, invalidate])
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; session.invalidate() } }, [session])
  const confirm = useCallback(async (file: string, analyze: () => Promise<AnalysisResult>, current: () => boolean, engine: 'syntax' | 'java' = 'syntax', verify?: (result: AnalysisResult) => Promise<void>) => {
    const { ticket, decision } = session.open()
    const run = async () => {
      if (!session.current(ticket) || !current()) { session.invalidate(); return }
      setReview({ ticket, file, phase: 'checking', engine, retry: () => { void run() } })
      try {
        const result = await analyze()
        if (!mounted.current || !session.current(ticket) || !current()) return
        if (!result.diagnostics.length) {
          await verify?.(result)
          if (session.current(ticket) && current()) { session.decide(ticket, 'apply'); setReview(null) }
        } else setReview({ ticket, file, phase: 'problems', engine, result, verify: verify ? () => verify(result) : undefined, retry: () => { void run() } })
      } catch (error) {
        if (mounted.current && session.current(ticket) && current())
          setReview({ ticket, file, phase: 'unavailable', engine, error: error instanceof Error ? error.message : String(error), retry: () => { void run() } })
      }
    }
    void run()
    const choice = await decision
    return current() ? choice : 'correct'
  }, [session])
  const decide = useCallback(async (choice: SyntaxDecision) => {
    if (!review || choice === 'apply' && review.phase === 'checking') return
    if (choice === 'apply' && review.verify) {
      setReview({ ...review, phase: 'checking' })
      try { await review.verify() }
      catch (failure) {
        if (session.current(review.ticket)) setReview({ ...review, phase: 'unavailable', result: undefined, verify: undefined, error: failure instanceof Error ? failure.message : String(failure) })
        return
      }
    }
    if (session.decide(review.ticket, choice)) setReview(null)
  }, [review, session])
  return { review, confirm, decide, invalidate }
}

export function SyntaxConfirmation({ review, decide }: { review: Review | null; decide: (choice: SyntaxDecision) => void }) {
  const { t } = useI18n()
  if (!review) return null
  return <Dialog open onOpenChange={open => { if (!open) decide('correct') }}>
    <DialogContent data-testid="syntax-confirmation" data-engine={review.engine} data-state={review.phase} className="max-h-[80vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">{review.phase === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4 diff-text-modified" />}{t(review.engine === 'java' ? `java.review.${review.phase}` : `syntax.${review.phase}`)}</DialogTitle>
        <DialogDescription>{t('syntax.proposal')} <span title={review.file}>{review.file.replace(/\\/g, '/').split('/').at(-1)}</span></DialogDescription>
      </DialogHeader>
      {review.phase === 'problems' && <><p className="text-sm text-muted-foreground">{t(review.engine === 'java' ? 'java.allErrors' : 'syntax.allErrors')}</p>
        <ol data-testid="syntax-problems" className="max-h-64 space-y-2 overflow-y-auto">{review.result!.diagnostics.map((problem, index) =>
          <li key={index} className="rounded border p-3 text-sm"><p>{problem.message}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{'file' in problem && problem.file && <span>{problem.file} · </span>}{problem.range
            ? t('syntax.location', { line: problem.range.startLine, column: problem.range.startColumn }) : t('syntax.noLocation')}</p></li>)}</ol></>}
      {review.engine === 'java' && <p className="text-xs text-muted-foreground">{t('java.contextOnly')}</p>}
      {review.phase === 'unavailable' && <div role="alert" className="space-y-2 text-sm"><p>{t(review.engine === 'java' ? 'java.notApproved' : 'syntax.notApproved')}</p><p className="break-words text-muted-foreground">{review.error}</p></div>}
      <DialogFooter className="flex-wrap gap-2">
        <Button data-testid="syntax-correct" variant="outline" onClick={() => decide('correct')}>{t('syntax.correct')}</Button>
        <Button data-testid="syntax-cancel" variant="outline" onClick={() => decide('cancel')}>{t('common.cancel')}</Button>
        {review.phase === 'unavailable' && <Button data-testid="syntax-retry" variant="outline" onClick={review.retry}>{t('syntax.retry')}</Button>}
        <Button data-testid="syntax-continue" disabled={review.phase === 'checking'} onClick={() => decide('apply')}>{t(review.phase === 'unavailable' ? 'syntax.continueUnverified' : 'syntax.continue')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
