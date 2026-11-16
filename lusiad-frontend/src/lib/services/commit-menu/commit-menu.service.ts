import { assertTestGitRepository, createConfiguredGitClient } from "@/lib/config/test-git"
import { assertTestTree, loadRuntimeConfig } from "@/lib/config/runtime-config"
import { getPool } from "@/lib/repositories/database"
import "server-only"

import { access } from "fs/promises"
import type { SimpleGit, StatusResult } from "simple-git"
import { readRepositoryBranch } from "./branch-identity"

function getGitClient(repositoryPath: string): SimpleGit {
  return createConfiguredGitClient(repositoryPath)
}

async function ensureRepositoryPath(repositoryPath: string): Promise<void> {
  await assertTestGitRepository(repositoryPath)
  assertTestTree(repositoryPath)
  if (loadRuntimeConfig().test) await getPool().query("SELECT 1")
  await access(repositoryPath)
}

export async function checkIsGitRepository(repositoryPath: string): Promise<boolean> {
  await ensureRepositoryPath(repositoryPath)
  return getGitClient(repositoryPath).checkIsRepo()
}

export async function initGitRepository(repositoryPath: string): Promise<void> {
  await ensureRepositoryPath(repositoryPath)
  await getGitClient(repositoryPath).init()
}

export async function readGitBranchName(repositoryPath: string): Promise<string> {
  await ensureRepositoryPath(repositoryPath)
  return readRepositoryBranch(getGitClient(repositoryPath))
}

export async function readGitStatus(repositoryPath: string): Promise<StatusResult> {
  await ensureRepositoryPath(repositoryPath)
  return getGitClient(repositoryPath).status()
}
