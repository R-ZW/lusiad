'use client'

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, CircleHelp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/locale-provider'
import { cn } from '@/lib/utils'
import { tutorials, type TutorialId, type TutorialStep } from './tutorial-catalogue'
import { clipTourRect, placeTourCard, type TourRect } from './tutorial-layout'

const TutorialContext = createContext<((id: TutorialId, trigger: HTMLButtonElement) => void) | null>(null)
type Session = { id: TutorialId; path: string; trigger: HTMLButtonElement; root: Element }

export function TutorialProvider({ children }: { children: ReactNode }) {
  const path = usePathname()
  const [session, setSession] = useState<Session | null>(null)
  const start = useCallback((id: TutorialId, trigger: HTMLButtonElement) => {
    const root = trigger.closest(tutorials[id].root) ?? document.querySelector(tutorials[id].root)
    if (root) setSession({ id, path, trigger, root })
  }, [path])
  // Navigation ends the guide. Going back must not resurrect a previous session.
  if (session && session.path !== path) setSession(null)
  return <TutorialContext.Provider value={start}>
    {children}
    {session && session.path === path && <TutorialSession key={`${session.path}:${session.id}`} session={session} close={() => setSession(null)} />}
  </TutorialContext.Provider>
}

export function TutorialButton({ tutorial, className }: { tutorial: TutorialId; className?: string }) {
  const start = useContext(TutorialContext)
  const { t, locale } = useI18n()
  return <Button type="button" variant="ghost" size="icon" data-testid="tutorial-start" data-tutorial={tutorial}
    className={cn('size-8 shrink-0 text-muted-foreground hover:text-foreground', className)}
    aria-label={t('tutorial.start', { name: tutorials[tutorial].title[locale] })}
    title={t('tutorial.start', { name: tutorials[tutorial].title[locale] })}
    onClick={event => start?.(tutorial, event.currentTarget)}><CircleHelp className="size-4" aria-hidden="true" /></Button>
}

function visibleRect(element: Element): TourRect | null {
  if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return null
  const bounds = element.getBoundingClientRect()
  let rect = clipTourRect(bounds, { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight })
  // Nested scroll areas may cut off a control even when it is inside the viewport.
  for (let parent = element.parentElement; parent && rect; parent = parent.parentElement) {
    const style = getComputedStyle(parent), box = parent.getBoundingClientRect()
    const clipsX = /(auto|scroll|hidden|clip)/.test(style.overflowX)
    const clipsY = /(auto|scroll|hidden|clip)/.test(style.overflowY)
    if (clipsX || clipsY) rect = clipTourRect(rect, {
      left: clipsX ? box.left : rect.left, top: clipsY ? box.top : rect.top,
      width: clipsX ? box.width : rect.width, height: clipsY ? box.height : rect.height,
    })
  }
  return rect
}

