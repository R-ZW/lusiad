import { readdir } from "node:fs/promises"
import { extname, join } from "node:path"
import { containedPath } from "../contained-paths.ts"
import type { FileNode } from "../../types.ts"

const IGNORED = new Set(["node_modules", "build", "dist"])
/** Failed enumeration is an error, never evidence that the open files were deleted. */
export async function readDirectoryTree(root: string, current = root): Promise<FileNode[]> {
  const nodes: FileNode[] = []
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || IGNORED.has(entry.name) || entry.isSymbolicLink()) continue
    const path = containedPath(root, join(current, entry.name))
    if (entry.isDirectory()) nodes.push({ id: path, name: entry.name, path, type: "folder", children: await readDirectoryTree(root, path) })
    else if (entry.isFile()) nodes.push({ id: path, name: entry.name, path, type: "file", extension: extname(entry.name).slice(1).toLowerCase() })
  }
  return nodes.sort((a,b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1)
}
