import assert from "node:assert/strict"
import test from "node:test"
import { BackendApiError, decodeBackendResponse, requireMutationResult, requirePsiMutationResult, requirePsiModel, requireRestoreResult } from "../src/lib/services/backend-response.ts"

const receipt = { recordVersion: 2, revision: "a".repeat(64), operationId: "12345678-1234-1234-1234-123456789abc", operationOrder: 1, changeId: 1 }
const context = "Operação de teste"
const leaf = { type: "PsiIdentifier", text: "café 😀", startLine: 1, startColumn: 1, endLine: 1, endColumn: 8, startOffset: 0, endOffset: 7 }
const model = { file: "Demo.java", tree: { ...leaf, type: "PsiJavaFile", children: [leaf] } }

test("PSI success requires verified saving; rejected formatting is a saved warning, not a write error", async () => {
  for (const status of ["formatted", "skipped_whitespace", "rejected", "failed"]) {
    const body = { ...receipt, status: "ok", saved: true, formatting: { status }, path: "Demo.java", insertedChars: 1 }
    assert.equal(requirePsiMutationResult(body, context, ["path", "insertedChars"]), body)
  }
  for (const value of [{}, { saved: false }, { saved: "true" }, { saved: true },
    { saved: true, formatting: "formatted" }, { saved: true, formatting: { status: ["formatted"] } }, { saved: true, formatting: { status: "unknown" } }]) {
    assert.throws(() => requirePsiMutationResult({ ...receipt, status: "ok", path: "Demo.java", ...value }, context), BackendApiError)
  }
  for (const invalid of [{ recordVersion: 1 }, { operationId: "" }, { operationId: "-".repeat(36) }, { operationOrder: 0 }, { changeId: "1" }, { revision: "old" }]) {
    assert.throws(() => requirePsiMutationResult({ ...receipt, ...invalid, status: "ok", saved: true, formatting: { status: "formatted" } }, context), BackendApiError)
  }
  for (const code of ["save_failed", "save_verification_failed", "revision_conflict", "operation_pending", "recovery_conflict", "record_unavailable"]) {
    await assert.rejects(decodeBackendResponse(Response.json({ error: "Save not confirmed", saved: false, code }, { status: 422 }), context),
      (error: unknown) => error instanceof BackendApiError && error.code === code)
  }
})

test("HTTP errors, legacy 200/error, partial results and invalid JSON cannot become success", async () => {
  for (const [body, status] of [
    [{ error: 'erro: "café", a/b\\c\nΩ', code: "invalid_request" }, 400],
    [{ error: "Java file not found" }, 200],
    [{ error: "", status: "ok" }, 200],
    [{ status: "error" }, 200],
    [{ status: "partial", errorCount: 1 }, 200],
    [{ status: "ok" }, 503],
    [null, 200], [[], 200], [true, 200],
  ] as const) {
    await assert.rejects(() => decodeBackendResponse(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }), context), BackendApiError)
  }
  await assert.rejects(() => decodeBackendResponse(new Response("<html>bad gateway</html>", { status: 502, headers: { "Content-Type": "application/json" } }), context), /JSON inválido/)
  await assert.rejects(() => decodeBackendResponse(new Response(JSON.stringify({ error: "Java file not found", code: "psi_file_not_found" }), { status: 404, headers: { "Content-Type": "application/json" } }), context),
    (error: unknown) => error instanceof BackendApiError && error.code === "psi_file_not_found" && error.detail === "Java file not found" && error.status === 404)
  const detail = 'erro: "café", a/b\\c\nΩ'
  await assert.rejects(() => decodeBackendResponse(new Response(JSON.stringify({ error: detail }), { status: 422, headers: { "Content-Type": "application/json" } }), context),
    (error: unknown) => error instanceof BackendApiError && error.detail === detail)
})

test("mutation success must be explicit and retain its field types", async () => {
  const body = { status: "ok", message: "created", insertedChars: 0, path: "a,b/Ω.java" }
  assert.deepEqual(requireMutationResult(await decodeBackendResponse(Response.json(body), context), context), body)
  assert.throws(() => requireMutationResult({ status: "ok" }, context, ["path", "insertedChars"]), BackendApiError)
  for (const invalid of [{}, { status: "done" }, { status: "ok", error: "failed" }, { status: "ok", path: {} }, { status: "ok", insertedChars: "1" }]) {
    assert.throws(() => requireMutationResult(invalid, context), BackendApiError)
  }
})

test("PSI validates the entire tree instead of treating any tree object as Java", async () => {
  assert.deepEqual(requirePsiModel(await decodeBackendResponse(Response.json(model), context), context), model)
  assert.deepEqual(requirePsiModel({ file: "Empty.java", tree: { ...leaf, text: "", endOffset: 0 } }, context).tree.text, "")
  for (const invalid of [
    {}, { tree: {} }, { ...model, error: "failure" }, { ...model, tree: [] },
    { ...model, tree: { ...leaf, children: [null] } },
    { ...model, tree: { ...leaf, children: [{ ...leaf, startLine: "1" }] } },
    { ...model, tree: { ...leaf, children: [{ error: "read failed" }] } },
    { ...model, tree: { ...leaf, children: {} } },
    { ...model, tree: { ...leaf, endOffset: -1 } },
  ]) assert.throws(() => requirePsiModel(invalid, context), BackendApiError)
})

test("restore requires a complete result for the requested change, in both history and comparison", () => {
  const complete = { status: "ok", targetChangeId: 42, errorCount: 0, appliedCount: 1, applied: [{ id: 42 }], errors: [] }
  assert.deepEqual(requireRestoreResult(complete, context, 42), complete)
  for (const invalid of [
    {}, { ...complete, status: "partial" }, { ...complete, targetChangeId: 43 },
    { ...complete, errorCount: 1 }, { ...complete, errors: [{ id: 1 }] },
    { ...complete, applied: [{ id: 41 }] }, { ...complete, appliedCount: 2 },
    { ...complete, applied: [null] }, { ...complete, appliedCount: undefined },
  ]) assert.throws(() => requireRestoreResult(invalid, context, 42), BackendApiError)
})


test("restore response must belong to the expected project, commit, Git state and request", () => {
  const expected={snapshotId:"compare-00000000-0000-0000-0000-000000000000",projectId:11,commitId:2,gitId:"a".repeat(40)}
  const body={status:"ok",targetChangeId:42,errorCount:0,appliedCount:1,applied:[{id:42}],errors:[],...expected}
  assert.deepEqual(requireRestoreResult(body,context,42,expected),body)
  assert.throws(()=>requireRestoreResult({...body,appliedCount:2,applied:[{id:42},{id:42}]},context,42,expected),BackendApiError)
  for(const key of Object.keys(expected)) assert.throws(()=>requireRestoreResult({...body,[key]:"another"},context,42,expected),BackendApiError)
})