function findTarget(root: Element, step: TutorialStep) {
  for (const selector of step.targets) {
    const target = [...root.querySelectorAll(selector)].find(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
    if (target) return target
  }
  return null
}

function TutorialSession({ session, close }: { session: Session; close: () => void }) {
  const { t, locale } = useI18n()
  const tour = tutorials[session.id]
  const [index, setIndex] = useState(0)
  const step = tour.steps[index]
  const [card, setCard] = useState<HTMLDivElement | null>(null)
  const next = useRef<HTMLButtonElement>(null)
  const maskId = useId().replaceAll(':', '')
  const [geometry, setGeometry] = useState<{ rect: TourRect | null; missing: boolean; left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!card) return
    let frame = 0
    const root = session.root
    let target = findTarget(root, step)
    const scroll = target && target !== root ? target : null
    // Only reveal an existing control. Never click it, open data or mutate drafts.
    scroll?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    const measure = () => {
      frame = 0
      if (!root.isConnected || !session.trigger.isConnected) { close(); return }
      target = findTarget(root, step)
      const rect = target ? visibleRect(target) : null
      const fallback = rect ?? visibleRect(root)
      const size = card.getBoundingClientRect()
      const position = placeTourCard(fallback, size, { width: window.innerWidth, height: window.innerHeight })
      const value = { rect: fallback, missing: !rect, ...position }
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    const observer = new ResizeObserver(schedule)
    observer.observe(root)
    if (target) observer.observe(target)
    observer.observe(card)
    const mutations = new MutationObserver(schedule)
    mutations.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-state', 'class'] })
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    window.visualViewport?.addEventListener('resize', schedule)
    measure()
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      window.visualViewport?.removeEventListener('resize', schedule)
    }
  }, [step, session.root, session.trigger, close, card])

  const positioned = geometry !== null
  useEffect(() => { if (positioned) next.current?.focus() }, [positioned])

  // Arrow navigation leaves input editing and browser shortcuts alone.
  useEffect(() => {
    function navigate(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); setIndex(value => Math.max(0, value - 1)) }
      if (event.key === 'ArrowRight') { event.preventDefault(); setIndex(value => Math.min(tour.steps.length - 1, value + 1)) }
    }
    window.addEventListener('keydown', navigate)
    return () => window.removeEventListener('keydown', navigate)
  }, [tour.steps.length])

  const rect = geometry?.rect
  const last = index === tour.steps.length - 1
  return <Dialog.Root open onOpenChange={open => { if (!open) close() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[300]" data-testid="tutorial-shield">
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <defs><mask id={maskId}><rect width="100%" height="100%" fill="white" />
            {rect && <rect x={rect.left} y={rect.top} width={rect.width} height={rect.height} rx={6} fill="black" />}
          </mask></defs>
          <rect width="100%" height="100%" fill="black" opacity={0.58} mask={`url(#${maskId})`} />
        </svg>
        {rect && <div data-testid="tutorial-highlight" className="pointer-events-none fixed rounded-md border-2 border-primary ring-2 ring-background"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />}
      </Dialog.Overlay>
      <Dialog.Content ref={setCard} data-testid="tutorial" data-tutorial={session.id} data-step={step.id} data-index={index} data-total={tour.steps.length}
        onOpenAutoFocus={event => event.preventDefault()}
        onCloseAutoFocus={event => { event.preventDefault(); if (session.trigger.isConnected) session.trigger.focus({ preventScroll: true }) }}
        onPointerDownOutside={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}
        className="fixed z-[301] flex max-h-[calc(100dvh-1.5rem)] w-[min(23rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl outline-none"
        style={{ left: geometry?.left ?? 12, top: geometry?.top ?? 12, visibility: geometry ? 'visible' : 'hidden' }}>
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted/50 px-4 py-2">
          <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{tour.title[locale]}</span>
          <Button data-testid="tutorial-close" size="icon" variant="ghost" className="size-7" aria-label={t('tutorial.close')} onClick={close}><X className="size-4" /></Button>
        </div>
        <div className="min-h-0 space-y-3 overflow-y-auto p-4" aria-live="polite" aria-atomic="true">
          <p data-testid="tutorial-progress" className="text-xs tabular-nums text-muted-foreground">{t('tutorial.progress', { current: index + 1, total: tour.steps.length })}</p>
          <Dialog.Title className="text-base font-semibold">{step.title[locale]}</Dialog.Title>
          <Dialog.Description className="text-sm leading-relaxed">{step.body[locale]}</Dialog.Description>
          {geometry?.missing && <p data-testid="tutorial-unavailable" className="rounded-md border bg-muted/40 p-2 text-xs leading-relaxed text-muted-foreground">{t('tutorial.unavailable')}</p>}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-muted/30 px-4 py-3">
          <Button data-testid="tutorial-previous" variant="outline" size="sm" disabled={!index} onClick={() => setIndex(value => value - 1)}><ArrowLeft className="size-3.5" />{t('tutorial.previous')}</Button>
          <Button ref={next} data-testid="tutorial-next" size="sm" onClick={() => last ? close() : setIndex(value => value + 1)}>
            {t(last ? 'tutorial.finish' : 'tutorial.next')}{last ? <Check className="size-3.5" /> : <ArrowRight className="size-3.5" />}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
