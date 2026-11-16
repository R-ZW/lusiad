import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { createConfiguredGitClient } from "../src/lib/config/test-git.ts"
import { readRepositoryBranch, resolveRecordedBranch } from "../src/lib/services/commit-menu/branch-identity.ts"

test("initial branch identity follows Git before any commit, independent of the default name", async () => {
  for (const name of ["master", "main", "custom-default"]) {
    const root = await mkdtemp(join(tmpdir(), "lusiad-branch-"))
    try {
      const git = createConfiguredGitClient(root)
      await git.init([`--initial-branch=${name}`])
      const actual = await readRepositoryBranch(git)
      assert.equal(actual, name)
      assert.equal(resolveRecordedBranch([], actual), null)
      const branch = { id: 1, name, selected: "1" }
      assert.equal(resolveRecordedBranch([branch], actual), branch)
      assert.equal(resolveRecordedBranch([{ ...branch, selected: "0" }], actual)?.name, name)
      assert.throws(() => resolveRecordedBranch([{ ...branch, name: "different" }], actual), /difere/)
    } finally { await rm(root, { recursive: true, force: true }) }
  }
})
