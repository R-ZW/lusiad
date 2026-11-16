import "server-only"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { containedPath, assertSeparateRoots } from "../contained-paths"
import { replaceTemporaryDirectory } from "../temporary-files"
import { assertSafeGitArchive, assertTestGitRepository, testGitEnvironment } from "@/lib/config/test-git"
import { assertTestTree } from "@/lib/config/runtime-config"
import { GitOperation } from "../commit-menu/git-operation"
import { loadInitialBaselineEvents, type RestoreContextRow, type PendingRestoreContext } from "@/lib/repositories/restore/restore.repository"
import { reconstructInitialBaseline } from "./initial-baseline"

const execute = promisify(execFile)

/** One baseline policy shared by the history preview and individual-change comparison. */
export async function prepareChangeArchive(context: RestoreContextRow, destination = "archive"): Promise<void> {
  assertSeparateRoots(context.projectPath, context.tempPath)
  await assertTestGitRepository(context.projectPath)
  const git = new GitOperation(context.projectPath, testGitEnvironment())
  // show fails explicitly for a missing/corrupt object; do not mistake that for a root commit.
  const parents = (await git.git(["show", "-s", "--format=%P", context.currentGitId])).trim().split(" ").filter(Boolean)
  const sha = parents[0] ?? context.currentGitId
  await assertSafeGitArchive(context.projectPath, sha)
  await replaceTemporaryDirectory(context.tempPath, destination, async (stage) => {
    assertTestTree(stage)
    if (parents[0]) {
      const tar = join(stage, "..", "archive.tar")
      await git.git(["archive", "--format=tar", sha, "--output", tar])
      await execute("tar", ["-xf", tar, "-C", stage], { windowsHide: true, env: testGitEnvironment() })
    } else {
      const finalFiles = new Map<string, Buffer>()
      for (const name of (await git.git(["ls-tree", "-r", "--name-only", "-z", sha])).split("\0").filter(Boolean))
        finalFiles.set(name, await git.bytes(["show", `${sha}:${name}`]))
      const { events, bundles } = await loadInitialBaselineEvents(context.projectId, context.commitId)
      const baseline = reconstructInitialBaseline(context.projectPath, finalFiles, events, bundles)
      for (const name of baseline.directories) await mkdir(containedPath(stage, name), { recursive: true })
      for (const [name, bytes] of baseline.files) {
        const target = containedPath(stage, name)
        await mkdir(join(target, ".."), { recursive: true }); await writeFile(target, bytes)
      }
    }
  })
}

/** Archive only the committed baseline. Pending edits are replayed from SQL, never copied from the live tree. */
export async function preparePendingArchive(context: PendingRestoreContext, destination: string): Promise<void> {
  assertSeparateRoots(context.projectPath, context.tempPath)
  await assertTestGitRepository(context.projectPath)
  const git = new GitOperation(context.projectPath, testGitEnvironment())
  const branch = (await git.git(["symbolic-ref", "--quiet", "--short", "HEAD"])).trim()
  const head = (await git.git(["rev-parse", "--verify", "HEAD"])).trim()
  if (branch !== context.branchName || head !== context.currentGitId)
    throw new Error("A branch ou o commit de base mudou durante a prévia")
  await assertSafeGitArchive(context.projectPath, head)
  await replaceTemporaryDirectory(context.tempPath, destination, async (stage) => {
    assertTestTree(stage)
    const tar = join(stage, "..", "archive.tar")
    await git.git(["archive", "--format=tar", head, "--output", tar])
    await execute("tar", ["-xf", tar, "-C", stage], { windowsHide: true, env: testGitEnvironment() })
  })
}
