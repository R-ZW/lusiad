import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { GitOperation } from "../src/lib/services/commit-menu/git-operation.ts"
import { testGitEnvironment } from "../src/lib/config/test-git.ts"

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "lusiad-git-operation-")), git = new GitOperation(root, testGitEnvironment())
  await git.git(["init", "-b", "main"])
  await git.git(["config", "user.name", "Lusiad Regression"])
  await git.git(["config", "user.email", "regression@example.invalid"])
  await git.git(["config", "core.autocrlf", "false"])
  await git.git(["config", "commit.gpgsign", "false"])
  await mkdir(join(root, "hooks"))
  await git.git(["config", "core.hooksPath", join(root, "hooks")])
  return { root, git, close: () => rm(root, { recursive: true, force: true }) }
}

test("private snapshot preserves index on status/preparation, freezes content and recovers publication idempotently", async () => {
  const f = await fixture()
  try {
    await f.git.git(["config", "core.autocrlf", "true"])
    await writeFile(join(f.root, "Demo.java"), "class Demo {}\r\n")
    const index = await f.git.indexHash()
    await f.git.git(["status", "--porcelain"])
    assert.equal(await f.git.indexHash(), index)
    const plan = await f.git.plan(randomUUID(), "commit", "Initial", null)
    assert.equal(await f.git.indexHash(), index)
    assert.equal(await f.git.ref("refs/heads/main"), null)
    await writeFile(join(f.root, "Demo.java"), "class ChangedAfterSnapshot {}\n")
    await f.git.publish(plan)
    await f.git.cleanup(plan.id) // Process restart + removed disposable private index.
    await f.git.publish(plan)
    assert.equal(await f.git.ref("refs/heads/main"), plan.sha)
    assert.equal(await f.git.git(["show", `${plan.sha}:Demo.java`]), "class Demo {}\n")
    assert.equal(await f.git.contentObject("Demo.java", Buffer.from("class Demo {}\r\n")),
      (await f.git.git(["rev-parse", `${plan.sha}:Demo.java`])).trim())
    assert.match(await f.git.git(["diff", "--", "Demo.java"]), /ChangedAfterSnapshot/)
    assert.equal((await f.git.git(["diff", "--cached", "--name-only"])).trim(), "")
  } finally { await f.close() }
})

test("hook rejection creates neither branch ref nor fictitious commit and keeps the real index", async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.root, "Demo.java"), "class Demo {}\n")
    const baseline = await f.git.plan(randomUUID(), "commit", "Baseline", null); await f.git.publish(baseline)
    await writeFile(join(f.root, "hooks/pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 })
    const index = await f.git.indexHash()
    // Keep hooks out of the source tree for the clean-branch precondition.
    await f.git.git(["config", "core.hooksPath", join(f.root, ".git", "hooks")])
    await writeFile(join(f.root, ".git/hooks/pre-commit"), await readFile(join(f.root, "hooks/pre-commit")), { mode: 0o755 })
    await rm(join(f.root, "hooks"), { recursive: true })
    await assert.rejects(() => f.git.plan(randomUUID(), "branch", "New branch", null, "feature"))
    assert.equal(await f.git.ref("refs/heads/feature"), null)
    assert.equal(await f.git.headRef(), "refs/heads/main")
    assert.equal(await f.git.indexHash(), index)
    assert.equal(await f.git.ref("refs/heads/main"), baseline.sha)
  } finally { await f.close() }
})

test("two concurrent plans cannot overwrite the other's published ref", async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.root, "Demo.java"), "class Demo {}\n")
    const first = await f.git.plan(randomUUID(), "commit", "First", null)
    const second = await f.git.plan(randomUUID(), "commit", "Second", null)
    await f.git.publish(first)
    await assert.rejects(() => f.git.publish(second), /Referências Git mudaram/)
    assert.equal(await f.git.ref("refs/heads/main"), first.sha)
  } finally { await f.close() }
})

test("branch/merge retain exact trees, real parents and never create a missing base", async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.root, "Demo.java"), "class Demo {}\n")
    const initial = await f.git.plan(randomUUID(), "commit", "Initial", null); await f.git.publish(initial)
    const branch = await f.git.plan(randomUUID(), "branch", "Branch", null, "feature"); await f.git.publish(branch)
    await writeFile(join(f.root, "Demo.java"), "class Demo { int n; }\n")
    const edit = await f.git.plan(randomUUID(), "commit", "Edit", null); await f.git.publish(edit)
    const merge = await f.git.plan(randomUUID(), "merge", "Merge", null, "main"); await f.git.publish(merge)
    assert.equal(await f.git.headRef(), "refs/heads/main")
    assert.equal(merge.tree, edit.tree)
    assert.equal((await f.git.git(["show", "-s", "--format=%P", merge.sha])).trim(), `${initial.sha} ${edit.sha}`)
    assert.equal((await f.git.git(["status", "--porcelain"])).trim(), "")
    await assert.rejects(() => f.git.plan(randomUUID(), "merge", "Invalid", null, "missing"))
    assert.equal(await f.git.ref("refs/heads/missing"), null)
  } finally { await f.close() }
})

