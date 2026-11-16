"use server"

import { gitAction } from "@/lib/services/commit-menu/git-action"
import { GitValidationError } from "@/lib/services/commit-menu/git-operation"
import type { BackendActionResult } from "@/lib/services/backend-action-result"

import type { StatusResult } from "simple-git"
import { checkIsGitRepository, initGitRepository, readGitStatus, readGitBranchName } from "@/lib/services/commit-menu/commit-menu.service"
import { getPool } from "@/lib/repositories/database"
import { ensureInitialGitSnapshot, needsInitialGitSnapshot, recordGitOperation, withGitRecordingLock } from "@/lib/services/commit-menu/git-recording.service"
import {
  findProjectByPath,
  insertBranch,
  insertProject,
  listBranchesByProjectId,
  setBranchState,
  setProjectTempPath,
} from "@/lib/repositories/track-control/track-control.repository"
import {
  ensureProjectTempDirectories,
  resolveProjectTempPath,
} from "@/lib/services/project-temp/project-temp.service"
import {
  assertExternalBundleReady,
  withExternalSyncLock,
} from "@/lib/services/external-sync/external-sync.service"
import { resolveRecordedBranch } from "@/lib/services/commit-menu/branch-identity"

export type CommitMenuFileStatus = "created" | "modified" | "deleted"

export interface CommitMenuStatusEntry {
  path: string
  status: CommitMenuFileStatus
}

export interface CommitMenuStatusResult {
  needsInitialSnapshot?: boolean
  isRepo: boolean
  entries: CommitMenuStatusEntry[]
}

export interface CommitMenuCommitResult {
  commitId: number
  updatedChanges: number
}

interface CommitMenuRepositoryParams {
  repositoryPath: string
}

function requireRepositoryPath(repositoryPath: string): string {
  const trimmedPath = repositoryPath.trim()

  if (!trimmedPath) {
    throw new GitValidationError("Informe o caminho do repositorio")
  }

  return trimmedPath
}

function pushEntry(
  entries: CommitMenuStatusEntry[],
  seen: Set<string>,
  status: CommitMenuFileStatus,
  filePath: string
) {
  if (!filePath) {
    return
  }

  const key = `${status}:${filePath}`
  if (seen.has(key)) {
    return
  }

  seen.add(key)
  entries.push({ path: filePath, status })
}

function mapStatusResult(status: StatusResult): CommitMenuStatusEntry[] {
  const entries: CommitMenuStatusEntry[] = []
  const seen = new Set<string>()

  for (const file of status.files ?? []) {
    if ((status.conflicted ?? []).includes(file.path)) throw new GitValidationError("Resolva os conflitos Git antes de commitar")
    if (file.index === "R" || file.working_dir === "R") {
      if (file.from) pushEntry(entries, seen, "deleted", file.from)
      pushEntry(entries, seen, "created", file.path)
      continue
    }
    if ([file.index, file.working_dir].some((value) => value === "C" || value === "T")) {
      pushEntry(entries, seen, "modified", file.path)
      continue
    }
    if (file.index === "A") {
      pushEntry(entries, seen, "created", file.path)
      continue
    }

    if (file.index === "M") {
      pushEntry(entries, seen, "modified", file.path)
      continue
    }

    if (file.index === "D") {
      pushEntry(entries, seen, "deleted", file.path)
      continue
    }

    if (file.working_dir === "A" || file.working_dir === "?") {
      pushEntry(entries, seen, "created", file.path)
      continue
    }

    if (file.working_dir === "M") {
      pushEntry(entries, seen, "modified", file.path)
      continue
    }

    if (file.working_dir === "D") {
      pushEntry(entries, seen, "deleted", file.path)
    }
  }

  if (entries.length === 0) {
    for (const filePath of status.created ?? []) {
      pushEntry(entries, seen, "created", filePath)
    }

    for (const filePath of status.modified ?? []) {
      pushEntry(entries, seen, "modified", filePath)
    }

    for (const filePath of status.deleted ?? []) {
      pushEntry(entries, seen, "deleted", filePath)
    }
  }

  return entries
}

function resolveActiveBranchIds(branches: Array<{ id: number; base: number | null }>, selectedId: number) {
  const lookup = new Map<number, { id: number; base: number | null }>()
  for (const branch of branches) {
    lookup.set(branch.id, branch)
  }

  const activeIds = new Set<number>()
  let current = lookup.get(selectedId)

  while (current) {
    if (activeIds.has(current.id)) throw new GitValidationError("Ciclo nas bases das branches")
    activeIds.add(current.id)
    if (!current.base) {
      break
    }

    current = lookup.get(current.base)
  }

  return Array.from(activeIds)
}

