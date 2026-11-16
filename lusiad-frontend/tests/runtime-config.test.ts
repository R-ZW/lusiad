import assert from "node:assert/strict"
import { test } from "node:test"
import { createHash, randomUUID } from "node:crypto"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadRuntimeConfig, noLinks, within } from "../src/lib/config/runtime-config.ts"
import { assertSafeGitArchive, assertTestGitRepository, createConfiguredGitClient, testGitEnvironment } from "../src/lib/config/test-git.ts"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

function fixture() {
  const parent = mkdtempSync(join(tmpdir(), "lusiad-config-"))
  const runId = randomUUID().replaceAll("-", "")
  const labRoot = join(parent, ".lab", runId)
  mkdirSync(join(labRoot, "projects"), { recursive: true }); mkdirSync(join(labRoot, "temp"))
  mkdirSync(join(labRoot, "empty-hooks"))
  writeFileSync(join(labRoot, "gitconfig"), "[user]\nname = Lusiad E2E\nemail = e2e@lusiad.invalid\n")
  const file = join(labRoot, "environment.json")
  const manifest = { schemaColumns: Object.fromEntries(Array.from({length:10},(_,i)=>["table_"+String.fromCharCode(97+i),["id"]])), version: 1, runId, labRoot, projectsRoot: join(labRoot, "projects"), tempRoot: join(labRoot, "temp"),
    apiUrl: "http://127.0.0.1:18765", frontendUrl: "http://127.0.0.1:13000", requestTimeoutMs: 30000, schemaHash: "a".repeat(64),
    database: { host: "127.0.0.1", port: 13307, name: `lusiad_e2e_${runId}`, user: "lusiad_e2e", password: randomUUID(), serverUuid: randomUUID(), dataDirectory: join(labRoot, "mysql/data") } }
  function save() {
    const json = JSON.stringify(manifest)
    writeFileSync(file, json)
    writeFileSync(join(labRoot, ".lusiad-test-owner.json"), JSON.stringify({ runId, configHash: createHash("sha256").update(json).digest("hex") }))
  }
  save()
  return { parent, manifest, file, save, dispose: () => rmSync(parent, { recursive: true, force: true }) }
}

test("normal defaults remain available; test intent never falls back to normal", () => {
  const f = fixture(), env = { LUSIAD_CONFIG_FILE: join(f.parent, 'normal.json') }
  try {
    assert.equal(loadRuntimeConfig(env).apiUrl, "http://127.0.0.1:8765")
    assert.equal(loadRuntimeConfig({ ...env, LUSIAD_API_URL: "http://127.0.0.1:19000" }).apiUrl, "http://127.0.0.1:19000")
    assert.throws(() => loadRuntimeConfig({ ...env, LUSIAD_ENV: "staging" }))
    assert.throws(() => loadRuntimeConfig({ ...env, LUSIAD_TEST_CONFIG: "missing.json" }))
    assert.throws(() => loadRuntimeConfig({ ...env, LUSIAD_ENV: "test" }))
  } finally { f.dispose() }
})

test("test configuration is owned and overrides unrelated SQL/API/temp environment settings", () => {
  const f = fixture()
  try {
    const config = loadRuntimeConfig({ LUSIAD_ENV: "test", LUSIAD_TEST_CONFIG: f.file,
      LUSIAD_API_URL: "http://localhost:8765", LUSIAD_TEMP_ROOT: "Z:/work", LUSIAD_DB_NAME: "production" })
    assert.equal(config.test?.runId, f.manifest.runId)
    assert.equal(config.apiUrl, f.manifest.apiUrl)
    assert.equal(config.tempRoot, f.manifest.tempRoot)
    assert.notEqual(config.test?.database.name, "production")
  } finally { f.dispose() }
})

test("changed manifest, normal database port and overlapping roots are refused", () => {
  const f = fixture()
  const env = { LUSIAD_ENV: "test", LUSIAD_TEST_CONFIG: f.file }
  try {
    writeFileSync(f.file, JSON.stringify({ ...f.manifest, requestTimeoutMs: 10000 }))
    assert.throws(() => loadRuntimeConfig(env), /ownership/)
    f.manifest.database.port = 3306; f.save()
    assert.throws(() => loadRuntimeConfig(env), /isolated/)
    f.manifest.database.port = 13307; f.manifest.tempRoot = f.manifest.projectsRoot; f.save()
    assert.throws(() => loadRuntimeConfig(env), /roots/)
  } finally { f.dispose() }
})

