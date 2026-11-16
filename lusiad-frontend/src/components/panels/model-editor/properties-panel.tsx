"use client"

import { useEffect, useMemo, useState } from "react"
import { java } from "@codemirror/lang-java"
import { EditorView } from "@uiw/react-codemirror"
import { Box, Code2, Hash, Loader2, MapPin, RefreshCw, Save, SlidersHorizontal, X } from "lucide-react"
import { ThemedCodeEditor } from "@/components/themed-code-editor"
import { Button } from "@/components/ui/button"
import { EmptyState, Feedback } from "@/components/ui/feedback"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatNodeTypeLabelController } from "@/controllers/model-editor/properties-panel.controller"
import { useI18n } from "@/lib/i18n/locale-provider"
import type { JavaModel, PsiNode } from "@/lib/types"
import { ComponentFields } from "./component-fields"
import { TutorialButton } from '@/components/tutorials/tutorial-provider'
import { usePropertiesPanelInteractions } from "./properties-panel.interactions"

export interface PropertiesPanelProps {
  projectId: number
  model: JavaModel | null
  modelSource: string
  saveError?: string | null
  readOnly?: boolean
  selectedNode: PsiNode | null
  selectedNodeContent: string
  isUpdatingNode?: boolean
  onDraftChange?: (dirty: boolean) => void
  onUpdateNode: (node: PsiNode, newContent: string, onCancelDraft?: () => void) => Promise<void> | void
}

export function PropertiesPanel(props: PropertiesPanelProps) {
  const { t } = useI18n()
  const [tab, setTab] = useState('attributes')
  const { model, selectedNode: node, projectId, selectedNodeContent } = props
  if (!model || !node) return (
    <aside data-testid="properties" data-state="empty" data-dirty={false} aria-label={t('editor.properties')}
      className="relative flex h-full min-h-0 items-center justify-center bg-background p-3">
      <TutorialButton tutorial="properties" className="absolute right-2 top-2" />
      <EmptyState icon={<SlidersHorizontal />} className="text-xs">{t('editor.selectForProperties')}</EmptyState>
    </aside>
  )

  // Both tabs share a draft bound to one file revision and selection.
  const key = JSON.stringify([projectId, model.file, model.revision, node.type, node.startOffset, node.endOffset, selectedNodeContent])
  return <PropertiesSelection key={key} {...props} model={model} selectedNode={node} tab={tab} setTab={setTab} />
}

