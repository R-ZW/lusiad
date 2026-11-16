import "server-only"
import { assertSeparateRoots, containedPath } from "../contained-paths"

import { randomUUID } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { basename, join, relative, resolve, sep } from "node:path"

import { getCommitRowById } from "@/lib/repositories/commit-history/commit-history.repository"
import { searchComparisonHistoryRows } from "@/lib/repositories/model-comparison/comparison-options.repository"
import { findRestoreContextByChangeId } from "@/lib/repositories/restore/restore.repository"
import { findProjectById } from "@/lib/repositories/track-control/track-control.repository"
import type { JavaModel, PsiNode } from "@/lib/types"
import { semanticTokens } from "./model-comparison.model"
import { compareGitSources, gitCommand, readGitComparisonRefs, readGitJavaSnapshot, type GitSourceDiff } from "./git-snapshot"
import { matchesComparisonOption, normalizeComparisonSearch, pageComparisonOptions, parseComparisonRef, resolveComparisonReference,
  type ComparisonOption, type ComparisonOptionPage, type ComparisonSearchRequest, type ExternalComparisonNotice } from "./comparison-reference.model"
import { normalizePsiSource } from "./psi-source"
import { backendUrl } from "@/lib/config/backend"
import { assertTestPath, assertTestTree } from "@/lib/config/runtime-config"
import { listProjectHistoryTags } from "@/lib/repositories/history-tags/history-tags.repository"
import { historyTagReference, historyTagTargetReference } from "@/lib/models/history-tags/history-tags.model"

import { removeTemporaryEntry } from "../temporary-files"
import { postBackendJson } from "../backend-client"
import { requirePsiModel, requireRestoreResult } from "../backend-response"

import { prepareChangeArchive } from "../restore/change-archive.service"

export interface ComparisonFile extends GitSourceDiff {
  path: string
  status: "added" | "deleted" | "changed"
  beforeSource: string | null
  afterSource: string | null
}

export interface ComparisonResult {
  baseRef: string
  targetRef: string
  files: ComparisonFile[]
  referenceNotices: ExternalComparisonNotice[]
}

type SourceSnapshot = Map<string, string>

function validProjectId(projectId: number): void {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new Error("Projeto inválido")
}

async function projectRoot(projectId: number): Promise<string> {
  validProjectId(projectId)
  const project = await findProjectById(projectId)
  if (!project) throw new Error("Projeto não encontrado")
  assertTestPath(project.path, "projects", false)
  return resolve(project.path)
}

function numericId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error("Identificador numérico inválido")
  const id = Number(value)
  if (!Number.isSafeInteger(id)) throw new Error("Identificador numérico inválido")
  return id
}

async function committedSha(projectId: number, root: string, ref: string): Promise<string> {
  const parsed = parseComparisonRef(ref)
  let candidate: string
  if (parsed.kind === "commit") {
    const row = await getCommitRowById(projectId, numericId(parsed.id))
    if (!row?.git_id) throw new Error("Commit não encontrado neste projeto")
    candidate = row.git_id
  } else if (parsed.kind === "branch") candidate = `refs/heads/${parsed.id}`
  else if (parsed.kind === "tag") candidate = `refs/tags/${parsed.id}`
  else if (parsed.kind === "sha") candidate = parsed.id
  else throw new Error("Mudanças individuais são reconstituídas separadamente")

  try {
    return (await gitCommand(root, ["rev-parse", "--verify", "--end-of-options", `${candidate}^{commit}`])).trim()
  } catch {
    throw new Error(`Referência Git indisponível: ${ref}`)
  }
}

async function readJavaDirectory(root: string): Promise<SourceSnapshot> {
  const result: SourceSnapshot = new Map()
  async function walk(folder: string): Promise<void> {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const full = containedPath(root, join(folder, entry.name))
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".java")) {
        result.set(relative(root, full).split(sep).join("/"), await readFile(full, "utf8"))
      }
    }
  }
  await walk(root)
  return result
}

async function changeSnapshot(projectId: number, changeId: number): Promise<SourceSnapshot> {
  const context = await findRestoreContextByChangeId(changeId)
  if (!context || context.projectId !== projectId) throw new Error("Mudança commitada não encontrada neste projeto")
  const root = resolve(context.projectPath)
  const tempRoot = resolve(context.tempPath)
  const snapshotId = `compare-${randomUUID()}`
  assertSeparateRoots(root, tempRoot)
  const comparisonRoot = containedPath(tempRoot, `comparisons/${snapshotId}`)
  try {
    await gitCommand(root, ["rev-parse", "--verify", "--end-of-options", `${context.currentGitId}^{commit}`])
      .catch(() => { throw new Error("O commit Git desta mudança não existe no repositório") })
    await prepareChangeArchive(context, `comparisons/${snapshotId}/archive`)
    await postBackendJson(backendUrl("/restore/apply"), {
      changeId, snapshotId,
    }, "Falha ao reconstruir comparação", (body, label) => requireRestoreResult(body, label, changeId, { snapshotId, projectId, commitId: context.commitId, gitId: context.currentGitId }))
    return await readJavaDirectory(containedPath(tempRoot, `comparisons/${snapshotId}/working-copy`))
  } finally {
    assertTestTree(comparisonRoot)
    await removeTemporaryEntry(tempRoot, comparisonRoot)
  }
}

