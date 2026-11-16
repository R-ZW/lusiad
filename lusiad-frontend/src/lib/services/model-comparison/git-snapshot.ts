import { execFile } from "node:child_process"
import { writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import { createLineDiffWorkspace, removeTemporaryEntry } from "../temporary-files.ts"
import { assertTestPath, loadRuntimeConfig } from "../../config/runtime-config.ts"
import { assertTestGitRepository, testGitEnvironment } from "../../config/test-git.ts"
import type { ComparisonOption } from "./comparison-reference.model.ts"

const execute = promisify(execFile)

export interface GitLineCounts {
  addedLines: number
  removedLines: number
}

export interface GitSourceDiff extends GitLineCounts {
  /** Unified hunks only; the UI displays the real project path instead of temporary file names. */
  hunks: string
}

/** Git's patch and statistics also work for reconstructed snapshots, without staging files. */
export async function compareGitSources(before: string | null, after: string | null): Promise<GitSourceDiff> {
  if ((before ?? "") === (after ?? "")) return { addedLines: 0, removedLines: 0, hunks: "" }
  const tempParent = resolve(loadRuntimeConfig().tempRoot)
  const tempRoot = await createLineDiffWorkspace(tempParent)
  try {
    await writeFile(join(tempRoot, "before.java"), before ?? "", "utf8")
    await writeFile(join(tempRoot, "after.java"), after ?? "", "utf8")
    let output: string
    try {
      const { stdout } = await execute("git", [
        "diff", "--no-index", "--numstat", "--patch", "--unified=3", "--no-color",
        "--no-renames", "--no-ext-diff", "--no-textconv", "--text",
        "--", "before.java", "after.java",
      ], { cwd: tempRoot, env: testGitEnvironment(), encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 64 * 1024 * 1024 })
      output = stdout
    } catch (error) {
      // --no-index returns 1 for a successful comparison that found differences.
      if (!(error instanceof Error) || !("code" in error) || error.code !== 1
        || !("stdout" in error) || typeof error.stdout !== "string") throw error
      output = error.stdout
    }
    if (!output.trim()) return { addedLines: 0, removedLines: 0, hunks: "" }
    const counts = /^(\d+)\t(\d+)\t/.exec(output)
    if (!counts) throw new Error("Contagem de linhas inválida retornada pelo Git")
    const hunkStart = /^@@ /m.exec(output)?.index
    if (hunkStart === undefined) throw new Error("Diff textual inválido retornado pelo Git")
    return { addedLines: Number(counts[1]), removedLines: Number(counts[2]), hunks: output.slice(hunkStart) }
  } finally {
    assertTestPath(tempRoot, "temp", false)
    await removeTemporaryEntry(tempParent, tempRoot)
  }
}

export async function countGitSourceLines(before: string | null, after: string | null): Promise<GitLineCounts> {
  const { addedLines, removedLines } = await compareGitSources(before, after)
  return { addedLines, removedLines }
}

/** Executes Git without shell expansion in the authorized project's repository. */
export async function gitCommand(root: string, args: string[]): Promise<string> {
  await assertTestGitRepository(root)
  const { stdout } = await execute("git", ["-C", root, ...args], { env: testGitEnvironment(),
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true,
  })
  return stdout
}

/** Full names avoid ambiguous refs; annotated tags display the commit they point to. */
export async function readGitComparisonRefs(root: string, kind: "all" | "branch" | "tag"): Promise<ComparisonOption[]> {
  const namespaces = kind === "branch" ? ["refs/heads"] : kind === "tag" ? ["refs/tags"] : ["refs/heads", "refs/tags"]
  const output = await gitCommand(root, ["for-each-ref",
    "--format=%(refname)%09%(objectname)%09%(*objectname)%09%(creatordate:iso-strict)", ...namespaces])
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [ref, objectSha, peeledSha, timestamp] = line.split("\t")
    const kind = ref.startsWith("refs/heads/") ? "branch" : "tag"
    const name = ref.slice(kind === "branch" ? "refs/heads/".length : "refs/tags/".length)
    return { value: `${kind}:${name}`, label: name, kind, sha: peeledSha || objectSha, timestamp }
  })
}

/** Loads regular Java blobs from one immutable Git tree; links and other files are excluded. */
export async function readGitJavaSnapshot(root: string, sha: string): Promise<Map<string, string>> {
  const tree = await gitCommand(root, ["ls-tree", "-r", "-z", sha])
  const result = new Map<string, string>()
  for (const entry of tree.split("\0").filter(Boolean)) {
    const match = /^(100644|100755) blob [0-9a-f]+\t(.+)$/.exec(entry)
    if (!match || !match[2].toLowerCase().endsWith(".java")) continue
    const path = match[2]
    result.set(path, await gitCommand(root, ["show", `${sha}:${path}`]))
  }
  return result
}
