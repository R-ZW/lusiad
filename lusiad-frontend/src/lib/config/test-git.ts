import { relativeContained } from "../services/contained-paths.ts"
import { execFile } from "node:child_process"
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs"
import { delimiter, join, resolve } from "node:path"
import { promisify } from "node:util"
import simpleGit from "simple-git"
import { assertTestPath, assertTestTree, loadRuntimeConfig, noLinks } from "./runtime-config.ts"

const execute = promisify(execFile)

/** Only the owned test profile may supply its fenced config/hooks paths to simple-git. */
export function createConfiguredGitClient(root: string) {
  if (loadRuntimeConfig().test) assertTestPath(root, "projects", false)
  const env = testGitEnvironment() // validates ownership and physical configuration paths first
  return simpleGit({ baseDir: root, ...(loadRuntimeConfig().test ? {
    unsafe: { allowUnsafeConfigPaths: true, allowUnsafeConfigEnvCount: true, allowUnsafeHooksPath: true },
  } : {}) }).env(env)
}

export function testGitEnvironment(): NodeJS.ProcessEnv {
  const test = loadRuntimeConfig().test
  const env = { ...process.env }
  // Local server operations do not use interactive pagers or credential prompts.
  // Editors may inject askpass commands; simple-git rejects their presence even
  // for status/init. Filter the child copy instead of enabling unsafe execution.
  for (const key of Object.keys(env)) {
    if (/^(PAGER|GIT_PAGER|GIT_ASKPASS|SSH_ASKPASS)$/i.test(key)) delete env[key]
  }
  env.GIT_TERMINAL_PROMPT = "0"
  // status/diff must not rewrite the shared index merely to refresh stat caches.
  env.GIT_OPTIONAL_LOCKS = "0"
  // IDE launch environments can point Git at a different worktree/index. Each
  // operation resolves its own authorized root and supplies a private index explicitly.
  for (const key of Object.keys(env)) {
    if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES)$/i.test(key)) delete env[key]
  }
  if (!test) return env
  for (const key of Object.keys(env)) {
    if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG.*|PAGER)$/.test(key)) delete env[key]
  }
  const config = join(test.labRoot, "gitconfig"), hooks = join(test.labRoot, "empty-hooks")
  noLinks(test.labRoot, config); noLinks(test.labRoot, hooks)
  if (!existsSync(config) || !existsSync(hooks)) throw new Error("Missing owned test Git configuration")
  const allowed: Record<string, string> = { "user.name": "Lusiad E2E", "user.email": "e2e@lusiad.invalid", "core.autocrlf": "false" }
  const seen = new Set<string>()
  let section = ""
  for (const raw of readFileSync(config, "utf8").split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#") || line.startsWith(";")) continue
    if (/^\[(user|core)\]$/.test(line)) { section = line.slice(1, -1); continue }
    const match = /^([a-z]+)\s*=\s*(.*)$/.exec(line)
    const key = `${section}.${match?.[1]}`
    if (!match || seen.has(key) || allowed[key] !== match[2]) throw new Error("Untrusted test Git configuration")
    seen.add(key)
  }
  if (!seen.has("user.name") || !seen.has("user.email") || readdirSync(hooks).length !== 0) {
    throw new Error("Test Git identity/hooks are not isolated")
  }
  return { ...env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0",
    GIT_CEILING_DIRECTORIES: [test.projectsRoot, test.tempRoot].join(delimiter),
    GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: hooks }
}

/** .lab lives in a Git repository itself. Never discover/use its ancestor index. */
export async function assertTestGitRepository(root: string): Promise<void> {
  if (!loadRuntimeConfig().test) return
  assertTestPath(root, "projects", false)
  assertTestTree(root)
  const git = join(root, ".git")
  if (!existsSync(git)) return // init is allowed; discovery is fenced by testGitEnvironment.
  if (!lstatSync(git).isDirectory() || existsSync(join(git, "commondir")) || existsSync(join(git, "objects/info/alternates"))) {
    throw new Error("Test projects must use standalone repositories; external Git storage refused")
  }
  const { stdout } = await execute("git", ["-C", root, "rev-parse", "--show-toplevel"], {
    env: testGitEnvironment(), windowsHide: true, encoding: "utf8", timeout: 5000,
  })
  const actual = resolve(stdout.trim()), expected = resolve(root)
  if (process.platform === "win32" ? actual.toLowerCase() !== expected.toLowerCase() : actual !== expected) {
    throw new Error("Test repository worktree leaves its owned project")
  }
}

/** Always reject links/submodules/unsafe paths before tar materializes a historical tree. */
export async function assertSafeGitArchive(root: string, ref: string): Promise<void> {
  await assertTestGitRepository(root)
  const { stdout } = await execute("git", ["-C", root, "ls-tree", "-r", "-z", ref], {
    env: testGitEnvironment(), windowsHide: true, encoding: "utf8", timeout: 10000, maxBuffer: 16 * 1024 * 1024,
  })
  validateGitArchivePaths(root, stdout)
}

export function validateGitArchivePaths(root: string, entries: string): void {
  for (const entry of entries.split("\0").filter(Boolean)) {
    const match = /^(100644|100755) blob [a-f0-9]+\t(.+)$/.exec(entry)
    if (!match || /^[a-z]:|^[\\/]/i.test(match[2])) throw new Error("Archive contains links/submodules or unsafe paths")
    relativeContained(root, match[2])
  }
}
