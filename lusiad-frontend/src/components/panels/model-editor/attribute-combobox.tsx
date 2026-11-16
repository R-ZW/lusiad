"use client"

import { useEffect, useId, useRef, useState, type ComponentProps } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useI18n } from '@/lib/i18n/locale-provider'

interface Props extends Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> {
  'data-testid'?: string
  value: string
  suggestions: readonly string[]
  onValueChange: (value: string) => void
}

/** A short curated list with an unrestricted text input; suggestions never coerce a value. */
export function AttributeCombobox({ value, suggestions, onValueChange, disabled, ...props }: Props) {
  const { t } = useI18n()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const options = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const choose = (option: string) => { onValueChange(option); setOpen(false); input.current?.focus() }
  const expanded = open && !disabled
  useEffect(() => {
    if (expanded) options.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [expanded, active])
  return <Popover open={expanded} onOpenChange={next => { setOpen(next); setActive(Math.max(0, suggestions.indexOf(value))) }}>
    <div className="relative">
      <Input {...props} ref={input} value={value} disabled={disabled} className="pr-9"
        role="combobox" aria-expanded={expanded} aria-controls={expanded ? id : undefined} aria-autocomplete="none"
        aria-activedescendant={expanded ? `${id}-${active}` : undefined}
        onChange={event => onValueChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false) }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            setActive(previous => !expanded ? Math.max(0, suggestions.indexOf(value)) : (previous + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length)
          }
          if (event.key === 'Enter' && expanded) { event.preventDefault(); choose(suggestions[active]) }
          if (event.key === 'Tab') setOpen(false)
        }} />
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" disabled={disabled} className="absolute top-0 right-0 h-full w-9"
          data-testid={`${props['data-testid']}-suggestions`} aria-label={t('creation.suggestions')}>
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
    </div>
    <PopoverContent align="start" className="w-64 p-1" onOpenAutoFocus={event => { event.preventDefault(); input.current?.focus() }}
      onInteractOutside={event => { if (event.target === input.current) event.preventDefault() }}
      onEscapeKeyDown={event => { event.preventDefault(); setOpen(false) }} onCloseAutoFocus={event => event.preventDefault()}>
      <div ref={options} id={id} role="listbox" aria-label={t('creation.suggestions')} className="max-h-56 overflow-y-auto">
        {suggestions.map((option, index) => <button key={option} id={`${id}-${index}`} type="button" role="option" tabIndex={-1}
          aria-selected={value === option} data-active={active === index}
          onPointerMove={event => {
            // Scrolling/repositioning the list under a stationary pointer must
            // not replace the option highlighted by keyboard navigation.
            if (event.movementX || event.movementY) setActive(index)
          }} onClick={() => choose(option)}
          className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left font-mono text-sm data-[active=true]:bg-accent">
          {option}{value === option && <Check className="h-3.5 w-3.5" />}
        </button>)}
      </div>
    </PopoverContent>
  </Popover>
}
