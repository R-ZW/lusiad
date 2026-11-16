// Server configuration only. Do not import this module into a client component.
// It intentionally has no Next dependencies so its isolation rules can be tested without a server.
import { createHash } from "node:crypto"
import { existsSync, lstatSync, readFileSync, realpathSync, readdirSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { loadOperationalConfig } from './operational-config.ts'

export interface TestManifest {
  version: 1
  runId: string
  labRoot: string
  projectsRoot: string
  tempRoot: string
  apiUrl: string
  frontendUrl: string
  schemaHash: string
  schemaColumns: Record<string, string[]>
  requestTimeoutMs: number
  database: { host: string; port: number; name: string; user: string; password: string; serverUuid: string; dataDirectory: string }
}

export interface RuntimeConfig {
  profile: "normal" | "test"
  apiUrl: string
  tempRoot: string
  requestTimeoutMs: number
  test: (TestManifest & { configHash: string; configPath: string }) | null
}

export function within(root: string, candidate: string, allowRoot = true): boolean {
  const part = relative(resolve(root), resolve(candidate))
  return (allowRoot || part !== "") && part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part)
}

function plain(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Lusiad test manifest")
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new Error("Incomplete Lusiad test manifest")
  return value
}

export function port(value: unknown): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 65535) throw new Error("Invalid Lusiad port")
  return number
}

function httpUrl(value: unknown, testMode: boolean): string {
  const url = new URL(text(value))
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Lusiad URL must be an HTTP(S) origin without credentials/path")
  }
  if (testMode && (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port)) {
    throw new Error("Test services must use explicit loopback ports")
  }
  return url.origin
}

/** Reject existing symlinks/junctions, including ancestors of a not-yet-created target. */
export function noLinks(root: string, candidate: string): void {
  if (!isAbsolute(candidate) || !within(root, candidate)) throw new Error("Test path leaves its owned root")
  const absolute = resolve(root)
  if (!existsSync(absolute) || realpathSync.native(absolute).toLowerCase() !== absolute.toLowerCase() || lstatSync(absolute).isSymbolicLink()) {
    throw new Error("Test root must exist without links/junctions")
  }
  let cursor = absolute
  for (const segment of relative(absolute, resolve(candidate)).split(sep).filter(Boolean)) {
    cursor = join(cursor, segment)
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error("Test path crosses a link/junction")
    // existsSync follows dangling links; lstat also detects those.
    try { if (lstatSync(cursor).isSymbolicLink()) throw new Error("Test path crosses a link/junction") }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  }
}

