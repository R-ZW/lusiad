"use server"

import { backendAction } from "@/lib/services/backend-action"

import {
  compareReferences,
  searchComparisonOptions,
  parseJavaSource,
} from "@/lib/services/model-comparison/model-comparison.service"
import type { ComparisonSearchRequest } from "@/lib/services/model-comparison/comparison-reference.model"

export async function searchComparisonOptionsController(projectId: number, request: ComparisonSearchRequest) {
  return searchComparisonOptions(projectId, request)
}

export async function compareReferencesController(projectId: number, baseRef: string, targetRef: string) {
  return backendAction(async () => {
    return compareReferences(projectId, baseRef, targetRef)
  })
}

export async function parseComparedFileController(projectId: number, path: string, beforeSource: string | null, afterSource: string | null) {
  return backendAction(async () => {
    const [beforeModel, afterModel] = await Promise.all([
      beforeSource === null ? null : parseJavaSource(projectId, path, beforeSource),
      afterSource === null ? null : parseJavaSource(projectId, path, afterSource),
    ])
    return { beforeModel, afterModel }
  })
}
