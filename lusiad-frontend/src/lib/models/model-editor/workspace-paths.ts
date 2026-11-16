import type { FileNode } from "../../types.ts"

export interface FileMutation { from: string; to?: string }
export function parentPath(path: string): string {
  const normalized = path.replaceAll("\\", "/")
  const index = normalized.lastIndexOf("/")
  if (index < 0) return ""
  if (index === 0 || (index === 2 && /^[a-z]:/i.test(normalized))) return normalized.slice(0, index + 1)
  return normalized.slice(0, index)
}
export function pathKey(path: string) {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "")
  return /^(?:[a-z]:\/|\/\/)/i.test(normalized) ? normalized.toLowerCase() : normalized
}
/** Keep the existing tab's identity when a request uses an equivalent path spelling. */
export function openPath(paths: readonly string[], requested: string): string {
  return paths.find(path => pathKey(path) === pathKey(requested)) ?? requested
}
export function remapPath(path: string, mutation: FileMutation): string | null {
  const source = pathKey(mutation.from), candidate = pathKey(path)
  if (candidate !== source && !candidate.startsWith(source + "/")) return path
  return mutation.to ? mutation.to.replaceAll("\\", "/").replace(/\/+$/, "") + path.replaceAll("\\", "/").slice(source.length) : null
}
export function treeFiles(nodes: FileNode[]): Set<string> {
  return new Set(nodes.flatMap(node => node.type === "file" && node.path ? [pathKey(node.path)] : [...treeFiles(node.children ?? [])]))
}
export function isSnapshotPath(path: string, temporaryRoot: string, snapshotId?: string): boolean {
  if (!temporaryRoot) return false
  const root = pathKey(temporaryRoot.replace(/[\\/]+$/, "") + "/comparisons" + (snapshotId ? "/" + snapshotId : ""))
  return pathKey(path).startsWith(root + "/")
}
