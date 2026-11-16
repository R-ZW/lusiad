import { containedPath } from "@/lib/services/contained-paths"
import { readdir } from "node:fs/promises"
import { extname, join } from "node:path"

import type { JavaModel } from "@/lib/types"
import type { ChangeDiffSnapshot } from "@/lib/services/change-diff/change-diff.service"
import { loadChangeDiffSnapshotFeature } from "@/lib/services/change-diff/change-diff.service"
import { parseSnapshotFile } from "@/lib/services/restore/snapshot-reader"

const IGNORED_DIRECTORIES = new Set([".git", ".idea", "node_modules", ".next", "build", "dist", "out"])

interface LoadChangeDiffFeatureParams {
  projectId: number
  projectTempPath: string
  changeId: string
  changeType?: string | null
  reqBody: unknown
}

async function findJavaFiles(root: string, current = root, files: string[] = []): Promise<string[]> {
  const entries = (await readdir(current, { withFileTypes: true, encoding: "utf8" })).sort((a,b)=>a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        await findJavaFiles(root, containedPath(root, join(current, entry.name)), files)
      }
      continue
    }

    if (entry.isFile() && extname(entry.name).toLowerCase() === ".java") {
      files.push(containedPath(root, join(current, entry.name)))
    }
  }

  return files
}

async function loadProjectModels(projectId: number, projectTempPath: string, snapshotFolder: string): Promise<JavaModel[]> {
  const root = containedPath(projectTempPath, snapshotFolder)
  const files = await findJavaFiles(root)
  const models: JavaModel[] = []
  // Bound PSI work without silently truncating the project to an arbitrary file count.
  for (let offset = 0; offset < files.length; offset += 4) {
    const batch = await Promise.all(files.slice(offset, offset + 4).map(path => parseSnapshotFile(projectId, projectTempPath, path)))
    models.push(...batch)
  }
  return models
}

export async function loadChangeDiffFeature(params: LoadChangeDiffFeatureParams): Promise<ChangeDiffSnapshot> {
  const snapshot = await loadChangeDiffSnapshotFeature({
    projectId: params.projectId,
    projectTempPath: params.projectTempPath,
    changeId: params.changeId,
    changeType: params.changeType,
    reqBody: params.reqBody,
  })

  const [beforeProjectModels, afterProjectModels] = await Promise.all([
    loadProjectModels(params.projectId, params.projectTempPath, "working-copy-prev"),
    loadProjectModels(params.projectId, params.projectTempPath, "working-copy"),
  ])

  return { ...snapshot, beforeProjectModels, afterProjectModels }
}
