import type { PsiNode } from "@/lib/types"
import {
  canEditNodeModel,
  formatNodeTypeLabelModel,
  isNodeContentChangedModel,
} from "@/lib/models/model-editor/properties-panel.model"

/**
 * Estado derivado usado pela camada de interacao para habilitar acoes de edicao.
 */
export interface PropertiesPanelEditStateFeatureResult {
  canEdit: boolean
  isContentChanged: boolean
}

/**
 * Encapsula a regra de editabilidade de um no PSI.
 */
export function canEditPropertiesNodeFeature(node: PsiNode | null): boolean {
  return canEditNodeModel(node)
}

/**
 * Formata o rotulo do tipo para exibicao em breadcrumbs e badges.
 */
export function formatNodeTypeLabelFeature(type: string): string {
  return formatNodeTypeLabelModel(type)
}

/**
 * Calcula o estado derivado de edicao do painel de propriedades.
 */
export function evaluatePropertiesPanelEditStateFeature(
  node: PsiNode | null,
  editableContent: string,
  selectedNodeContent: string
): PropertiesPanelEditStateFeatureResult {
  return {
    canEdit: canEditNodeModel(node),
    isContentChanged: isNodeContentChangedModel(node, editableContent, selectedNodeContent),
  }
}
