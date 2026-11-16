import assert from "node:assert/strict"
import test from "node:test"
import { captureGitAction } from "../src/lib/services/commit-menu/git-action-result.ts"
import { GitPendingError, GitValidationError } from "../src/lib/services/commit-menu/git-operation.ts"
import { unwrapBackendAction } from "../src/lib/services/backend-action-result.ts"

test("Git action failures survive production serialization, preserve pending IDs and never become success", async () => {
  const id = "6eae5640-d521-4e91-9bc4-f050395ece1a"
  const failure = await captureGitAction(async () => {
    throw new GitPendingError(id, new Error("SQL password=private; query=private-source"))
  }, async (error) => `Pending operation ${error.detail}`)
  const serialized = JSON.stringify(failure)
  assert.equal(serialized.includes("private"), false)
  assert.deepEqual(JSON.parse(serialized), { backendError: { code: "git_pending", message: `Pending operation ${id}` } })
  assert.throws(() => unwrapBackendAction(JSON.parse(serialized)), new RegExp(id))
  const success = { commitId: 12, updatedChanges: 3 }
  assert.deepEqual(unwrapBackendAction(await captureGitAction(async () => success, async () => "unused")), success)
})

test("Git child/SQL failures expose a safe code while deliberate validation and backend failures stay distinct", async () => {
  const unknown = await captureGitAction(async () => { throw new Error("hook/SQL credentials=private") }, async (error) => error.code)
  assert.deepEqual(unknown, { backendError: { code: "git_operation_failed", message: "git_operation_failed" } })
  const known = await captureGitAction(async () => { throw new GitValidationError("Snapshot differs") }, async (error) => error.detail)
  assert.deepEqual(known, { backendError: { code: "operation_failed", message: "Snapshot differs" } })
})
