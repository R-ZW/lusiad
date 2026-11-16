import "server-only"
import { stat } from "node:fs/promises"
import { assertTestPath } from "@/lib/config/runtime-config"
import { readDirectoryTree } from "./directory-tree"
import { BackendApiError } from "../backend-response"

export async function loadFileTree(projectPath: string) {
  assertTestPath(projectPath)
  try { return await readDirectoryTree(projectPath) }
  catch (error) {
    if (error instanceof BackendApiError) throw error
    console.warn("Could not read project directory", projectPath, error)
    throw new BackendApiError("File explorer", "Project directory could not be read", "file_tree_unavailable", 503)
  }
}

/** Legacy snapshot directories can be absent; a failed project enumeration cannot. */
export async function loadOptionalSnapshotTree(snapshotPath: string) {
  assertTestPath(snapshotPath)
  try { await stat(snapshotPath) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error }
  return readDirectoryTree(snapshotPath)
}