async function snapshot(projectId: number, root: string, ref: string): Promise<SourceSnapshot> {
  const parsed = parseComparisonRef(ref)
  if (parsed.kind === "empty") return new Map()
  if (parsed.kind === "change") return changeSnapshot(projectId, numericId(parsed.id))
  return readGitJavaSnapshot(root, await committedSha(projectId, root, ref))
}

export async function parseJavaSource(projectId: number, path: string, source: string): Promise<JavaModel> {
  validProjectId(projectId)
  const response = await postBackendJson(backendUrl("/psi/parse"), {
    projectId, fileName: basename(path.replace(/\\/g, "/")), content: normalizePsiSource(source),
  }, "Falha ao interpretar modelo", requirePsiModel)
  return { file: path, tree: response.tree }
}

function sameModelTokens(before: PsiNode, after: PsiNode): boolean {
  const left = semanticTokens(before)
  const right = semanticTokens(after)
  return left.length === right.length && left.every((token, index) => token.key === right[index].key)
}

export async function compareReferences(projectId: number, baseRef: string, targetRef: string): Promise<ComparisonResult> {
  const root = await projectRoot(projectId)
  const usesVersion = [baseRef, targetRef].some((value) => parseComparisonRef(value).kind === "version")
  const tags = usesVersion ? (await listProjectHistoryTags(projectId)).tags : []
  const findVersion = async (id: number) => {
    const tag = tags.find((item) => item.id === id)
    return tag ? { projectId, value: historyTagTargetReference(tag) } : null
  }
  const base = await resolveComparisonReference(projectId, baseRef, findRestoreContextByChangeId, findVersion)
  const target = await resolveComparisonReference(projectId, targetRef, findRestoreContextByChangeId, findVersion)
  // Replay uses IntelliJ's VFS/PSI facilities. Keep two historical replays ordered.
  const before = await snapshot(projectId, root, base.value)
  const after = await snapshot(projectId, root, target.value)
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a.localeCompare(b))
  const files: ComparisonFile[] = []
  for (const path of paths) {
    const beforeSource = before.get(path) ?? null
    const afterSource = after.get(path) ?? null
    if (beforeSource === afterSource) continue
    if (beforeSource !== null && afterSource !== null) {
      const [beforeModel, afterModel] = await Promise.all([
        parseJavaSource(projectId, path, beforeSource), parseJavaSource(projectId, path, afterSource),
      ])
      if (sameModelTokens(beforeModel.tree, afterModel.tree)) continue
    }
    const gitDiff = await compareGitSources(beforeSource, afterSource)
    files.push({ path, status: beforeSource === null ? "added" : afterSource === null ? "deleted" : "changed",
      beforeSource, afterSource, ...gitDiff })
  }
  const referenceNotices: ExternalComparisonNotice[] = []
  if (base.externalChange) referenceNotices.push({ side: "base", ...base.externalChange })
  if (target.externalChange) referenceNotices.push({ side: "target", ...target.externalChange })
  return { baseRef: base.value, targetRef: target.value, files, referenceNotices }
}

export async function searchComparisonOptions(projectId: number, request: ComparisonSearchRequest): Promise<ComparisonOptionPage> {
  const root = await projectRoot(projectId)
  const search = normalizeComparisonSearch(request)
  const refs = search.kind === "all" || search.kind === "branch" || search.kind === "tag"
    ? (await readGitComparisonRefs(root, search.kind)).filter((option) =>
      search.exactRef ? option.value === search.exactRef : matchesComparisonOption(option, search.query)) : []
  if (["all", "tag", "version"].includes(search.kind)) {
    const { tags } = await listProjectHistoryTags(projectId)
    const named = tags.filter((tag) => tag.commitId !== null).map((tag): ComparisonOption => ({
      value: historyTagReference(tag), label: tag.name, kind: "version", timestamp: tag.timestamp,
      targetRef: historyTagTargetReference(tag), commitId: tag.targetKind === "change" ? tag.commitId ?? undefined : undefined,
      branchName: tag.branchName ?? undefined, changeType: tag.changeType ?? undefined, filePath: tag.targetTitle,
    })).filter((option) => search.exactRef ? option.value === search.exactRef : matchesComparisonOption(option, search.query))
    refs.unshift(...named)
  }
  const loadHistory = ["all", "commit", "change"].includes(search.kind) ? async (limit: number, offset: number) => {
    const rows = await searchComparisonHistoryRows(projectId, search, limit, offset)
    return rows.map((row): ComparisonOption => ({
      value: `${row.kind}:${row.id}`, label: row.label || `#${row.id}`, kind: row.kind,
      timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp,
      branchName: row.branch_name, sha: row.git_id, commitId: row.commit_id ?? undefined,
      filePath: row.file_path ?? undefined, changeType: row.change_type ?? undefined,
      changeBody: row.kind === "change" ? row.req_body : undefined,
    }))
  } : undefined
  return pageComparisonOptions(refs, search.offset, loadHistory)
}
