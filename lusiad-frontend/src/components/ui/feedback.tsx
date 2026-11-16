import type { ComponentProps, ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'error' | 'warning' | 'success' | 'info' | 'loading'

/** Local feedback stays beside its operation; critical errors never expire. */
export function Feedback({ tone = 'info', children, className, ...props }:
  ComponentProps<'div'> & { tone?: Tone }) {
  const Icon = tone === 'loading' ? Loader2 : tone === 'success' ? CheckCircle2
    : tone === 'error' || tone === 'warning' ? AlertCircle : Info
  return <div data-slot="feedback" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}
    className={cn('ui-feedback', className)} {...props}>
    <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', tone === 'loading' && 'animate-spin')} />
    <div className="min-w-0 flex-1 break-words">{children}</div>
  </div>
}

export function EmptyState({ children, icon, className, ...props }:
  ComponentProps<'div'> & { icon?: ReactNode }) {
  return <div data-slot="empty-state" className={cn('ui-empty', className)} {...props}>
    {icon && <span aria-hidden="true" className="text-muted-foreground [&_svg]:size-6">{icon}</span>}
    {children}
  </div>
}
