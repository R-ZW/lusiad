'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useI18n } from '@/lib/i18n/locale-provider'

export interface DrawerItem {
  id: string
  title: string
  icon: React.ReactNode
  content: React.ReactNode
  badge?: number
  badgeLabel?: string
  status?: 'ready' | 'attention' | 'error'
}

interface DrawerToolbarProps {
  items: DrawerItem[]
  openDrawers: string[]
  onToggleDrawer: (id: string) => void
  position: 'left' | 'right'
}

export function DrawerToolbar({
  items,
  openDrawers,
  onToggleDrawer,
  position,
}: DrawerToolbarProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'flex flex-col items-center py-3 gap-1.5 bg-muted/50 border-border',
          position === 'left' ? 'border-r' : 'border-l'
        )}
      >
        {items.map((item) => {
          const isOpen = openDrawers.includes(item.id)
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <Button
                  data-testid="drawer-toggle"
                  data-drawer-id={item.id}
                  data-status={item.status}
                  data-count={item.badge}
                  aria-expanded={isOpen}
                  aria-controls={`drawer-panel-${item.id}`}
                  variant={isOpen ? 'secondary' : 'ghost'}
                  size="icon"
                  className={cn(
                    'relative h-9 w-9 shrink-0 transition-colors',
                    isOpen && 'bg-primary/10 text-primary ring-1 ring-primary/25',
                    item.status === 'ready' && 'diff-text-added dark:text-emerald-400',
                    item.status === 'attention' && 'diff-text-modified dark:text-amber-400',
                    item.status === 'error' && 'text-destructive'
                  )}
                  onClick={() => onToggleDrawer(item.id)}
                  aria-label={item.badgeLabel ? `${item.title}: ${item.badgeLabel}` : item.title}
                >
                  {item.icon}
                  {item.badge !== undefined && <span className={cn(
                    'absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-semibold leading-none shadow-sm',
                    item.status === 'ready' ? 'diff-block diff-added diff-text-added' : 'diff-block diff-modified diff-text-modified'
                  )}>{item.badge > 99 ? '99+' : item.badge}</span>}
                </Button>
              </TooltipTrigger>
              <TooltipContent side={position === 'left' ? 'right' : 'left'}>
                {item.title}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}

interface DrawerIslandProps {
  item: DrawerItem
  order: number
  defaultSize: number
  minSize: number
}

export function DrawerIsland({ item, order, defaultSize, minSize }: DrawerIslandProps) {
  return (
    <ResizablePanel
      data-testid="drawer-panel"
      data-drawer-id={item.id}
      id={`drawer-panel-${item.id}`}
      order={order}
      defaultSize={defaultSize}
      minSize={minSize}
      role="region" aria-label={item.title}
      className="flex flex-col min-h-0 bg-background"
    >
      <div className="min-h-0 flex-1 overflow-auto bg-background">
        {item.content}
      </div>
    </ResizablePanel>
  )
}

interface DrawerContainerProps {
  items: DrawerItem[]
  openDrawers: string[]
  onToggleDrawer: (id: string) => void
  position: 'left' | 'right'
}

const DEFAULT_DRAWER_WIDTH_PX = 320
const MIN_DRAWER_WIDTH_PX = 240
const MAX_DRAWER_WIDTH_PX = 520

export function DrawerContainer({
  items,
  openDrawers,
  onToggleDrawer,
  position,
}: DrawerContainerProps) {
  const { t } = useI18n()
  const openItems = items.filter((item) => openDrawers.includes(item.id))
  const hasOpenDrawers = openItems.length > 0
  const [drawerWidthPx, setDrawerWidthPx] = useState(DEFAULT_DRAWER_WIDTH_PX)
  const resizeStateRef = useRef<{
    isResizing: boolean
    startX: number
    startWidth: number
    previousUserSelect: string
  } | null>(null)

  const handleResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()

      resizeStateRef.current = {
        isResizing: true,
        startX: event.clientX,
        startWidth: drawerWidthPx,
        previousUserSelect: document.body.style.userSelect,
      }

      document.body.style.userSelect = 'none'
    },
    [drawerWidthPx]
  )

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!resizeStateRef.current?.isResizing) {
        return
      }

      const delta = event.clientX - resizeStateRef.current.startX
      const nextWidth =
        position === 'left'
          ? resizeStateRef.current.startWidth + delta
          : resizeStateRef.current.startWidth - delta
      const clampedWidth = Math.min(
        MAX_DRAWER_WIDTH_PX,
        Math.max(MIN_DRAWER_WIDTH_PX, nextWidth)
      )

      setDrawerWidthPx(clampedWidth)
    }

    const handleMouseUp = () => {
      if (!resizeStateRef.current?.isResizing) {
        return
      }

      document.body.style.userSelect = resizeStateRef.current.previousUserSelect
      resizeStateRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [position])

  return (
    <div
      className={cn(
        'flex h-full',
        position === 'left' ? 'flex-row' : 'flex-row-reverse'
      )}
    >
      <DrawerToolbar
        items={items}
        openDrawers={openDrawers}
        onToggleDrawer={onToggleDrawer}
        position={position}
      />

      {hasOpenDrawers && (
        <div
          className={cn(
            'relative flex flex-col border-border bg-background',
            position === 'left' ? 'border-r' : 'border-l'
          )}
          style={{ width: drawerWidthPx, maxWidth: "min(38vw, calc(100vw - 5rem))" }}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t('drawers.resize')}
            className={cn(
              'absolute inset-y-0 z-10 w-2 cursor-col-resize bg-transparent transition-colors hover:bg-muted/40',
              position === 'left' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2'
            )}
            tabIndex={0}
            aria-valuemin={MIN_DRAWER_WIDTH_PX} aria-valuemax={MAX_DRAWER_WIDTH_PX} aria-valuenow={drawerWidthPx}
            onKeyDown={event => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              setDrawerWidthPx(previous => event.key === 'Home' ? MIN_DRAWER_WIDTH_PX : event.key === 'End' ? MAX_DRAWER_WIDTH_PX
                : Math.min(MAX_DRAWER_WIDTH_PX, Math.max(MIN_DRAWER_WIDTH_PX, previous + (event.key === 'ArrowRight' ? 16 : -16) * (position === 'left' ? 1 : -1))))
            }}
            onMouseDown={handleResizeStart}
          />
          <ResizablePanelGroup id={`drawer-stack-${position}`} data-testid="drawer-stack" data-side={position} direction="vertical" keyboardResizeBy={5} className="min-h-0 flex-1">
            {openItems.map((item, index) => (
              <Fragment key={item.id}>
                <DrawerIsland item={item} order={index} defaultSize={100 / openItems.length} minSize={Math.min(15, 75 / openItems.length)} />
                {index < openItems.length - 1 && <ResizableHandle
                  id={`drawer-divider-${position}-${item.id}`}
                  data-testid="drawer-divider"
                  data-before-drawer-id={item.id}
                  data-after-drawer-id={openItems[index + 1].id}
                  aria-orientation="horizontal"
                  aria-label={t('drawers.resizeHeight', { first: item.title, second: openItems[index + 1].title })}
                  title={t('drawers.resizeHeight', { first: item.title, second: openItems[index + 1].title })}
                  className="shrink-0 cursor-row-resize border-y border-muted-foreground/30 bg-muted-foreground/20 transition-colors hover:bg-muted-foreground/35 data-[resize-handle-state=drag]:bg-muted-foreground/45 data-[panel-group-direction=vertical]:h-1.5"
                />}
              </Fragment>
            ))}
          </ResizablePanelGroup>
        </div>
      )}
    </div>
  )
}