test("an externally changed index is preserved and leaves publication explicitly recoverable", async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.root, "Demo.java"), "class Demo {}\n")
    const plan = await f.git.plan(randomUUID(), "commit", "Initial", null)
    await writeFile(join(f.root, "Other.java"), "class Other {}\n")
    await f.git.git(["add", "Other.java"])
    const concurrent = await f.git.indexHash()
    await assert.rejects(() => f.git.publish(plan), /Índice Git alterado/)
    assert.equal(await f.git.indexHash(), concurrent)
    assert.equal(await f.git.ref("refs/heads/main"), plan.sha)
  } finally { await f.close() }
})


test("initial snapshot supports an empty project, preserves its files/index and becomes the first edit's real parent", async () => {
  const f = await fixture()
  try {
    // fixture hooks live inside the project: exclude them exactly as user metadata is ignored.
    await f.git.git(["config", "core.hooksPath", join(f.root, ".git/hooks")])
    await rm(join(f.root, "hooks"), { recursive: true })
    const empty = await f.git.plan(randomUUID(), "initialize", "Initial project snapshot", null)
    assert.equal((await f.git.git(["ls-tree", "-r", "--name-only", empty.sha])).trim(), "")
    assert.equal(await f.git.ref("refs/heads/main"), null)
    await f.git.publish(empty); await f.git.publish(empty)
    assert.equal((await f.git.git(["status", "--porcelain"])).trim(), "")
    await writeFile(join(f.root, "First.java"), "class First {}\n")
    const edit = await f.git.plan(randomUUID(), "commit", "First real change", null)
    await f.git.publish(edit)
    assert.equal((await f.git.git(["show", "-s", "--format=%P", edit.sha])).trim(), empty.sha)
    assert.match(await f.git.git(["diff", empty.sha, edit.sha]), /class First/)
    await assert.rejects(() => f.git.plan(randomUUID(), "initialize", "Again", null), /já possui/)
  } finally { await f.close() }
})

test("failed initial validation leaves unborn HEAD/files/index intact and retry captures existing sources", async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.root, "Existing.java"), "class Existing {}\n")
    await writeFile(join(f.root, "hooks/pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 })
    const index = await f.git.indexHash()
    await assert.rejects(() => f.git.plan(randomUUID(), "initialize", "Initial", null))
    assert.equal(await f.git.ref("refs/heads/main"), null)
    assert.equal(await f.git.indexHash(), index)
    assert.equal(await readFile(join(f.root, "Existing.java"), "utf8"), "class Existing {}\n")
    await rm(join(f.root, "hooks/pre-commit"))
    const plan = await f.git.plan(randomUUID(), "initialize", "Initial", null)
    await f.git.publish(plan)
    assert.equal(await f.git.git(["show", `${plan.sha}:Existing.java`]), "class Existing {}\n")
    assert.equal((await f.git.git(["show", "-s", "--format=%P", plan.sha])).trim(), "")
  } finally { await f.close() }
})

test("restore publishes a new child of HEAD, including an empty technical baseline", async () => {
  const f = await fixture()
  try {
    await f.git.git(["config", "core.hooksPath", join(f.root, ".git/hooks")])
    await rm(join(f.root, "hooks"), { recursive: true })
    const initial = await f.git.plan(randomUUID(), "initialize", "Technical baseline", null)
    await f.git.publish(initial)
    await writeFile(join(f.root, "Before.java"), "class Before {}\n")
    const first = await f.git.plan(randomUUID(), "commit", "First", null)
    await f.git.publish(first)
    await f.git.git(["mv", "Before.java", "After.java"])
    const second = await f.git.plan(randomUUID(), "commit", "Rename", null)
    await f.git.publish(second)
    const restore = await f.git.plan(randomUUID(), "restore", "Restore first", null, first.sha)
    assert.equal(await f.git.ref("refs/heads/main"), second.sha)
    assert.equal(await readFile(join(f.root, "After.java"), "utf8"), "class Before {}\n")
    await f.git.publish(restore)
    await f.git.cleanup(restore.id)
    await f.git.publish(restore)
    assert.equal((await f.git.git(["show", "-s", "--format=%P", restore.sha])).trim(), second.sha)
    assert.equal(restore.tree, first.tree)
    assert.equal(await f.git.ref("refs/heads/main"), restore.sha)
    assert.equal(await readFile(join(f.root, "Before.java"), "utf8"), "class Before {}\n")
    await assert.rejects(() => readFile(join(f.root, "After.java")), /ENOENT/)
    assert.equal((await f.git.git(["status", "--porcelain"])).trim(), "")
    const empty = await f.git.plan(randomUUID(), "restore", "Restore empty baseline", null, initial.sha)
    await f.git.publish(empty)
    assert.equal((await f.git.git(["ls-tree", "-r", "--name-only", empty.sha])).trim(), "")
    await assert.rejects(() => readFile(join(f.root, "Before.java")), /ENOENT/)
    assert.equal((await f.git.git(["status", "--porcelain"])).trim(), "")
  } finally { await f.close() }
})

