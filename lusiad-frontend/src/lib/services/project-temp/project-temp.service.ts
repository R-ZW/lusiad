import "server-only"
import { containedPath } from "../contained-paths"

import { mkdir } from "node:fs/promises"
import { join } from "path"
import { assertTestPath, loadRuntimeConfig } from "../../config/runtime-config"

const TEMP_SUBDIRECTORIES = ["archive", "working-copy", "working-copy-prev"] as const

export function resolveProjectTempPath(projectId: number): string {
  return join(/* turbopackIgnore: true */ loadRuntimeConfig().tempRoot, String(projectId))
}

export async function ensureProjectTempDirectories(tempPath: string): Promise<void> {
  const resolvedTempPath = tempPath.trim()
  assertTestPath(resolvedTempPath, "temp", false)

  if (!resolvedTempPath) {
    throw new Error("Caminho temporario do projeto invalido")
  }

  await mkdir(resolvedTempPath, { recursive: true })
  await Promise.all(TEMP_SUBDIRECTORIES.map((name) => mkdir(containedPath(resolvedTempPath, name), { recursive: true })))
}

export async function createProjectTempDirectories(projectId: number): Promise<string> {
  const tempPath = resolveProjectTempPath(projectId)
  await ensureProjectTempDirectories(tempPath)
  return tempPath
}
