'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CollapsiblePanelProps {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  defaultExpanded?: boolean
  className?: string
  minHeight?: string
}

export function CollapsiblePanel({
  title,
  icon,
  children,
  defaultExpanded = true,
  className,
  minHeight = 'auto',
}: CollapsiblePanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div className={cn('flex flex-col border-b border-border last:border-b-0', className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/50 transition-colors shrink-0 bg-sidebar/80"
      >
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <span className="flex-1 text-xs font-medium text-foreground">{title}</span>
        {isExpanded ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {isExpanded && (
        <div className="flex-1 overflow-hidden" style={{ minHeight }}>
          {children}
        </div>
      )}
    </div>
  )
}

interface SidebarContainerProps {
  position: 'left' | 'right'
  children: React.ReactNode
  defaultCollapsed?: boolean
  className?: string
}

export function SidebarContainer({
  position,
  children,
  defaultCollapsed = false,
  className,
}: SidebarContainerProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)

  return (
    <div
      className={cn(
        'relative flex flex-col bg-sidebar border-border transition-all duration-200',
        position === 'left' ? 'border-r' : 'border-l',
        isCollapsed ? 'w-10' : 'w-72 lg:w-80 xl:w-[340px]',
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'absolute top-1/2 -translate-y-1/2 z-10 h-6 w-6 rounded-full bg-background border border-border shadow-sm hover:bg-accent',
          position === 'left' ? '-right-3' : '-left-3'
        )}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {position === 'left' ? (
          isCollapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )
        ) : isCollapsed ? (
          <ChevronLeft className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </Button>

      {!isCollapsed && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      )}

      {isCollapsed && (
        <div className="flex-1 flex items-center justify-center">
          <span
            className="text-xs text-muted-foreground writing-mode-vertical whitespace-nowrap"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            {position === 'left' ? 'Explorador' : 'Versionamento'}
          </span>
        </div>
      )}
    </div>
  )
}