export function loadRuntimeConfig(env: Readonly<Record<string, string | undefined>> = process.env): RuntimeConfig {
  const profile = env.LUSIAD_ENV ?? "normal"
  if (profile !== "normal" && profile !== "test") throw new Error("LUSIAD_ENV must be normal or test")
  if (profile === "normal") {
    if (env.LUSIAD_TEST_CONFIG) throw new Error("Test manifest requires LUSIAD_ENV=test; refusing normal fallback")
    const operational = loadOperationalConfig(env)
    return {
      profile, test: null, apiUrl: operational.apiUrl,
      tempRoot: operational.tempRoot,
      requestTimeoutMs: operational.requestTimeoutMs,
    }
  }
  const configPath = text(env.LUSIAD_TEST_CONFIG)
  if (!isAbsolute(configPath)) throw new Error("LUSIAD_TEST_CONFIG must be absolute")
  const bytes = readFileSync(configPath)
  const raw = plain(JSON.parse(bytes.toString("utf8")))
  const db = plain(raw.database)
  if (raw.version !== 1 || !/^[a-f0-9]{32}$/.test(text(raw.runId))) throw new Error("Invalid test manifest version/runId")
  const runId = text(raw.runId)
  const labRoot = text(raw.labRoot), projectsRoot = text(raw.projectsRoot), tempRoot = text(raw.tempRoot)
  if (!isAbsolute(labRoot) || !isAbsolute(projectsRoot) || !isAbsolute(tempRoot) || basename(dirname(resolve(labRoot))) !== ".lab" || basename(resolve(labRoot)) !== runId ||
      resolve(configPath) !== join(resolve(labRoot), "environment.json") ||
      resolve(projectsRoot) !== join(resolve(labRoot), "projects") || resolve(tempRoot) !== join(resolve(labRoot), "temp")) {
    throw new Error("Test roots/configuration must belong to .lab/<runId>")
  }
  noLinks(labRoot, configPath)
  noLinks(labRoot, projectsRoot)
  noLinks(labRoot, tempRoot)
  if (!lstatSync(projectsRoot).isDirectory() || !lstatSync(tempRoot).isDirectory()) throw new Error("Missing test roots")
  const configHash = createHash("sha256").update(bytes).digest("hex")
  noLinks(labRoot, join(labRoot, ".lusiad-test-owner.json"))
  const owner = plain(JSON.parse(readFileSync(join(labRoot, ".lusiad-test-owner.json"), "utf8")))
  if (owner.runId !== runId || owner.configHash !== configHash) throw new Error("Test ownership marker does not match configuration")
  const apiUrl = httpUrl(raw.apiUrl, true), frontendUrl = httpUrl(raw.frontendUrl, true)
  const dbPort = port(db.port)
  if (apiUrl === frontendUrl || [8765, 3000, 3306].includes(Number(new URL(apiUrl).port)) ||
      [8765, 3000, 3306].includes(Number(new URL(frontendUrl).port)) || dbPort === 3306 ||
      new Set([Number(new URL(apiUrl).port), Number(new URL(frontendUrl).port), dbPort]).size !== 3 ||
      db.host !== "127.0.0.1" || db.name !== `lusiad_e2e_${runId}` || db.user !== "lusiad_e2e") {
    throw new Error("Test database/ports are not isolated")
  }
  const schemaHash = text(raw.schemaHash)
  const schemaColumns = plain(raw.schemaColumns)
  for (const [table, columns] of Object.entries(schemaColumns)) {
    if (!/^[a-z][a-z0-9_]*$/.test(table) || !Array.isArray(columns) || !columns.length || columns.some((column: unknown) => typeof column !== 'string' || !/^[a-z][a-z0-9_]*$/.test(column))) {
      throw new Error("Invalid test schema columns")
    }
  }
  if (Object.keys(schemaColumns).length !== 10) throw new Error("Incomplete test schema")
  if (!/^[a-f0-9]{64}$/.test(schemaHash)) throw new Error("Invalid test schema fingerprint")
  const timeout = Number(raw.requestTimeoutMs)
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) throw new Error("Invalid test timeout")
  const test: RuntimeConfig["test"] = {
    version: 1, runId, labRoot: resolve(labRoot), projectsRoot: resolve(projectsRoot), tempRoot: resolve(tempRoot),
    apiUrl, frontendUrl, schemaHash, schemaColumns: schemaColumns as Record<string, string[]>, requestTimeoutMs: timeout, configHash, configPath,
    database: { host: "127.0.0.1", port: dbPort, name: text(db.name), user: text(db.user), password: text(db.password),
      serverUuid: text(db.serverUuid), dataDirectory: text(db.dataDirectory) },
  }
  return { profile, apiUrl, tempRoot: test.tempRoot, requestTimeoutMs: timeout, test }
}

export function assertTestPath(path: string, area: "projects" | "temp" | "either" = "either", allowRoot = true): void {
  const test = loadRuntimeConfig().test
  if (!test) return
  const roots = area === "projects" ? [test.projectsRoot] : area === "temp" ? [test.tempRoot] : [test.projectsRoot, test.tempRoot]
  const root = roots.find((value) => within(value, path, allowRoot))
  if (!root) throw new Error("Refusing access outside the disposable test roots")
  noLinks(root, path)
}

export function assertTestTree(path: string): void {
  assertTestPath(path)
  if (!loadRuntimeConfig().test || !existsSync(path)) return
  if (lstatSync(path).isDirectory()) {
    for (const entry of readdirSync(path, { withFileTypes: true })) assertTestTree(join(path, entry.name))
  }
}

export function publicTestContext(config: RuntimeConfig = loadRuntimeConfig()) {
  const test = config.test
  if (!test) return null
  return { protocol: 1, profile: "test", runId: test.runId, configHash: test.configHash, schemaHash: test.schemaHash,
    labRoot: test.labRoot, projectsRoot: test.projectsRoot, tempRoot: test.tempRoot, apiUrl: test.apiUrl,
    frontendUrl: test.frontendUrl, database: { host: test.database.host, port: test.database.port,
      name: test.database.name, serverUuid: test.database.serverUuid } }
}