async function ensureProjectAndCurrentBranch(repositoryPath: string) {
  const gitBranchName = await readGitBranchName(repositoryPath)
  const connection = await getPool().getConnection()
  let committed = false
  let tempPathToEnsure: string | null = null

  try {
    await connection.beginTransaction()

    let project = await findProjectByPath(repositoryPath, connection)
    if (!project) {
      project = await insertProject(repositoryPath, connection)
    }

    if (!project.tempPath) {
      tempPathToEnsure = resolveProjectTempPath(project.id)
      await setProjectTempPath(project.id, tempPathToEnsure, connection)
    }

    const branches = await listBranchesByProjectId(project.id, connection)
    let selectedBranch = resolveRecordedBranch(branches, gitBranchName)
    if (!selectedBranch) {
      selectedBranch = await insertBranch(
        {
          projectId: project.id,
          baseId: null,
          active: true,
          selected: true,
          name: gitBranchName,
        },
        connection
      )

      branches.push(selectedBranch)
    }

    const activeIds = resolveActiveBranchIds(branches, selectedBranch.id)
    await setBranchState(project.id, selectedBranch.id, activeIds, connection)

    await connection.commit()
    committed = true

    if (tempPathToEnsure) {
      await ensureProjectTempDirectories(tempPathToEnsure)
    }

    return {
      projectId: project.id,
      branchId: selectedBranch.id,
    }
  } catch (error) {
    if (!committed) {
      await connection.rollback()
    }
    throw error
  } finally {
    connection.release()
  }
}

export async function loadCommitMenuStatusController({
  repositoryPath,
}: CommitMenuRepositoryParams): Promise<BackendActionResult<CommitMenuStatusResult>> {
  return gitAction(async () => {
    const resolvedPath = requireRepositoryPath(repositoryPath)

    const isRepo = await checkIsGitRepository(resolvedPath)

    if (!isRepo) {
      return {
        isRepo: false,
        entries: [],
      }
    }

    const project = await findProjectByPath(resolvedPath)
    if (project) await withExternalSyncLock(project.id, async () => {})
    let needsInitialSnapshot = false
    if (project) {
      const connection = await getPool().getConnection()
      try { needsInitialSnapshot = await needsInitialGitSnapshot(connection, project.id, project.path) }
      finally { connection.release() }
    }
    const status = await readGitStatus(resolvedPath)

    return {
      isRepo: true,
      needsInitialSnapshot,
      entries: mapStatusResult(status),
    }
  })
}

export async function initCommitMenuRepositoryController({
  repositoryPath,
}: CommitMenuRepositoryParams): Promise<BackendActionResult<{ isRepo: boolean }>> {
  return gitAction(async () => {
    const resolvedPath = requireRepositoryPath(repositoryPath)

    const project = await findProjectByPath(resolvedPath)
    if (!project) throw new GitValidationError("Cadastre o projeto antes de inicializar o Git")
    await withExternalSyncLock(project.id, async (connection) => {
      await withGitRecordingLock(connection, project.id, project.path, async () => {
        await initGitRepository(resolvedPath)
        await ensureProjectAndCurrentBranch(resolvedPath)
        await ensureInitialGitSnapshot(connection, project.id, project.path)
      })
    })
    return { isRepo: true }
  })
}

export async function commitChangesController({
  repositoryPath,
  title,
  description,
}: CommitMenuRepositoryParams & { title: string; description?: string }): Promise<BackendActionResult<CommitMenuCommitResult>> {
  return gitAction(async () => {
    const resolvedPath = requireRepositoryPath(repositoryPath)
    const summary = title.trim()

    if (!summary) {
      throw new GitValidationError("Informe o titulo do commit")
    }

    const resolvedDescription = description?.trim() || null
    const project = await findProjectByPath(resolvedPath)
    if (!project) throw new GitValidationError("Projeto não encontrado")

    const isRepo = await checkIsGitRepository(resolvedPath)

    if (!isRepo) {
      throw new GitValidationError("Repositorio Git nao encontrado")
    }

    return withExternalSyncLock(project.id, async (connection) => {
      await assertExternalBundleReady(project.id, connection)
      await ensureProjectAndCurrentBranch(resolvedPath)
      return withGitRecordingLock(connection, project.id, project.path,
        () => recordGitOperation(connection, project.id, project.path, "commit", summary, resolvedDescription,
          undefined, () => assertExternalBundleReady(project.id, connection)))
    })
  })
}
