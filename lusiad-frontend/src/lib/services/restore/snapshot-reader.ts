import "server-only"
import { readFile, readdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { basename, join } from "node:path"
import { containedPath, relativeContained } from "../contained-paths"
import { postBackendJson } from "../backend-client"
import { BackendApiError, requirePsiModel } from "../backend-response"
import { backendUrl } from "@/lib/config/backend"
import { normalizePsiSource } from "../model-comparison/psi-source"
import { readReadyPreview } from "./preview-snapshot"
import type { FileNode, JavaModel, PsiNode } from "@/lib/types"

/** Strict read: a failed enumeration never becomes an empty/partially successful explorer. */
export async function readSnapshotTree(root: string, folder: string): Promise<FileNode[]> {
  async function walk(current: string): Promise<FileNode[]> {
    const nodes: FileNode[] = []
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("Snapshot contains link")
      const path = containedPath(root, join(current, entry.name))
      if (entry.isDirectory()) nodes.push({ id: path, path, name: entry.name, type: "folder", children: await walk(path) })
      else if (entry.isFile()) nodes.push({ id: path, path, name: entry.name, type: "file", extension: entry.name.split(".").at(-1) })
      else throw new Error("Snapshot contains special file")
    }
    return nodes.sort((a,b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1)
  }
  return walk(containedPath(root, folder))
}
function text(node: PsiNode): string { return node.children?.length ? node.children.map(text).join("") : node.text ?? "" }
export async function parseSnapshotFile(projectId: number, root: string, path: string): Promise<JavaModel> {
  const source = normalizePsiSource(await readFile(containedPath(root, path), "utf8"))
  const model = await postBackendJson(backendUrl("/psi/parse"), { projectId, fileName: basename(path), content: source }, "Falha ao interpretar prévia", requirePsiModel)
  if (text(model.tree) !== source) throw new BackendApiError("Snapshot", "PSI source differs from snapshot", "invalid_response", 200)
  return { ...model, file: containedPath(root, path), revision: createHash("sha256").update(source).digest("hex") }
}
/** Historical reads never recover pending edits or refresh live IDE Documents/VFS. */
export async function readHistoricalModel(projectId: number, temp: string, path: string): Promise<JavaModel> {
  const relative = relativeContained(temp, path)
  const match = /^comparisons\/(compare-[a-f0-9-]{36})\/(working-copy|working-copy-prev)\/(.+)$/.exec(relative)
  if (!match) throw new Error("Not an isolated historical snapshot")
  await readReadyPreview(temp, match[1], projectId)
  return parseSnapshotFile(projectId, temp, relative)
}
