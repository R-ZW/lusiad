import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EditorSession, MutationGate } from "../src/lib/models/model-editor/editor-session.ts"
import { remapPath, treeFiles, pathKey, openPath, isSnapshotPath, parentPath } from "../src/lib/models/model-editor/workspace-paths.ts"
import { readDirectoryTree } from "../src/lib/services/file-explorer/directory-tree.ts"

test('programmatic navigation reuses the exact existing tab identity across Windows path spellings and moves', () => {
  const existing='D:\\project\\A.java'
  assert.equal(openPath([existing], 'd:/PROJECT/A.java'),existing)
  const moved=remapPath(existing,{from:existing,to:'D:/project/B.java'})!
  assert.equal(openPath([moved],'D:\\project\\B.java'),moved)
  assert.equal(openPath(['/project/A.java'],'/project/a.java'),'/project/a.java')
})

test("a deferred creation keeps its target revision without acquiring the mutation gate", () => {
  const gate = new MutationGate()
  const session = new EditorSession<object>(gate)
  const model = {}
  const view = session.select('A.java')
  session.accept(view, model)
  const proposal = session.capture(model)!
  assert.equal(proposal.path, 'A.java')
  const gateToken = gate.acquire()!
  assert.ok(gateToken, 'opening/cancelling a proposal must not reserve a write')
  assert.equal(session.begin(model), null)
  gate.release(gateToken)
  session.select('A.java')
  assert.equal(session.current(proposal.view), false, 'same path, newer model: old insertion location is stale')
  assert.equal(session.begin(model), null)
  const b = {}, selected = session.select('B.java')
  session.accept(selected, b)
  assert.equal(session.capture(model), null)
  session.setBlocked(true)
  assert.equal(session.capture(b), null)
  session.setBlocked(false)
  const operation = session.begin(b)!
  assert.equal(session.capture(b), null, 'cannot prepare another creation during an outstanding write')
  session.finish(operation)
  assert.ok(session.capture(b))
})

test("a late read and a late edit cannot replace the selected document, even after A → B → A", async () => {
  const session = new EditorSession<object>()
  const a = {}, b = {}
  const first = session.select("A.java")
  session.accept(first, a)
  const operation = session.begin(a)!
  const second = session.select("B.java")
  assert.equal(session.accept(first, a), false)
  assert.equal(session.accept(second, b), true)
  assert.equal(session.current(operation.view), false, "late mutation may notify history but may not reload A")
  assert.equal(session.begin(b), null, "another mutation waits for the original one")
  session.finish(operation)
  const newer = session.select("A.java")
  assert.equal(session.accept(first, a), false)
  assert.equal(session.accept(newer, a), true)
  assert.equal(session.current(operation.view), false)
  session.select("")
  assert.equal(session.accept(newer, a), false, "closing/unmounting invalidates pending responses")
})

test("sync lock, stale model, double submit and explorer/editor competition are refused synchronously", () => {
  const gate = new MutationGate(), session = new EditorSession<object>(gate), model = {}
  const ticket = session.select("Demo.java")
  assert.equal(session.begin(model), null, "loading is not a writable state")
  session.accept(ticket, model)
  session.setBlocked(true)
  assert.equal(session.begin(model), null)
  session.setBlocked(false)
  assert.equal(session.begin({}), null)
  const explorer = gate.acquire()!
  assert.equal(session.begin(model), null)
  gate.release(explorer)
  const edit = session.begin(model)!
  assert.equal(gate.acquire(), null)
  assert.equal(session.begin(model), null)
  session.finish(edit)
  assert.ok(gate.acquire())
})

test("folder changes remap descendants and Windows case without matching siblings or another project", () => {
  const mutation = {from:"D:\\project\\pkg",to:"D:/project/renamed"}
  assert.equal(remapPath("d:/PROJECT/pkg/A.java", mutation), "D:/project/renamed/A.java")
  assert.equal(remapPath("D:/project/pkg2/A.java", mutation), "D:/project/pkg2/A.java")
  assert.equal(remapPath("D:/other/pkg/A.java", mutation), "D:/other/pkg/A.java")
  assert.equal(remapPath("D:/project/pkg/A.java", {from:"D:/project/pkg"}), null)
  assert.equal(remapPath("/project/PKG/A.java", {from:"/project/pkg"}), "/project/PKG/A.java")
  assert.equal(isSnapshotPath("D:/project/comparisons/compare-real/A.java", "D:/temp"), false)
  assert.equal(isSnapshotPath("d:/TEMP/comparisons/compare-uuid/working-copy/A.java", "D:\\temp", "compare-uuid"), true)
  assert.equal(isSnapshotPath("D:/temp-other/comparisons/compare-uuid/A.java", "D:/temp"), false)
  assert.equal(parentPath("/project/A.java"), "/project")
  assert.equal(parentPath("C:\\A.java"), "C:/")
  assert.equal(parentPath("\\\\server\\share\\project\\A.java"), "//server/share/project")
})

test("directory refresh preserves stable identities, includes deep files, and propagates read failure", async () => {
  const root = await mkdtemp(join(tmpdir(),"lusiad-editor-"))
  try {
    await writeFile(join(root,"B.java"),"class B {}")
    const first = await readDirectoryTree(root)
    await writeFile(join(root,"A.java"),"class A {}")
    const second = await readDirectoryTree(root)
    assert.equal(first[0].id, second.find(node=>node.name === "B.java")?.id)
    const deep = join(root,...Array(12).fill("sub"))
    await mkdir(deep,{recursive:true}); await writeFile(join(deep,"Deep.java"),"class Deep {}")
    assert.ok(treeFiles(await readDirectoryTree(root)).has(pathKey(join(deep,"Deep.java"))))
    await assert.rejects(()=>readDirectoryTree(join(root,"missing")),{code:"ENOENT"})
  } finally { await rm(root,{recursive:true,force:true}) }
})
