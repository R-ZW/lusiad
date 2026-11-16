'use client'

import type { ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { Button } from './button'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { useI18n } from '@/lib/i18n/locale-provider'

/** Click/keyboard help: explanations stay out of the settings form until requested. */
export function SettingsHelp({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  const { t } = useI18n()
  return <Popover>
    <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" data-testid={testId} aria-label={t('settings.helpFor', { field: label })}><CircleHelp className="size-4" /></Button></PopoverTrigger>
    <PopoverContent data-testid={testId ? `${testId}-content` : undefined} className="max-w-[calc(100vw-2rem)] whitespace-pre-line text-sm" align="end">{children}</PopoverContent>
  </Popover>
}
