"use client"

import { CircleHelp } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/lib/i18n/locale-provider'
import type { MessageKey } from '@/lib/i18n/messages'
import { fieldEnabled, type AttributeField, type AttributeValues } from '@/lib/models/model-editor/component-creation.model'
import { cn } from '@/lib/utils'
import { AttributeCombobox } from './attribute-combobox'

export function FieldHelp({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  const { t } = useI18n()
  return <Tooltip>
    <TooltipTrigger asChild><button type="button" data-testid={testId} aria-label={t('creation.helpFor', { field: label })}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><CircleHelp className="h-3.5 w-3.5" /></button></TooltipTrigger>
    <TooltipContent className="max-w-80" side="top" sideOffset={5}>{children}</TooltipContent>
  </Tooltip>
}

interface Props {
  fields: readonly (AttributeField & { labelId?: string; index?: number })[]
  values: AttributeValues
  errors: Record<string, string | undefined>
  locked: boolean
  prefix: string
  className?: string
  onChange: (id: string, value: string | boolean) => void
}

/** Shared by creation and editing: same field contract, help, suggestions and input semantics. */
export function ComponentFields({ fields, values, errors, locked, prefix, className, onChange }: Props) {
  const { t } = useI18n()
  return <fieldset data-readonly={locked} className={cn("min-h-0 min-w-0 space-y-3 overflow-y-auto px-5 pb-4", className)}>
    {fields.map(field => {
      const id = `${prefix}-${field.id}`, labelId = field.labelId ?? field.id
      const enabled = fieldEnabled(field, values), issue = errors[field.id]
      const label = t(`creation.field.${labelId}` as MessageKey) + (field.index ? ` · catch ${field.index}` : '')
      const inputProps = { id, 'data-testid': id, disabled: !enabled || locked, 'aria-invalid': !!issue, 'aria-required': field.required && enabled && !locked,
        'aria-describedby': issue ? `${id}-error` : undefined, value: String(values[field.id] ?? ''), spellCheck: false }
      return <div key={field.id} className={!enabled ? 'space-y-1.5 opacity-50' : 'space-y-1.5'}>
        <div className="flex items-center gap-2">
          {field.kind === 'checkbox' && <Checkbox id={id} data-testid={id} disabled={locked} checked={values[field.id] === true} onCheckedChange={checked => onChange(field.id, checked === true)} />}
          <Label htmlFor={id} className="text-xs">{label}{field.required && <span aria-hidden="true"> *</span>}</Label>
          <FieldHelp label={label} testId={`${id}-help`}>{t(`creation.help.${labelId}` as MessageKey)}</FieldHelp>
        </div>
        {field.kind === 'checkbox' ? null : field.kind === 'multiline'
          ? <Textarea {...inputProps} rows={2} className="min-h-16 font-mono text-xs" onChange={event => onChange(field.id, event.target.value)} />
          : field.suggestions?.length
            ? <AttributeCombobox {...inputProps} suggestions={field.suggestions} onValueChange={value => onChange(field.id, value)} />
            : <Input {...inputProps} type={field.kind === 'number' ? 'number' : 'text'} min={field.kind === 'number' ? 1 : undefined}
                max={field.kind === 'number' ? 1000 : undefined} step={field.kind === 'number' ? 1 : undefined} onChange={event => onChange(field.id, event.target.value)} />}
        {issue && <p id={`${id}-error`} className="text-xs text-destructive">{t((issue === 'modifiers' ? 'structured.error.modifiers' : `creation.error.${issue}`) as MessageKey)}</p>}
      </div>
    })}
  </fieldset>
}
