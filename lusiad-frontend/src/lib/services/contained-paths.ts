import { BackendApiError } from "./backend-response.ts"
// Node only. Keep lexical checks usable for historical paths whose files no longer exist.
import { lstatSync, realpathSync, readdirSync } from "node:fs"
import { posix, win32, resolve, relative, join } from "node:path"

function pathError(detail: string): BackendApiError {
  return new BackendApiError("Path", detail, "path_not_authorized", 400)
}

function clean(value: string): string {
  if (typeof value !== "string" || /[\0\r\n]/.test(value)) throw pathError("Caminho inválido")
  return value.replaceAll("\\", "/")
}

export function assertPathName(value: string): void {
  const name = clean(value)
  if (!name.trim() || name === "." || name === ".." || /[/:*?"<>|\x00-\x1f]/.test(name)
    || /[. ]$/.test(name) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(name)) {
    throw pathError("Componente de caminho inválido")
  }
}

function validate(value: string): string {
  const text = clean(value)
  if (/^\/\/[?.]\//.test(text) || /^[a-z]:(?!\/)/i.test(text)) throw pathError("Caminho de dispositivo ou unidade relativa não permitido")
  for (const part of text.replace(/^[a-z]:/i, "").split("/")) {
    if (part && part !== ".") assertPathName(part)
  }
  return text
}

/** Segment-based Windows case/separator handling, never a raw string prefix. */
export function relativeContained(root: string, value: string, allowRoot = false): string {
  const base = validate(root), input = validate(value)
  const path = /^[a-z]:\//i.test(base) || base.startsWith("//") ? win32 : posix
  if (!path.isAbsolute(base)) throw pathError("A raiz autorizada deve ser absoluta")
  if (path === posix && /^[a-z]:/i.test(input)) throw pathError("Unidade Windows fora da raiz autorizada")
  if (path === win32 && input.startsWith("/") && !input.startsWith("//")) throw pathError("Caminho relativo à unidade não permitido")
  const target = path.resolve(base, input)
  const rel = path.relative(base, target).replaceAll("\\", "/")
  if (rel === ".." || rel.startsWith("../") || path.isAbsolute(rel)) throw pathError("Caminho fora da raiz autorizada")
  if (!allowRoot && !rel) throw pathError("O caminho não pode ser a raiz")
  return rel
}

function optionalStat(path: string) {
  try { return lstatSync(path) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error }
}

function physical(path: string): string {
  let ancestor = resolve(path)
  while (!optionalStat(ancestor)) {
    const parent = resolve(ancestor, "..")
    if (parent === ancestor) throw pathError("Raiz sem ancestral existente")
    ancestor = parent
  }
  return resolve(realpathSync.native(ancestor), relative(ancestor, resolve(path)))
}

/** Registered roots may be aliases. Descendant symlinks/junctions, including dangling ones, may not. */
export function containedPath(root: string, value: string, allowRoot = false): string {
  const rel = relativeContained(root, value, allowRoot)
  const base = resolve(root), canonical = physical(base)
  let current = base
  for (const segment of rel.split("/").filter(Boolean)) {
    current = join(current, segment)
    const stat = optionalStat(current)
    const same = (left: string, right: string) => process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right
    if (stat && (stat.isSymbolicLink() || !(stat.isDirectory() || stat.isFile())
      || !same(realpathSync.native(current), resolve(canonical, relative(base, current))))) {
      throw pathError("O caminho atravessa um link simbólico ou junction")
    }
  }
  return resolve(base, rel)
}

export function assertSeparateRoots(project: string, temporary: string): void {
  relativeContained(project, "", true); relativeContained(temporary, "", true)
  const live = physical(project), temp = physical(temporary)
  const inside = (root: string, target: string) => {
    try { relativeContained(root, target, true); return true } catch { return false }
  }
  if (inside(live, temp) || inside(temp, live)) throw pathError("Projeto e snapshots precisam de raízes separadas")
}

export function assertContainedTree(root: string): void {
  function walk(folder: string): void {
    if (!optionalStat(folder)) return
    for (const entry of readdirSync(folder)) {
      const full = containedPath(root, join(folder, entry))
      if (lstatSync(full).isDirectory()) walk(full)
    }
  }
  walk(root)
}

export function normalizeHistoricalPaths(projectRoot: string, value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const result = { ...value } as Record<string, unknown>
  for (const field of ["path", "sourcePath", "destPath"]) {
    if (typeof result[field] === "string") result[field] = relativeContained(projectRoot, result[field], true)
  }
  return result
}