function PropertiesSelection({
  projectId, model, modelSource, selectedNode: node, selectedNodeContent: original, saveError,
  readOnly = false, isUpdatingNode = false, onDraftChange, onUpdateNode, tab, setTab,
}: PropertiesPanelProps & { model: JavaModel; selectedNode: PsiNode; tab: string; setTab: (tab: string) => void }) {
  const { t } = useI18n()
  const draft = usePropertiesPanelInteractions({ projectId, model, context: modelSource, node, original, locked: readOnly || isUpdatingNode, onUpdateNode })
  const extensions = useMemo(() => [java(), EditorView.contentAttributes.of({ 'aria-label': t('creation.code') })], [t])
  const position = `${node.startLine}:${node.startColumn}–${node.endLine}:${node.endColumn}`
  const offsets = `${node.startOffset ?? '—'}–${node.endOffset ?? '—'}`
  const metadata = [
    { label: t('properties.type'), value: formatNodeTypeLabelController(node.type), fullValue: node.type, icon: Box },
    { label: t('properties.position'), value: position, fullValue: position, icon: MapPin },
    { label: t('properties.offsets'), value: offsets, fullValue: offsets, icon: Hash },
  ]
  useEffect(() => {
    onDraftChange?.(draft.dirty)
    return () => onDraftChange?.(false)
  }, [draft.dirty, onDraftChange])

  return <aside data-testid="properties" data-state={isUpdatingNode ? 'saving' : 'ready'} aria-label={t('editor.properties')}
    aria-busy={isUpdatingNode} data-dirty={draft.dirty} data-component-id={draft.form?.componentId ?? 'unmapped'}
    data-source-mode={draft.structured ? 'attributes' : 'code'} data-start-offset={node.startOffset} data-end-offset={node.endOffset}
    className="h-full min-h-0 bg-background">
    <Tabs value={tab} onValueChange={setTab} className="h-full min-h-0 gap-0">
      <header className="flex shrink-0 items-center gap-1.5 border-b border-border bg-muted/50 p-2.5 dark:bg-black/15">
        <TabsList aria-label={t('editor.properties')} className="grid min-w-0 flex-1 grid-cols-2 overflow-hidden">
          <TabsTrigger value="attributes" data-testid="properties-attributes-tab" className="min-w-0 px-1 text-xs">
            <SlidersHorizontal aria-hidden="true" className="size-3.5" /><span className="truncate">{t('creation.attributes')}</span>
          </TabsTrigger>
          <TabsTrigger value="code" data-testid="properties-code-tab" className="min-w-0 px-1 text-xs">
            <Code2 aria-hidden="true" className="size-3.5" /><span className="truncate">{t('creation.code')}</span>
          </TabsTrigger>
        </TabsList>
        <TutorialButton tutorial="properties" />
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        {saveError && <Feedback data-testid="properties-save-error" tone="error" className="mx-2.5 mt-2.5 max-h-24 shrink-0 overflow-y-auto">{saveError}</Feedback>}
        {!draft.canEdit && <p className="px-2.5 pt-2 text-xs text-muted-foreground">{t('editor.invalidOffsets')}</p>}
        <TabsContent value="attributes" className="min-h-0 overflow-y-auto overscroll-contain p-2.5">
          {!draft.structured && <div data-testid="structured-fields-locked" className="mb-3 space-y-2">
            <p className="text-xs text-muted-foreground">{t(draft.unmapped ? 'structured.unmapped' : 'structured.manual')}</p>
            {draft.dirty && <Button data-testid="structured-inspect" variant="outline" size="sm" className="h-auto min-h-8 w-full whitespace-normal text-xs"
              disabled={draft.disabled || draft.analyzing} onClick={() => { void draft.inspect() }}>
              {draft.analyzing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {t('structured.inspect')}
            </Button>}
          </div>}
          {draft.analysisError && <Feedback data-testid="structured-analysis-error" tone="error" className="mb-3">{draft.analysisError}</Feedback>}
          {draft.form && <ComponentFields fields={draft.form.bindings.map(binding => binding.field)} values={draft.values} errors={draft.errors}
            locked={draft.disabled || !draft.structured || draft.analyzing} prefix="structured" className="overflow-visible px-0 pb-0" onChange={draft.changeField} />}
        </TabsContent>
        <TabsContent value="code" className="min-h-0 p-2.5 data-[state=active]:flex data-[state=active]:flex-col">
          <div data-testid="properties-code" className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
            <ThemedCodeEditor value={draft.source} onChange={draft.changeCode} extensions={extensions} height="100%" className="h-full text-xs"
              readOnly={draft.disabled} placeholder={t('editor.contentPlaceholder')}
              basicSetup={{ lineNumbers: true, highlightActiveLine: false, foldGutter: false, bracketMatching: true, autocompletion: false }} />
          </div>
        </TabsContent>
      </div>
      <footer className="shrink-0 border-t border-border bg-muted/50 dark:bg-black/15">
        <div className="flex gap-1.5 px-2 py-1.5">
          <Button data-testid="properties-discard" type="button" size="sm" variant="outline" className="h-7 min-w-0 flex-1 text-xs"
            disabled={!draft.dirty || isUpdatingNode} onClick={draft.discard}>
            <X aria-hidden="true" className="size-3.5" /><span className="truncate">{t('properties.discard')}</span>
          </Button>
          <Button data-testid="properties-apply" type="button" size="sm" className="h-7 min-w-0 flex-1 text-xs"
            disabled={!draft.canApply} onClick={draft.apply}>
            {isUpdatingNode ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <Save aria-hidden="true" className="size-3.5" />}
            <span className="truncate">{t(isUpdatingNode ? 'properties.saving' : 'common.save')}</span>
          </Button>
        </div>
        <dl data-testid="properties-metadata" className="flex items-center justify-between gap-2 border-t border-border px-2 py-1 text-[11px] text-muted-foreground">
          {metadata.map(({ label, value, fullValue, icon: Icon }) => (
            <div key={label} title={`${label} · ${fullValue}`} className="min-w-0">
              <dt className="sr-only">{label}</dt>
              <dd className="flex min-w-0 items-center gap-1 tabular-nums">
                <Icon aria-hidden="true" className="size-3 shrink-0" />
                <span className="truncate">{value}</span>
              </dd>
            </div>
          ))}
        </dl>
      </footer>
    </Tabs>
  </aside>
}
