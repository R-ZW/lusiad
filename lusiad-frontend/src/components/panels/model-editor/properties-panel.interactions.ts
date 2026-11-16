"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  buildPropertiesPanelUpdateRequestController,
  evaluatePropertiesPanelEditStateController,
} from "@/controllers/model-editor/properties-panel.controller"
import { inspectComponentDraftController } from "@/controllers/model-editor/component-edit.controller"
import { useI18n } from "@/lib/i18n/locale-provider"
import { type AttributeValues } from "@/lib/models/model-editor/component-creation.model"
import { applyStructuredValues, locateStructuredForm, validateStructuredValues } from "@/lib/models/model-editor/component-edit.model"
import { unwrapBackendAction } from "@/lib/services/backend-action-result"
import type { JavaModel, PsiNode } from "@/lib/types"

interface Params {
  projectId: number
  model: JavaModel
  context: string
  node: PsiNode
  original: string
  locked: boolean
  onUpdateNode: (node: PsiNode, newContent: string, onCancelDraft?: () => void) => Promise<void> | void
}

export function usePropertiesPanelInteractions({ projectId, model, context, node, original, locked, onUpdateNode }: Params) {
  const { t } = useI18n()
  const { startOffset, endOffset } = node
  const originalForm = useMemo(() => {
    if (startOffset === undefined || endOffset === undefined) return null
    const mapped = locateStructuredForm(model.tree, context, startOffset, endOffset)
    return mapped?.source === original ? mapped : null
  }, [model.tree, context, startOffset, endOffset, original])

  const [form, setForm] = useState(originalForm)
  const [values, setValues] = useState<AttributeValues>(() => originalForm?.values ?? {})
  const [manualSource, setManualSource] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [unmapped, setUnmapped] = useState(!originalForm)
  const version = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const structured = form !== null && manualSource === null
  const errors = structured ? validateStructuredValues(form, values) : {}
  const source = manualSource ?? (form ? applyStructuredValues(form, values, false) : original)
  const { canEdit, isContentChanged } = evaluatePropertiesPanelEditStateController(node, source, original)
  const disabled = locked || !canEdit
  const dirty = isContentChanged || Object.keys(errors).length > 0
  const canApply = !disabled && !analyzing && isContentChanged && !Object.keys(errors).length

  const changeField = (id: string, value: string | boolean) => {
    if (!disabled && structured && !analyzing) setValues(previous => ({ ...previous, [id]: value }))
  }
  const discard = () => {
    version.current++
    setForm(originalForm)
    setValues(originalForm?.values ?? {})
    setManualSource(null)
    setAnalyzing(false)
    setUnmapped(!originalForm)
    setAnalysisError(null)
  }
  const changeCode = (value: string) => {
    if (disabled || value === source) return
    if (value === original) {
      discard()
      return
    }
    version.current++
    setManualSource(value)
    setAnalyzing(false)
    setUnmapped(false)
    setAnalysisError(null)
  }
  const inspect = async () => {
    if (disabled || analyzing || startOffset === undefined || endOffset === undefined) return
    const ticket = ++version.current
    const current = () => mounted.current && version.current === ticket
    setAnalyzing(true)
    setAnalysisError(null)
    try {
      const result = unwrapBackendAction(await inspectComponentDraftController(projectId, model.file, context, startOffset, endOffset, source))
      if (!current()) return
      if (!result.form) {
        setUnmapped(true)
        return
      }
      setForm(result.form)
      setValues(result.form.values)
      setManualSource(null)
      setUnmapped(false)
    } catch (failure) {
      if (current()) setAnalysisError(failure instanceof Error ? failure.message : t('structured.analysisFailed'))
    } finally {
      if (current()) setAnalyzing(false)
    }
  }
  const apply = () => {
    if (!canApply) return
    const request = buildPropertiesPanelUpdateRequestController(node, source)
    void onUpdateNode(request.node, request.newContent, discard)
  }

  return { form, values, errors, source, structured, dirty, disabled, canApply, analyzing, unmapped, analysisError,
    canEdit, changeField, changeCode, discard, inspect, apply }
}
