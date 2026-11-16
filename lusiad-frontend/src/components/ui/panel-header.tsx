import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PanelHeader({ title, titleId, icon, actions, children, className, ...props }:
  Omit<ComponentProps<'header'>, 'title'> & { title: ReactNode; titleId?: string; icon?: ReactNode; actions?: ReactNode }) {
  return <header data-slot="panel-header" className={cn('ui-panel-header', className)} {...props}>
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {icon && <span aria-hidden="true" className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>}
      <h2 id={titleId} className="min-w-0 break-words text-sm font-semibold leading-snug">{title}</h2>
    </div>
    {children}
    {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
  </header>
}
