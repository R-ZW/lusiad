import "server-only"
import { containedPath } from "../contained-paths"
import { readResourceStates } from '../undo/resource-image'
import { readChangeMetadata } from '../../models/change-history/change-metadata'

import { parseSnapshotFile } from "../restore/snapshot-reader"
import type { JavaModel, PsiNode } from "@/lib/types"

import type { ChangeDiffOperation, ChangeDiffSnapshot } from "@/lib/models/change-diff/change-diff.model"
export type { ChangeDiffOperation, ChangeDiffSnapshot } from "@/lib/models/change-diff/change-diff.model"

interface LoadChangeDiffParams {
  projectId: number
  projectTempPath: string
  changeId: string
  changeType?: string | null
  reqBody: unknown
}

interface ChangeRequestBody {
  path?: string
  sourcePath?: string
  destPath?: string
  startOffset?: number | string
  endOffset?: number | string
  line?: number | string
}

function parseRequestBody(reqBody: unknown): ChangeRequestBody {
  if (!reqBody || typeof reqBody !== "object") {
    return {}
  }

  return reqBody as ChangeRequestBody
}

function normalizeRelativePath(value: string | undefined): string {
  if (!value) {
    return ""
  }

  return value.replace(/\\/g, "/").trim()
}

/**
 * The PSI endpoint can return sparse children for empty or partially parsed
 * Java files. Keep the usable part of that real response and turn an invalid
 * root into an unavailable snapshot instead of crashing the details dialog.
 */
function normalizePsiNode(value: unknown): PsiNode | null {
  if (!value || typeof value !== "object") return null
  const node = value as PsiNode
  if (typeof node.type !== "string") return null
  const rawChildren = Array.isArray(node.children) ? node.children : []
  const children = rawChildren.map(normalizePsiNode).filter((child): child is PsiNode => child !== null)

  return {
    ...node,
    ...(rawChildren.length > 0 || children.length > 0 ? { children } : {}),
  }
}

export function normalizePsiModel(value: JavaModel): JavaModel | null {
  const tree = normalizePsiNode(value?.tree)
  return tree ? { ...value, tree } : null
}

async function readSnapshotModel(projectId: number, root: string, path: string): Promise<JavaModel | null> {
  try {
    const model = normalizePsiModel(await parseSnapshotFile(projectId, root, path))
    if (!model) throw new Error(`Árvore PSI inválida: ${path}`)
    return model
  } catch (error) {
    // Distinguish a missing snapshot file from transport or parsing failures.
    // The caller then reports an incomplete reconstruction explicitly.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

function toAbsoluteSnapshotPath(projectTempPath: string, snapshotFolder: string, relativePath: string): string {
  return containedPath(projectTempPath, `${snapshotFolder}/${relativePath}`)
}

function parseOperation(reqBody: ChangeRequestBody, changeType?: string | null): ChangeDiffOperation {
  const normalizedType = typeof changeType === "string" ? changeType.toLowerCase() : ""

  if (normalizedType.includes("move")) {
    return "move"
  }

  if (normalizedType.includes("delete")) {
    return "delete"
  }

  if (normalizedType.includes("create") || normalizedType.includes("add")) {
    return "create"
  }

  if (normalizedType.includes("update") || normalizedType.includes("modify")) {
    return "update"
  }

  if (reqBody.sourcePath && reqBody.destPath) {
    return "move"
  }

  if (reqBody.startOffset !== undefined && reqBody.endOffset !== undefined && reqBody.line !== undefined) {
    return "move"
  }

  if (reqBody.startOffset !== undefined && reqBody.endOffset !== undefined) {
    return "update"
  }

  if (reqBody.line !== undefined) {
    return "create"
  }

  return "unknown"
}

export async function loadChangeDiffSnapshotFeature(params: LoadChangeDiffParams): Promise<ChangeDiffSnapshot> {
  const reqBody = parseRequestBody(params.reqBody)
  const operation = parseOperation(reqBody, params.changeType)
  const images = readResourceStates(reqBody), metadata = readChangeMetadata(reqBody)
  let beforeRelativePath = normalizeRelativePath(reqBody.sourcePath ?? reqBody.path ?? reqBody.destPath)
  let afterRelativePath = normalizeRelativePath(reqBody.destPath ?? reqBody.path ?? reqBody.sourcePath)
  if (images) {
    const before = metadata?.before?.path, after = metadata?.after?.path
    const javaFile = (entries: typeof images.before.entries, preferred?: string) => Object.keys(entries).filter(path => entries[path].kind === 'file' && path.toLowerCase().endsWith('.java'))
      .sort((a,b) => Number(b === preferred || !!preferred && b.startsWith(preferred+'/')) - Number(a === preferred || !!preferred && a.startsWith(preferred+'/')) || a.localeCompare(b))[0] ?? ''
    afterRelativePath = javaFile(images.after.entries, after)
    beforeRelativePath = javaFile(images.before.entries, before)
    // For an unchanged filename in a content operation, retain its exact pairing.
    if (metadata?.kind === 'code') beforeRelativePath = afterRelativePath = before ?? after ?? ''
  }
  const resolvedRelativePath = afterRelativePath || beforeRelativePath
  const beforePath = beforeRelativePath ? toAbsoluteSnapshotPath(params.projectTempPath, "working-copy-prev", beforeRelativePath) : ""
  const afterPath = afterRelativePath ? toAbsoluteSnapshotPath(params.projectTempPath, "working-copy", afterRelativePath) : ""

  const beforeModelPromise = beforePath
    ? readSnapshotModel(params.projectId, params.projectTempPath, beforePath)
    : Promise.resolve<JavaModel | null>(null)
  const afterModelPromise = afterPath
    ? readSnapshotModel(params.projectId, params.projectTempPath, afterPath)
    : Promise.resolve<JavaModel | null>(null)

  const [beforeModel, afterModel] = await Promise.all([beforeModelPromise, afterModelPromise])
  if ((!beforeModel || !afterModel) && !images) {
    throw new Error("CHANGE_SNAPSHOT_INCOMPLETE")
  }

  return {
    changeId: params.changeId,
    operation,
    filePath: resolvedRelativePath,
    beforePath,
    afterPath,
    beforeModel,
    afterModel,
    beforeProjectModels: [],
    afterProjectModels: [],
  }
}
