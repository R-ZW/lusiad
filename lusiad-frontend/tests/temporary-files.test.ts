import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, mkdir, readFile, writeFile, readdir, rename, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { removeTemporaryEntry, replaceTemporaryDirectory, temporaryEntry } from "../src/lib/services/temporary-files.ts"
import { gitCommand } from "../src/lib/services/model-comparison/git-snapshot.ts"

const execute = promisify(execFile)

test("failed Git extraction and failed publication preserve the old snapshot and the real disposable worktree", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "lusiad-snapshot-operations-"))
  try {
    const project = join(fixture, "project"), root = join(fixture, "temporary")
    await mkdir(project); await mkdir(join(root, "archive"), { recursive: true })
    await writeFile(join(root, "archive", "X.java"), "previous\r\n")
    await gitCommand(project, ["init", "-b", "main"])
    await gitCommand(project, ["config", "user.name", "Lusiad fixture"])
    await gitCommand(project, ["config", "user.email", "test@lusiad.invalid"])
    await writeFile(join(project, "X.java"), "class Ω {}\r\n")
    await gitCommand(project, ["add", "X.java"]); await gitCommand(project, ["commit", "-m", "fixture"])
    const head = await gitCommand(project, ["rev-parse", "HEAD"])
    const prepare = (ref: string) => async (stage: string) => {
      const tar = join(stage, "..", "archive.tar")
      await gitCommand(project, ["archive", "--format=tar", ref, "--output", tar])
      await execute("tar", ["-xf", tar, "-C", stage], { windowsHide: true })
    }
    await assert.rejects(replaceTemporaryDirectory(root, "archive", prepare("refs/heads/absent")))
    assert.equal(await readFile(join(root, "archive", "X.java"), "utf8"), "previous\r\n")
    let injected = false
    await assert.rejects(replaceTemporaryDirectory(root, "archive", prepare("HEAD"), async (from, to) => {
      if (String(from).endsWith("tree") && !injected) { injected = true; throw new Error("controlled publication failure") }
      await rename(from, to)
    }), /publication failure/)
    assert.equal(await readFile(join(root, "archive", "X.java"), "utf8"), "previous\r\n")
    assert.deepEqual(await readdir(root), ["archive"])
    await replaceTemporaryDirectory(root, "archive", prepare("HEAD"))
    assert.match(await readFile(join(root, "archive", "X.java"), "utf8"), /class Ω/)
    assert.equal(await gitCommand(project, ["rev-parse", "HEAD"]), head)
    assert.equal((await gitCommand(project, ["status", "--porcelain"])).trim(), "")
    assert.equal(await readFile(join(project, "X.java"), "utf8"), "class Ω {}\r\n")
  } finally { await rm(fixture, { recursive: true, force: true }) }
})

test("temporary cleanup refuses the root, arbitrary folders, siblings and redirected snapshots", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "lusiad-cleanup-boundary-"))
  try {
    const root = join(fixture, "temporary"), outside = join(fixture, "outside")
    await mkdir(root); await mkdir(outside); await writeFile(join(outside, "keep"), "untouched")
    await mkdir(join(root, "another-project")); await writeFile(join(root, "another-project", "keep"), "untouched")
    for (const path of [root, "..", outside, "another-project", "archive/../another-project"]) {
      await assert.rejects(removeTemporaryEntry(root, path))
    }
    await symlink(outside, join(root, "working-copy"), "junction")
    await assert.rejects(removeTemporaryEntry(root, "working-copy"))
    assert.equal(await readFile(join(outside, "keep"), "utf8"), "untouched")
    assert.equal(await readFile(join(root, "another-project", "keep"), "utf8"), "untouched")
    const comparison = "comparisons/compare-12345678-1234-1234-1234-123456789abc"
    await mkdir(temporaryEntry(root, comparison), { recursive: true })
    await writeFile(join(root, comparison, "generated"), "generated")
    await removeTemporaryEntry(root, comparison)
    assert.deepEqual(await readdir(join(root, "comparisons")), [])
  } finally { await rm(fixture, { recursive: true, force: true }) }
})

test("failed rollback retains a named recovery backup instead of deleting the previous snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "lusiad-snapshot-recovery-"))
  try {
    await mkdir(join(root, "archive")); await writeFile(join(root, "archive", "X.java"), "previous")
    let moves = 0
    await assert.rejects(replaceTemporaryDirectory(root, "archive", stage => writeFile(join(stage, "X.java"), "new"), async (from, to) => {
      if (++moves > 1) throw new Error("disk unavailable")
      await rename(from, to)
    }), /previous snapshot retained at/)
    const backup = (await readdir(root)).find(name => name.startsWith(".lusiad-backup-"))
    assert.ok(backup)
    assert.equal(await readFile(join(root, backup, "X.java"), "utf8"), "previous")
  } finally { await rm(root, { recursive: true, force: true }) }
})
