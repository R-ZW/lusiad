"use server"

import { backendAction } from "@/lib/services/backend-action"
import type { BackendActionResult } from "@/lib/services/backend-action-result"

import type { JavaModel } from "@/lib/types"
import { checkJavaContext } from "@/lib/services/java-diagnostics/java-diagnostics.service"
import { withLusiadMutation } from "@/lib/services/external-sync/external-sync.service"
import {
  createSnippetFeature,
  deleteRangeFeature,
  moveRangeFeature,
  readModelFeature,
  updateRangeFeature,
  type CreateSnippetFeatureResult,
  type DeleteRangeFeatureResult,
  type MoveRangeFeatureResult,
  type UpdateRangeFeatureResult,
} from "@/features/model-editor/model-editor.feature"

/** Parametros para exclusao por faixa de offsets. */
interface DeleteRangeControllerParams {
  projectId: number
  path: string
  startOffset: number
  endOffset: number
  changeDescription?: string
  semanticContext?: string
  expectedHash?: string
}

/** Parametros para edicao por faixa de offsets. */
interface UpdateRangeControllerParams extends DeleteRangeControllerParams {
  newContent: string
}

/** Parametros para criacao de trecho em linha/intervalo de linhas. */
interface CreateSnippetControllerParams {
  projectId: number
  path: string
  line: number
  lineEnd?: number
  column?: number
  content: string
  changeDescription?: string
  semanticContext?: string
  expectedHash?: string
}

/** Parametros para mover trecho para uma nova linha. */
interface MoveRangeControllerParams extends DeleteRangeControllerParams {
  line: number
  lineEnd?: number
  column?: number
}

/** Resultado da exclusao contendo dados validados para log/telemetria. */
export interface DeleteRangeControllerResult extends DeleteRangeFeatureResult {
  path: string
  startOffset: number
  endOffset: number
}

/** Resultado da atualizacao contendo dados validados para log/telemetria. */
export interface UpdateRangeControllerResult extends UpdateRangeFeatureResult {
  path: string
  startOffset: number
  endOffset: number
}

/** Resultado da criacao contendo caminho resolvido e dados normalizados. */
export interface CreateSnippetControllerResult extends CreateSnippetFeatureResult {
  path: string
}

/** Resultado da movimentacao contendo caminho resolvido e dados normalizados. */
export interface MoveRangeControllerResult extends MoveRangeFeatureResult {
  path: string
}

/**
 * Valida e normaliza um caminho de arquivo recebido da camada de interacao.
 */
function requireValidPath(path: string, failureMessage: string): string {
  const trimmedPath = path.trim()

  if (!trimmedPath) {
    throw new Error(failureMessage)
  }

  return trimmedPath
}

/**
 * Garante que offsets existem e representam um intervalo crescente valido.
 */
function validateOffsetRange(
  startOffset: number,
  endOffset: number,
  invalidOffsetsMessage: string,
  invalidRangeMessage: string
): { startOffset: number; endOffset: number } {
  if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset)) {
    throw new Error(invalidOffsetsMessage)
  }

  // Number(...) protege a cadeia contra valores opcionais serializados como string.
  const resolvedStartOffset = Number(startOffset)
  const resolvedEndOffset = Number(endOffset)

  if (resolvedEndOffset <= resolvedStartOffset) {
    throw new Error(invalidRangeMessage)
  }

  return {
    startOffset: resolvedStartOffset,
    endOffset: resolvedEndOffset,
  }
}

/** Garante que uma linha de destino e um numero valido >= 1. */
function validateLine(line: number, invalidLineMessage: string): number {
  if (!Number.isFinite(line) || line < 1) {
    throw new Error(invalidLineMessage)
  }

  return Number(line)
}

/** Carrega o modelo PSI para o arquivo informado. */
export async function loadModelController(projectId: number, path: string): Promise<BackendActionResult<JavaModel>> {
  return backendAction(async () => {
    const trimmedPath = requireValidPath(path, "Selecione um arquivo no explorador")
    return readModelFeature(projectId, trimmedPath)
  })
}

/**
 * Controla a exclusao de trecho: valida entrada e delega para a feature.
 */
export async function deleteRangeController({
  projectId,
  path,
  startOffset,
  endOffset,
  changeDescription,
  expectedHash,
  semanticContext,
}: DeleteRangeControllerParams, allowWithoutUndo = false): Promise<BackendActionResult<DeleteRangeControllerResult>> {
  return backendAction(async () => {
    const resolvedPath = requireValidPath(path, "Nao foi possivel excluir: caminho do arquivo nao informado")
    const resolvedOffsets = validateOffsetRange(
      startOffset,
      endOffset,
      "Nao foi possivel excluir: offsets invalidos para o elemento selecionado",
      "Nao foi possivel excluir: intervalo de offsets invalido"
    )

    const featureResult = await verifiedMutation(projectId, [resolvedPath], semanticContext, () => deleteRangeFeature({
      projectId,
      allowWithoutUndo,
      path: resolvedPath,
      startOffset: resolvedOffsets.startOffset,
      endOffset: resolvedOffsets.endOffset,
      changeDescription,
      expectedHash,
    }))

    return {
      ...featureResult,
      path: resolvedPath,
      startOffset: resolvedOffsets.startOffset,
      endOffset: resolvedOffsets.endOffset,
    }
  })
}