test("external file changes stop restore before publishing or overwriting the file", async () => {
  const f = await fixture()
  try {
    await f.git.git(["config", "core.hooksPath", join(f.root, ".git/hooks")])
    await rm(join(f.root, "hooks"), { recursive: true })
    await writeFile(join(f.root, "Demo.java"), "class First {}\n")
    const first = await f.git.plan(randomUUID(), "commit", "First", null); await f.git.publish(first)
    await writeFile(join(f.root, "Demo.java"), "class Second {}\n")
    const second = await f.git.plan(randomUUID(), "commit", "Second", null); await f.git.publish(second)
    const restore = await f.git.plan(randomUUID(), "restore", "Restore first", null, first.sha)
    await writeFile(join(f.root, "Demo.java"), "class External {}\n")
    await assert.rejects(() => f.git.publish(restore), /Arquivo alterado/)
    assert.equal(await f.git.ref("refs/heads/main"), second.sha)
    assert.equal(await readFile(join(f.root, "Demo.java"), "utf8"), "class External {}\n")
  } finally { await f.close() }
})

test("clean check ignores stale file statistics but rejects real edits", async () => {
  const f = await fixture()
  try {
    const file = join(f.root, "Demo.java")
    await writeFile(file, "class Same {}\n")
    const base = await f.git.plan(randomUUID(), "commit", "Base", null)
    await f.git.publish(base)
    await utimes(file, new Date(), new Date(Date.now() + 60_000))
    assert.match(await f.git.git(["status", "--porcelain"]), /^ M Demo\.java$/m)
    await f.git.assertClean()
    await writeFile(file, "class Changed {}\n")
    await assert.rejects(() => f.git.assertClean(), /Conclua as mudanças pendentes/)
  } finally { await f.close() }
})

test("a reconstructed partial tree becomes a new commit without touching the live project during preparation", async () => {
  const f = await fixture(), snapshot = await mkdtemp(join(tmpdir(), "lusiad-restored-change-"))
  try {
    await writeFile(join(f.root, "Demo.java"), "class First {}\n")
    await mkdir(join(f.root, "before"))
    await writeFile(join(f.root, "before", "Repeated.java"), "class Repeated {}\n")
    const first = await f.git.plan(randomUUID(), "commit", "First", null); await f.git.publish(first)
    await writeFile(join(f.root, "Demo.java"), "class Final {}\n")
    const final = await f.git.plan(randomUUID(), "commit", "Final", null); await f.git.publish(final)
    await writeFile(join(snapshot, "Demo.java"), "class Middle {}\n")
    await writeFile(join(snapshot, "Helper.java"), "class Helper {}\n")
    await mkdir(join(snapshot, "after"))
    await writeFile(join(snapshot, "after", "Repeated.java"), "class Repeated {}\n")
    const tree = await f.git.treeFromSnapshot(snapshot)
    assert.equal(await readFile(join(f.root, "Demo.java"), "utf8"), "class Final {}\n")
    assert.equal(await f.git.ref("refs/heads/main"), final.sha)
    const restored = await f.git.plan(randomUUID(), "restore", "After change", null, tree)
    await f.git.publish(restored)
    assert.equal((await f.git.git(["show", "-s", "--format=%P", restored.sha])).trim(), final.sha)
    assert.equal(restored.tree, tree)
    assert.equal(await readFile(join(f.root, "Demo.java"), "utf8"), "class Middle {}\n")
    assert.equal(await readFile(join(f.root, "Helper.java"), "utf8"), "class Helper {}\n")
    assert.equal(await readFile(join(f.root, "after", "Repeated.java"), "utf8"), "class Repeated {}\n")
    await assert.rejects(() => readFile(join(f.root, "before", "Repeated.java")), { code: "ENOENT" })
    assert.equal((await f.git.git(["status", "--porcelain"])).trim(), "")
    // The same path-independent tree import also represents the empty technical
    // version used before the project's first recorded change.
    await rm(join(snapshot, "Demo.java"))
    await rm(join(snapshot, "Helper.java"))
    await rm(join(snapshot, "after"), { recursive: true })
    const emptyTree = await f.git.treeFromSnapshot(snapshot)
    const empty = await f.git.plan(randomUUID(), "restore", "After first change", null, emptyTree)
    await f.git.publish(empty)
    assert.equal((await f.git.git(["show", "-s", "--format=%P", empty.sha])).trim(), restored.sha)
    assert.equal((await f.git.git(["ls-tree", "-r", "--name-only", empty.sha])).trim(), "")
  } finally { await rm(snapshot, { recursive: true, force: true }); await f.close() }
})