test("lexical escape, sibling-prefix confusion and junction traversal do not establish ownership", () => {
  const f = fixture()
  try {
    assert.equal(within(f.manifest.projectsRoot, f.manifest.projectsRoot + "-other"), false)
    assert.throws(() => noLinks(f.manifest.projectsRoot, join(f.manifest.projectsRoot, "..", "temp", "file.java")))
    const link = join(f.manifest.projectsRoot, "link")
    symlinkSync(f.manifest.tempRoot, link, process.platform === "win32" ? "junction" : "dir")
    assert.throws(() => noLinks(f.manifest.projectsRoot, join(link, "new.java")), /link|junction/)
  } finally { f.dispose() }
})

test("a fresh project never discovers the test repository's ancestor index; external gitdir is rejected", async () => {
  const f = fixture(), execute = promisify(execFile)
  const previous = { profile: process.env.LUSIAD_ENV, config: process.env.LUSIAD_TEST_CONFIG, pager: process.env.GIT_PAGER, fallbackPager: process.env.PAGER }
  process.env.LUSIAD_ENV = "test"; process.env.LUSIAD_TEST_CONFIG = f.file
  process.env.GIT_PAGER = "inherited-test-pager-must-not-run"
  process.env.PAGER = "inherited-test-pager-must-not-run"
  try {
    const project = join(f.manifest.projectsRoot, "Fresh")
    mkdirSync(project)
    await execute("git", ["init", f.parent], { env: testGitEnvironment(), windowsHide: true })
    await assert.rejects(() => execute("git", ["-C", project, "rev-parse", "--is-inside-work-tree"], { env: testGitEnvironment(), windowsHide: true }))
    await assertTestGitRepository(project)
    writeFileSync(join(project, ".git"), `gitdir: ${join(f.parent, ".git").replaceAll("\\", "/")}\n`)
    await assert.rejects(() => assertTestGitRepository(project), /external Git storage/)
    rmSync(join(project, ".git"))
    const git = async (args: string[]) => (await execute("git", ["-C", project, ...args], { env: testGitEnvironment(), windowsHide: true })).stdout.trim()
    // Exercise the actual library consumer: it rejects inherited GIT_PAGER by default.
    await createConfiguredGitClient(project).init()
    writeFileSync(join(project, "target.txt"), "../../outside")
    const object = await git(["hash-object", "-w", "target.txt"])
    await git(["update-index", "--add", "--cacheinfo", `120000,${object},link`])
    await git(["commit", "-m", "owned unsafe archive fixture"])
    await assert.rejects(() => assertSafeGitArchive(project, "HEAD"), /links\/submodules/)
    writeFileSync(join(f.manifest.labRoot, "gitconfig"), "[include]\npath = ../../outside\n")
    assert.throws(() => testGitEnvironment(), /Untrusted test Git configuration/)
  } finally {
    if (previous.profile === undefined) delete process.env.LUSIAD_ENV; else process.env.LUSIAD_ENV = previous.profile
    if (previous.config === undefined) delete process.env.LUSIAD_TEST_CONFIG; else process.env.LUSIAD_TEST_CONFIG = previous.config
    if (previous.pager === undefined) delete process.env.GIT_PAGER; else process.env.GIT_PAGER = previous.pager
    if (previous.fallbackPager === undefined) delete process.env.PAGER; else process.env.PAGER = previous.fallbackPager
    f.dispose()
  }
})

test("normal Git status and init tolerate inherited pagers without enabling unsafe execution", async () => {
  const f = fixture()
  const keys = ["LUSIAD_ENV", "LUSIAD_TEST_CONFIG", "LUSIAD_CONFIG_FILE", "GIT_PAGER", "PAGER"] as const
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  delete process.env.LUSIAD_ENV
  delete process.env.LUSIAD_TEST_CONFIG
  process.env.LUSIAD_CONFIG_FILE = f.file
  process.env.GIT_PAGER = "inherited-pager-must-not-execute"
  process.env.PAGER = "inherited-pager-must-not-execute"
  try {
    const project = join(f.parent, "NormalProject")
    mkdirSync(project)
    const git = createConfiguredGitClient(project)
    assert.equal(await git.checkIsRepo(), false)
    await git.init()
    assert.equal(await git.checkIsRepo(), true)
    assert.equal(process.env.GIT_PAGER, "inherited-pager-must-not-execute")
    assert.equal(process.env.PAGER, "inherited-pager-must-not-execute")
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
    f.dispose()
  }
})