/**
 * Controla a edicao de trecho: valida entrada e delega para a feature.
 */
export async function updateRangeController({
  projectId,
  path,
  startOffset,
  endOffset,
  newContent,
  changeDescription,
  expectedHash,
  semanticContext,
}: UpdateRangeControllerParams, allowWithoutUndo = false): Promise<BackendActionResult<UpdateRangeControllerResult>> {
  return backendAction(async () => {
    const resolvedPath = requireValidPath(path, "Nao foi possivel editar: caminho do arquivo nao informado")
    const resolvedOffsets = validateOffsetRange(
      startOffset,
      endOffset,
      "Nao foi possivel editar: offsets invalidos para o elemento selecionado",
      "Nao foi possivel editar: intervalo de offsets invalido"
    )

    const featureResult = await verifiedMutation(projectId, [resolvedPath], semanticContext, () => updateRangeFeature({
      projectId,
      allowWithoutUndo,
      path: resolvedPath,
      startOffset: resolvedOffsets.startOffset,
      endOffset: resolvedOffsets.endOffset,
      newContent,
      changeDescription,
      expectedHash,
    }))

    return {
      ...featureResult,
      path: resolvedPath,
      startOffset: resolvedOffsets.startOffset,
      endOffset: resolvedOffsets.endOffset,
    }
  })
}

/**
 * Controla a criacao de trecho: valida caminho, linha e conteudo minimo.
 */
export async function createSnippetController({
  projectId,
  path,
  line,
  lineEnd,
  column,
  content,
  changeDescription,
  expectedHash,
  semanticContext,
}: CreateSnippetControllerParams, allowWithoutUndo = false): Promise<BackendActionResult<CreateSnippetControllerResult>> {
  return backendAction(async () => {
    const resolvedPath = requireValidPath(path, "Nao foi possivel criar: caminho do arquivo nao informado")
    const resolvedLine = validateLine(line, "Nao foi possivel criar: linha de destino invalida")

    if (!content) {
      throw new Error("Nao foi possivel criar: conteudo vazio")
    }

    const featureResult = await verifiedMutation(projectId, [resolvedPath], semanticContext, () => createSnippetFeature({
      projectId,
      allowWithoutUndo,
      path: resolvedPath,
      line: resolvedLine,
      lineEnd,
      column,
      content,
      changeDescription,
      expectedHash,
    }))

    return {
      ...featureResult,
      path: resolvedPath,
    }
  })
}

/**
 * Controla a movimentacao de trecho: valida offsets/linha e delega para a feature.
 */
export async function moveRangeController({
  projectId,
  path,
  startOffset,
  endOffset,
  line,
  lineEnd,
  column,
  changeDescription,
  expectedHash,
  semanticContext,
}: MoveRangeControllerParams, allowWithoutUndo = false): Promise<BackendActionResult<MoveRangeControllerResult>> {
  return backendAction(async () => {
    const resolvedPath = requireValidPath(path, "Nao foi possivel mover: caminho do arquivo nao informado")
    const resolvedOffsets = validateOffsetRange(
      startOffset,
      endOffset,
      "Nao foi possivel mover: offsets invalidos",
      "Nao foi possivel mover: intervalo de offsets invalido"
    )
    const resolvedLine = validateLine(line, "Nao foi possivel mover: linha de destino invalida")

    const featureResult = await verifiedMutation(projectId, [resolvedPath], semanticContext, () => moveRangeFeature({
      projectId,
      allowWithoutUndo,
      path: resolvedPath,
      startOffset: resolvedOffsets.startOffset,
      endOffset: resolvedOffsets.endOffset,
      line: resolvedLine,
      lineEnd,
      column,
      changeDescription,
      expectedHash,
    }))

    return {
      ...featureResult,
      path: resolvedPath,
    }
  })
}

/** Existing mutation gate remains authoritative; revalidate the full compiler context just before saving. */
async function verifiedMutation<T>(projectId: number, paths: string[], semanticContext: string | undefined, action: () => Promise<T>): Promise<T> {
  return withLusiadMutation(projectId, paths, async () => {
    if (semanticContext) await checkJavaContext(projectId, semanticContext)
    return action()
  })
}
