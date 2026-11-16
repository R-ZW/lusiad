'use client'
import { ThemedCodeEditor } from '@/components/themed-code-editor'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Undo2, Redo2, Loader2 } from 'lucide-react'

import { java } from '@codemirror/lang-java'
import { Feedback } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n/locale-provider'
import { generatedChangeText } from '@/lib/i18n/change-text'
import { SyntaxConfirmation, useSyntaxConfirmation } from './syntax-confirmation'
import { undoState, undoPreview, undoAnalyze, undoApply, undoCancel } from '@/lib/services/undo/undo-client'
import { checkJavaContextController } from '@/lib/services/java-diagnostics/java-client'
import { unwrapBackendAction } from '@/lib/services/backend-action-result'
import type { UndoState, UndoCursor, UndoProposal } from '@/lib/services/undo/undo-contract'
import type { SyntaxResult } from '@/lib/services/syntax-diagnostics/syntax-contract'
import type { MutationGate } from '@/lib/models/model-editor/editor-session'

interface Props {
  projectId: number; viewKey: string; signal: string; blocked: boolean; suspended: boolean; semantic: boolean; mutationGate?: MutationGate
  onBusyChange: (busy: boolean) => void; onConfirmed: (proposal: UndoProposal) => Promise<void>
}
interface Draft { proposal: UndoProposal; values: Record<string,string>; selected: string }
export function UndoControls({ projectId, viewKey, signal, blocked, suspended, semantic, mutationGate, onBusyChange, onConfirmed }: Props) {
  const { t, changeTextLocale } = useI18n()
  const [state, setState] = useState<UndoState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const sequence = useRef(0), refreshSequence = useRef(0), request = useRef<UndoCursor | null>(null)
  const project = useRef(projectId)
  useLayoutEffect(() => { project.current = projectId }, [projectId])
  // Loading/refreshing disables a new action; it does not change an already captured proposal.
  // Source/view changes and external/draft barriers still invalidate it, and apply revalidates in Java.
  const identity = useMemo(() => ({ projectId, viewKey, suspended, semantic }), [projectId, viewKey, suspended, semantic])
  const review = useSyntaxConfirmation(identity)
  useLayoutEffect(() => {
    const invalidate = () => { sequence.current += 1; const active = request.current; if (active) void undoCancel(projectId, active).catch(() => {}) }
    invalidate(); setDraft(null)
    return invalidate
  }, [identity, projectId])
  useEffect(() => () => { if (request.current) void undoCancel(projectId, request.current).catch(() => {}) }, [projectId])
  const refresh = useCallback(async () => {
    if (project.current !== projectId) return
    const current = ++refreshSequence.current
    try { const next = await undoState(projectId); if (current === refreshSequence.current) setState(next) }
    catch (failure) { if (current === refreshSequence.current) { setState(null); setError(failure instanceof Error ? failure.message : String(failure)) } }
  }, [projectId])
  useEffect(() => {
    if (busy || blocked) { refreshSequence.current++; return }
    const invalidate = () => { refreshSequence.current += 1 }
    void refresh(); const timer = window.setInterval(() => { if (!busy) void refresh() }, 8000)
    return () => { invalidate(); window.clearInterval(timer) }
  }, [refresh, signal, busy, blocked])
  const execute = useCallback(async (direction: 'undo' | 'redo', correction?: Draft) => {
    if (!state || blocked || busy || state.blockedCode) return
    const token = mutationGate?.acquire(); if (mutationGate && !token) return
    const ticket = ++sequence.current
    const cursor: UndoCursor = correction
      ? { direction: correction.proposal.direction, epoch: correction.proposal.epoch, revision: correction.proposal.revision, requestId: crypto.randomUUID(), corrections: correction.values }
      : { direction, epoch: state.epoch, revision: state.revision, requestId: crypto.randomUUID() }
    request.current = cursor; setBusy(true); onBusyChange(true); setError(null)
    let applied = false
    const current = () => ticket === sequence.current
    try {
      const proposal = await undoPreview(projectId, cursor)
      if (!current()) return
      let contextRevision: string | undefined
      const needsSyntax = proposal.files.some(file => typeof file.afterText === 'string' || file.analysisError)
      const choice = !semantic && !needsSyntax ? 'apply' : await review.confirm(proposal.path, async () => {
        const result = await undoAnalyze(projectId, cursor, semantic)
        if ('source' in result) return result
        const first = result.files[0]
        if (!first) throw new Error(proposal.files.find(file => file.analysisError)?.analysisError ?? 'Java syntax analysis was not completed')
        return { ...first,
          diagnostics: result.files.flatMap(file => file.diagnostics.map(problem => ({ ...problem, file: file.file }))) } as SyntaxResult
      }, current, semantic ? 'java' : 'syntax', async result => {
        contextRevision = undefined
        if (result.source === 'javac') { unwrapBackendAction(await checkJavaContextController(projectId, result.contextRevision)); contextRevision = result.contextRevision }
        await undoPreview(projectId, cursor)
      })
      if (!current()) return
      if (choice === 'correct') {
        const values = Object.fromEntries(proposal.files.filter(file => typeof file.afterText === 'string').map(file => [file.path, file.afterText!]))
        if (Object.keys(values).length) setDraft({ proposal, values: correction?.values ?? values, selected: correction?.selected ?? Object.keys(values)[0] })
        return
      }
      if (choice === 'cancel') { setDraft(null); return }
      const result = await undoApply(projectId, cursor, contextRevision); applied = result.noOp !== true
      if (current()) { setDraft(null); if (applied) await onConfirmed(proposal) }
    } catch (failure) { setError((applied ? t('undo.appliedReload') + ' ' : '') + (failure instanceof Error ? failure.message : String(failure))) }
    finally {
      if (token) mutationGate?.release(token)
      void undoCancel(projectId, cursor).catch(() => {})
      request.current = null; setBusy(false); onBusyChange(false); await refresh()
    }
  }, [state, blocked, busy, mutationGate, onBusyChange, onConfirmed, projectId, review, semantic, refresh, t])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!event.ctrlKey && !event.metaKey || event.altKey || target?.closest('input,textarea,select,[contenteditable="true"],.cm-editor,[role="dialog"]') || draft || blocked || busy) return
      if (event.key.toLowerCase() === 'z' || event.ctrlKey && event.key.toLowerCase() === 'y') {
        const direction = event.shiftKey || event.key.toLowerCase() === 'y' ? 'redo' : 'undo'
        if (!state?.[direction] || state.blockedCode) return
        event.preventDefault(); void execute(direction)
      }
    }
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown)
  }, [execute, state, draft, blocked, busy])
  return <>
    <div data-testid="undo-controls" data-state={busy ? 'working' : state?.blockedCode ? 'blocked' : state ? 'ready' : 'unavailable'} className="flex shrink-0 items-center gap-1">
      {(['undo','redo'] as const).map(direction => {
        const step = state?.[direction]
        const label = step ? generatedChangeText({ changeMetadata: step.metadata }, changeTextLocale)?.title ?? step.path : ''
        const reason = state?.blockedCode === 'operation_pending' ? t('undo.pending') : state?.blockedCode === 'sync_review_required' ? t('undo.syncRequired') : state?.blockedMessage
        const title = blocked || draft ? t('undo.busy') : !state ? t('undo.unavailable') : reason ?? (step ? `${t(`undo.${direction}`)}: ${label} · ${step.path}` : t('undo.empty'))
        const Icon = direction === 'undo' ? Undo2 : Redo2
        return <Button key={direction} data-testid={`workspace-${direction}`} size="icon" variant="ghost" title={title} aria-label={`${t(`undo.${direction}`)}${label ? ': '+label : ''}`}
          disabled={!step || blocked || busy || !!draft || !!state?.blockedCode} onClick={() => { void execute(direction) }}><Icon className="h-4 w-4" /></Button>
      })}
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {state?.evicted ? <span title={t('undo.limited')} className="text-xs text-muted-foreground">{t('undo.limited')}</span> : null}
    </div>
    {error && <Feedback data-testid="undo-error" tone="error" className="max-w-md">{error}<button className="ml-2 underline" onClick={() => { setError(null); void refresh() }}>{t('common.reloadView')}</button></Feedback>}
    <SyntaxConfirmation review={review.review} decide={review.decide} />
    <Dialog open={!!draft && !review.review} onOpenChange={open => { if (!open && !busy) setDraft(null) }}>
      <DialogContent data-testid="undo-correction" className="max-w-3xl"><DialogHeader><DialogTitle>{t('undo.correctTitle')}</DialogTitle><DialogDescription>{t('undo.correctHelp')}</DialogDescription></DialogHeader>
        {draft && <><select aria-label={t('common.file')} data-testid="undo-correction-file" className="h-9 rounded border bg-background px-2" disabled={busy} value={draft.selected} onChange={event => setDraft({ ...draft, selected: event.target.value })}>{Object.keys(draft.values).map(file => <option key={file}>{file}</option>)}</select>
          <div data-testid="undo-correction-source"><ThemedCodeEditor value={draft.values[draft.selected]} extensions={[java()]} height="320px" editable={!busy} onChange={value => setDraft({ ...draft, values: { ...draft.values, [draft.selected]: value } })} /></div></>}
        <DialogFooter><Button data-testid="undo-correction-cancel" variant="outline" disabled={busy} onClick={() => setDraft(null)}>{t('common.cancel')}</Button><Button data-testid="undo-correction-save" disabled={busy || !draft} onClick={() => { if (draft) void execute(draft.proposal.direction, draft) }}>{t('common.save')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