test("pager names are case insensitive when preparing the Git environment", async () => {
  const f = fixture()
  const previous = { ...process.env }
  const isPager = (key: string) => /^(GIT_PAGER|PAGER)$/i.test(key)
  delete process.env.LUSIAD_ENV
  delete process.env.LUSIAD_TEST_CONFIG
  process.env.LUSIAD_CONFIG_FILE = f.file
  for (const key of Object.keys(process.env)) if (isPager(key)) delete process.env[key]
  process.env.git_pager = "inherited-pager-must-not-execute"
  process.env.Pager = "inherited-pager-must-not-execute"
  try {
    assert.deepEqual(Object.keys(testGitEnvironment()).filter(isPager), [])
    const project = join(f.parent, "MixedCaseProject")
    mkdirSync(project)
    const git = createConfiguredGitClient(project)
    assert.equal(await git.checkIsRepo(), false)
    await git.init()
    assert.equal(await git.checkIsRepo(), true)
    assert.equal(process.env.git_pager, "inherited-pager-must-not-execute")
    assert.equal(process.env.Pager, "inherited-pager-must-not-execute")
  } finally {
    for (const key of Object.keys(process.env)) if (isPager(key)) delete process.env[key]
    for (const [key, value] of Object.entries(previous)) if (isPager(key)) process.env[key] = value
    for (const key of ["LUSIAD_ENV", "LUSIAD_TEST_CONFIG", "LUSIAD_CONFIG_FILE"]) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
    f.dispose()
  }
})

test("local Git ignores inherited credential prompts in both profiles without mutating the server environment", async () => {
  const f = fixture()
  const previous = { ...process.env }
  const isAskPass = (key: string) => /^(GIT_ASKPASS|SSH_ASKPASS)$/i.test(key)
  const settings = ["LUSIAD_ENV", "LUSIAD_TEST_CONFIG", "LUSIAD_CONFIG_FILE", "GIT_TERMINAL_PROMPT"]
  try {
    for (const profile of ["normal", "test"]) {
      delete process.env.LUSIAD_ENV
      delete process.env.LUSIAD_TEST_CONFIG
      process.env.LUSIAD_CONFIG_FILE = join(f.parent, "normal.json")
      if (profile === "test") {
        process.env.LUSIAD_ENV = "test"
        process.env.LUSIAD_TEST_CONFIG = f.file
      }
      process.env.GIT_TERMINAL_PROMPT = "1"
      for (const [index, names] of [["GIT_ASKPASS", "SSH_ASKPASS"], ["git_askpass", "Ssh_AskPass"]].entries()) {
        for (const key of Object.keys(process.env)) if (isAskPass(key)) delete process.env[key]
        for (const key of names) process.env[key] = "inherited-credential-helper-must-not-execute"
        const project = join(f.manifest.projectsRoot, `${profile}-${index}`)
        mkdirSync(project)
        const git = createConfiguredGitClient(project)
        assert.equal(await git.checkIsRepo(), false)
        await git.init()
        assert.equal(await git.checkIsRepo(), true)
        assert.deepEqual(Object.keys(testGitEnvironment()).filter(isAskPass), [])
        assert.equal(testGitEnvironment().GIT_TERMINAL_PROMPT, "0")
        assert.equal(process.env.GIT_TERMINAL_PROMPT, "1")
        for (const key of names) assert.equal(process.env[key], "inherited-credential-helper-must-not-execute")
      }
    }
  } finally {
    for (const key of Object.keys(process.env)) if (isAskPass(key)) delete process.env[key]
    for (const [key, value] of Object.entries(previous)) if (isAskPass(key)) process.env[key] = value
    for (const key of settings) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
    f.dispose()
  }
})
