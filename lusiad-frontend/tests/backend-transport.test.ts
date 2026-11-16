import assert from "node:assert/strict"
import test from "node:test"
import { createServer } from "node:http"
import { once } from "node:events"
import { requestBackendJson } from "../src/lib/services/backend-transport.ts"
import { BackendApiError, requireMutationResult, requirePsiModel } from "../src/lib/services/backend-response.ts"
import { captureBackendAction, unwrapBackendAction } from "../src/lib/services/backend-action-result.ts"

test("real HTTP: unavailable, invalid, denied and timed-out requests recover without retries or token redirects", async () => {
  const token = "fixture-token-" + "x".repeat(32)
  let mode = "ok", calls = 0, redirects = 0
  const sink = createServer((_req, res) => { redirects++; res.end("unexpected") })
  sink.listen(0, "127.0.0.1"); await once(sink, "listening")
  const server = createServer((req, res) => {
    calls++
    assert.equal(req.headers["x-lusiad-token"], token)
    assert.equal(req.headers["content-type"], "application/json")
    if (mode === "headers-timeout") return
    if (mode === "redirect") {
      res.writeHead(307, { Location: `http://127.0.0.1:${(sink.address() as { port: number }).port}/sink` }); res.end(); return
    }
    res.setHeader("Content-Type", mode === "wrong-type" ? "text/html" : "application/json; charset=utf-8")
    if (mode === "body-timeout") { res.writeHead(200); res.flushHeaders(); res.write('{"status":'); return }
    if (mode === "invalid-json") { res.end("{broken"); return }
    if (mode === "invalid-psi") { res.end(JSON.stringify({ file: "Demo.java", tree: { error: "read failure" } })); return }
    if (mode === "denied") { res.statusCode = 403; res.end(JSON.stringify({ code: "client_not_authorized", error: "denied" })); return }
    res.end(JSON.stringify({ status: "ok", path: "Demo.java" }))
  })
  server.listen(0, "127.0.0.1"); await once(server, "listening")
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const connection = { apiUrl: url, token, timeoutMs: 2000 }
  const run = () => requestBackendJson(connection, url + "/psi/update", {}, "test", requireMutationResult)
  async function failure(code: string, operation: () => Promise<unknown> = run) {
    const before = calls
    await assert.rejects(operation, (error: unknown) => error instanceof BackendApiError && error.code === code && !error.message.includes(token))
    assert.equal(calls, before + 1, "A failed mutation must never be automatically retried")
    mode = "ok"
    assert.equal((await run()).status, "ok", "A failure must not poison later requests")
  }
  try {
    assert.equal((await run()).status, "ok")
    mode = "invalid-json"; await failure("invalid_json")
    mode = "wrong-type"; await failure("invalid_response")
    mode = "invalid-psi"
    await failure("invalid_response", () => requestBackendJson(connection, url + "/psi/read", {}, "test", requirePsiModel))
    mode = "denied"; await failure("client_not_authorized")
    mode = "headers-timeout"; connection.timeoutMs = 100; await failure("backend_timeout")
    mode = "body-timeout"; await failure("backend_timeout")
    mode = "redirect"; await failure("backend_unavailable")
    assert.equal(redirects, 0, "The local credential must never follow a redirect")
    await assert.rejects(() => requestBackendJson(connection, `http://127.0.0.1:${(sink.address() as { port: number }).port}/sink`, {}, "test", requireMutationResult),
      (error: unknown) => error instanceof BackendApiError && error.code === "backend_configuration")
    assert.equal(redirects, 0)
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()))
    await assert.rejects(run, (error: unknown) => error instanceof BackendApiError && error.code === "backend_unavailable")
    // A new listener on the same address proves recovery after actual unavailability.
    server.listen(Number(new URL(url).port), "127.0.0.1"); await once(server, "listening")
    mode = "ok"; assert.equal((await run()).status, "ok")
  } finally {
    server.closeAllConnections(); sink.closeAllConnections()
    await Promise.all([new Promise<void>((resolve) => server.close(() => resolve())), new Promise<void>((resolve) => sink.close(() => resolve()))])
  }
})

test("expected failures remain explicit across JSON Server Action serialization, and recovery still returns a model", async () => {
  const error = new BackendApiError("read", "unavailable", "backend_unavailable", 0)
  const result = await captureBackendAction(async () => { throw error }, async () => "Plugin unavailable")
  const wire = JSON.parse(JSON.stringify(result))
  assert.throws(() => unwrapBackendAction(wire), /Plugin unavailable/)
  assert.equal("tree" in wire, false)
  const model = { file: "Demo.java", tree: { type: "PsiJavaFile" } }
  assert.deepEqual(unwrapBackendAction(await captureBackendAction(async () => model, async () => "unused")), model)
  await assert.rejects(() => captureBackendAction(async () => { throw new Error("unexpected defect") }, async () => "unused"), /unexpected defect/)
})
