import "server-only"

import { access, readdir, stat } from "fs/promises"
import { join } from "path"

const DEFAULT_MODEL_FILENAME = "Test.java"
const MAX_SEARCH_DEPTH = 4

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath)
    return true
  } catch {
    return false
  }
}

async function findFirstJavaFile(rootPath: string): Promise<string | null> {
  const queue: Array<{ directory: string; depth: number }> = [{ directory: rootPath, depth: 0 }]

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current) {
      break
    }

    let entries

    try {
      entries = await readdir(current.directory, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const entryPath = join(current.directory, entry.name)

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".java")) {
        return entryPath
      }

      if (entry.isDirectory() && current.depth < MAX_SEARCH_DEPTH) {
        queue.push({ directory: entryPath, depth: current.depth + 1 })
      }
    }
  }

  return null
}

export async function resolveInitialModelPath(projectPath: string): Promise<string | null> {
  const trimmedProjectPath = projectPath.trim()

  if (!trimmedProjectPath) {
    return null
  }

  try {
    const projectInfo = await stat(trimmedProjectPath)

    if (projectInfo.isFile()) {
      return trimmedProjectPath
    }
  } catch {
    return null
  }

  const preferredFilePath = join(trimmedProjectPath, DEFAULT_MODEL_FILENAME)

  if (await pathExists(preferredFilePath)) {
    return preferredFilePath
  }

  const firstJavaFile = await findFirstJavaFile(trimmedProjectPath)

  return firstJavaFile ?? preferredFilePath
}