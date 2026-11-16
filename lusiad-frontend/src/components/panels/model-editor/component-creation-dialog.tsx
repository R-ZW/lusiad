"use client"
import { ThemedCodeEditor } from '@/components/themed-code-editor'

import { useMemo, useReducer, useRef } from "react"
import { EditorView } from "@uiw/react-codemirror"
import { java } from "@codemirror/lang-java"
import { FileCode, Loader2, LockKeyhole } from "lucide-react"
import { Feedback } from "@/components/ui/feedback"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/lib/i18n/locale-provider"
import type { MessageKey } from "@/lib/i18n/messages"
import { componentDefinition, initialCreationDraft, previewComponentSource, reduceCreationDraft, validateAttributes, type AttributeValues, type CreateComponentRequest } from "@/lib/models/model-editor/component-creation.model"
import { libraryComponentContext } from "@/lib/models/model-editor/components-panel.model"
import { ComponentFields, FieldHelp } from "./component-fields"

interface Props {
  proposal: CreateComponentRequest & { path: string; initialValues?: AttributeValues }
  busy: boolean
  stale: boolean
  error: string | null
  retryable?: boolean
  onConfirm: (content: string) => Promise<void>
  onCancel: () => void
}

/** One draft and one code editor. A manual edit makes code authoritative for this creation. */
export function ComponentCreationDialog({ proposal, busy, stale, error, retryable = false, onConfirm, onCancel }: Props) {
  const { t } = useI18n()
  const { componentId, path, line, lineEnd, column } = proposal
  const dialogRef = useRef<HTMLDivElement>(null)
  const [draft, dispatch] = useReducer(reduceCreationDraft, componentId, id => initialCreationDraft(id, proposal.initialValues))
  const { values, manualSource } = draft
  const manual = manualSource !== null
  const errors = validateAttributes(componentId, values)
  const valid = Object.keys(errors).length === 0
  const source = manualSource ?? previewComponentSource(componentId, values)
  const locked = busy || stale || !!error && !retryable
  const fieldsLocked = locked || manual
  const fileName = path.replace(/\\/g, '/').split('/').at(-1) || path
  const location = t(lineEnd !== undefined && lineEnd !== line ? 'creation.range' : column !== undefined ? 'creation.column' : 'creation.line',
    { line, end: lineEnd ?? line, column: column ?? 1 })
  const extensions = useMemo(() => [java(), EditorView.contentAttributes.of({ 'aria-label': t('creation.code') })], [t])
  const update = (id: string, value: string | boolean) => dispatch({ type: 'attribute', id, value })

  return <Dialog open onOpenChange={open => { if (!open && !busy) onCancel() }}>
    <DialogContent ref={dialogRef} data-testid="component-creation" data-component-id={componentId} data-source-mode={manual ? 'code' : 'attributes'} aria-busy={busy}
      showCloseButton={!busy} className="flex h-[min(86vh,780px)] w-[min(94vw,1120px)] min-w-0 flex-col gap-3 overflow-hidden p-0"
      onOpenAutoFocus={event => { event.preventDefault(); dialogRef.current?.querySelector<HTMLElement>('fieldset input,fieldset textarea,fieldset button[role="checkbox"]')?.focus() }}
      onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onInteractOutside={event => { if (busy) event.preventDefault() }}>
      <DialogHeader className="shrink-0 gap-1 border-b px-5 py-4 pr-12">
        <DialogTitle className="text-base">{t('creation.title', { component: t(`library.snippet.${componentId}` as MessageKey) })}</DialogTitle>
        <DialogDescription asChild>
          <div data-testid="creation-destination" className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <FileCode className="h-3.5 w-3.5 shrink-0" />
            <Tooltip>
              <TooltipTrigger asChild><button type="button" data-testid="creation-file" className="truncate text-left underline-offset-2 hover:underline">{fileName}</button></TooltipTrigger>
              <TooltipContent className="max-w-lg break-all">{path}</TooltipContent>
            </Tooltip>
            <span aria-hidden="true">·</span><span className="shrink-0">{location}</span>
          </div>
        </DialogDescription>
      </DialogHeader>
      <p data-testid="creation-context" className="px-5 text-xs text-muted-foreground">{t(`library.context.${libraryComponentContext(componentId)}` as MessageKey)}</p>
      {stale && <Feedback data-testid="creation-stale" tone="warning" role="alert" className="mx-5">{t('creation.stale')}</Feedback>}
      {error && <Feedback data-testid="creation-error" tone="error" className="mx-5"><p>{error}</p><p>{t(retryable ? 'java.contextRetry' : 'creation.failed')}</p></Feedback>}
      <div className="grid min-h-0 flex-1 grid-rows-2 gap-0 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:grid-rows-1">
        <section aria-label={t('creation.attributes')} className="flex min-h-0 min-w-0 flex-col overflow-hidden border-b md:border-r md:border-b-0">
          <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-3 text-xs font-medium">
            <h3>{t('creation.attributes')}</h3>
            {manual && <span data-testid="creation-fields-locked" role="status" className="flex items-center gap-1 diff-text-modified"><LockKeyhole className="h-3.5 w-3.5" />{t('creation.fieldsLocked')}</span>}
          </div>
          <ComponentFields fields={componentDefinition(componentId).fields} values={values} errors={manual ? {} : errors}
            locked={fieldsLocked} prefix="creation" onChange={update} />
        </section>
        <section aria-label={t('creation.code')} className="flex min-h-0 min-w-0 flex-col gap-2 px-4 pb-3 max-md:pt-3">
          <div className="flex shrink-0 items-center justify-between gap-2 text-xs font-medium">
            <h3>{t('creation.code')}</h3><FieldHelp label={t('creation.code')}>{t('creation.codeHelp')}</FieldHelp>
          </div>
          <div data-testid="creation-source" className="min-h-0 flex-1 overflow-hidden rounded-md border">
            <ThemedCodeEditor value={source} onChange={value => { if (!locked) dispatch({ type: 'code', source: value }) }} extensions={extensions}
               height="100%" className="h-full text-xs" readOnly={locked}
              basicSetup={{ lineNumbers: true, highlightActiveLine: false, foldGutter: false, bracketMatching: true, autocompletion: false }} />
          </div>
          {manual && <p className="shrink-0 text-xs text-muted-foreground">{t('creation.manualNotice')}</p>}
        </section>
      </div>
      <DialogFooter className="shrink-0 border-t px-5 py-3">
        <Button data-testid="creation-cancel" variant="outline" disabled={busy} onClick={onCancel}>{t('common.cancel')}</Button>
        <Button data-testid="creation-submit" disabled={locked || !source || (!manual && !valid)} onClick={() => { void onConfirm(source) }}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t(busy ? 'creation.creating' : 'creation.create')}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
