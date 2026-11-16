import { assertPathName, relativeContained } from "../contained-paths.ts"
import { BackendApiError } from "../backend-response.ts"
import { canonicalText, textHash } from "../commit-menu/git-operation.ts"
import { readResourceStates, resourceBytes } from '../undo/resource-image.ts'

export interface BaselineEvent {
  id: number
  change_type: string
  scope: string
  req_body: unknown
}
export interface BaselineBundleFile {
  change_id: number; path: string; before_kind: string | null; before_content: Buffer | null
}

/** Reconstruct a legacy root's preimage in memory, never a new Git/SQL version.
 * Unknown deleted/legacy content remains unknown until an earlier exact preimage
 * or creation resolves it. Missing evidence is an error, never an empty file.
 */
export function reconstructInitialBaseline(root: string, finalFiles: Map<string, Buffer>, events: BaselineEvent[], bundles: BaselineBundleFile[] = []): { files: Map<string, Buffer>; directories: Set<string> } {
  const files = new Map(finalFiles), unknown = new Set<string>(), directories = new Set<string>()
  const parents = (name: string) => {
    const parts = name.split("/")
    for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join("/"))
  }
  for (const name of files.keys()) parents(name)
  const path = (value: unknown, allowRoot = false) => {
    if (typeof value !== "string") throw new Error("Missing historical path")
    const name = relativeContained(root, value, allowRoot)
    if (name.split("/").some((part) => part.toLowerCase() === ".git")) throw new Error("Git metadata is not historical project content")
    return name
  }
  const fold = (name: string) => /^[a-z]:[\\/]/i.test(root) || root.startsWith("\\\\") || root.startsWith("//") ? name.toLowerCase() : name
  const same = (left: string, right: string) => fold(left) === fold(right)
  const within = (name: string, parent: string) => same(name, parent) || fold(name).startsWith(fold(parent) + "/")
  const remove = (name: string) => {
    for (const key of files.keys()) if (within(key, name)) files.delete(key)
    for (const key of unknown) if (within(key, name)) unknown.delete(key)
    for (const key of directories) if (within(key, name)) directories.delete(key)
  }
  const relocate = (from: string, to: string) => {
    if (from === to) return
    if ([...files.keys(), ...unknown].some((key) => within(key, to) && !within(key, from))) throw new Error("Historical rename collision")
    for (const key of [...directories]) if (within(key, from)) { directories.delete(key); directories.add(to + key.slice(from.length)) }
    parents(to)
    for (const [key, content] of [...files]) if (within(key, from)) { files.delete(key); files.set(to + key.slice(from.length), content) }
    for (const key of [...unknown]) if (within(key, from)) { unknown.delete(key); unknown.add(to + key.slice(from.length)) }
  }
  for (const event of [...events].sort((a, b) => b.id - a.id)) {
    try {
      const body = typeof event.req_body === "string" ? JSON.parse(event.req_body) : event.req_body
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid historical body")
      const images = readResourceStates(body)
      if (images) {
        for (const [name, entry] of Object.entries(images.after.entries)) {
          if (entry.kind !== 'file') continue
          const current = files.get(path(name)), wanted = resourceBytes(entry)
          if (!current && ![...unknown].some(key => same(key, path(name)))) throw new Error('Historical resource postimage is missing from commit')
          if (current && !current.equals(wanted) && canonicalText(current.toString('utf8')) !== canonicalText(wanted.toString('utf8')))
            throw new Error('Historical resource postimage differs from commit')
        }
        for (const root of images.before.roots) remove(path(root))
        for (const [name, entry] of Object.entries(images.before.entries)) {
          if (entry.kind === 'directory') directories.add(path(name))
          else files.set(path(name), resourceBytes(entry))
          parents(path(name))
        }
      } else if (event.scope === "file") {
        if (!["create", "update", "delete", "move"].includes(event.change_type)) throw new Error("Unsupported historical edit")
        const name = path(body.path)
        if (body.recordVersion !== 2) { remove(name); unknown.add(name); continue }
        if (typeof body.beforeText !== "string" || typeof body.afterText !== "string"
          || textHash(body.beforeText) !== body.beforeHash || textHash(body.afterText) !== body.afterHash) throw new Error("Invalid historical preimage hashes")
        const key = [...files.keys()].find((key) => same(key, name)), current = key === undefined ? undefined : files.get(key)
        if (![...unknown].some((key) => same(key, name)) && (!current || canonicalText(current.toString("utf8")) !== body.afterText)) throw new Error("Historical postimage differs from commit")
        if (key !== undefined) files.delete(key)
        files.set(name, Buffer.from(body.beforeText)); parents(name)
        for (const key of unknown) if (same(key, name)) unknown.delete(key)
      } else if (event.change_type === "external_bundle") {
        const rows = bundles.filter((row) => row.change_id === event.id)
        if (!rows.length) throw new Error("External bundle preimages missing")
        // Remove new paths before restoring previous bytes (including directory/file replacements).
        for (const row of rows) remove(path(row.path))
        for (const row of rows) {
          if (row.before_kind === "file") {
            if (row.before_content === null) throw new Error("External file preimage missing")
            files.set(path(row.path), row.before_content); parents(path(row.path))
          } else if (row.before_kind === "directory") { directories.add(path(row.path)); parents(path(row.path)) }
          else if (row.before_kind !== null) throw new Error("Unsupported external preimage")
        }
      } else if (!/^(file|dir)_(create|delete|rename|move)$/.test(event.change_type)) throw new Error("Unsupported historical operation")
      else if (event.change_type.endsWith("_create")) {
        assertPathName(body.name)
        const parent = path(body.path, true)
        const created = (parent ? parent + "/" : "") + body.name
        parents(created); remove(created)
      } else if (event.change_type.endsWith("_delete")) {
        const name = path(body.path); remove(name); parents(name)
        if (event.change_type === "dir_delete" && [undefined, false, "false"].includes(body.recursive)) directories.add(name)
        else unknown.add(name)
      } else if (event.change_type.endsWith("_rename")) {
        const original = path(body.path), name = body.newName ?? body.name
        assertPathName(name)
        const parent = original.includes("/") ? original.slice(0, original.lastIndexOf("/") + 1) : ""
        relocate(parent + name, original)
        if (event.change_type === "dir_rename") directories.add(original)
      } else if (event.change_type.endsWith("_move")) {
        const original = path(body.sourcePath), parent = path(body.destPath, true)
        relocate((parent ? parent + "/" : "") + original.split("/").at(-1), original)
        if (event.change_type === "dir_move") directories.add(original)
      } else throw new Error("Unsupported historical operation")
    } catch (cause) {
      throw new BackendApiError("Snapshot", `Cannot reconstruct initial state at change #${event.id}: ${cause instanceof Error ? cause.message : "invalid record"}. Existing history was preserved.`, "initial_baseline_unavailable", 422)
    }
  }
  if (unknown.size) throw new BackendApiError("Snapshot", "Initial preimage unavailable in legacy records: " + [...unknown].join(", ") + ". Existing history was preserved.", "initial_baseline_unavailable", 422)
  return { files, directories }
}
