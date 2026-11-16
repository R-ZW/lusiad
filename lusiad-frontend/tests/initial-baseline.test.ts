import assert from "node:assert/strict"
import test from "node:test"
import { reconstructInitialBaseline, type BaselineEvent } from "../src/lib/services/restore/initial-baseline.ts"
import { textHash } from "../src/lib/services/commit-menu/git-operation.ts"

const root = "D:/owned/project"
const event = (id: number, kind: string, req_body: unknown, scope = "dir"): BaselineEvent => ({ id, change_type: kind, scope, req_body })
const edit = (id: number, path: string, beforeText: string, afterText: string) => event(id, "update", {
  path, beforeText, afterText, beforeHash: textHash(beforeText), afterHash: textHash(afterText), recordVersion: 2,
}, "file")
const files = (entries: Record<string, string>) => new Map(Object.entries(entries).map(([path, text]) => [path, Buffer.from(text)]))

test("legacy root preserves unchanged files and exact preimages through CRLF, repeated text, rename and move", () => {
  const before = 'class A { String x = "olá\\path"; int x1; int x2; }\n'
  const after = before.replace("int x2;", "int value;")
  const result = reconstructInitialBaseline(root, files({ "folder/B.java": after.replace(/\n/g, "\r\n"), "README.md": "existing" }), [
    edit(1, "A.java", before, after),
    event(2, "file_rename", { path: "D:\\OWNED\\project\\a.java", name: "B.java" }),
    event(3, "file_move", { sourcePath: "B.java", destPath: "folder" }),
  ])
  assert.equal(result.files.get("A.java")?.toString(), before)
  assert.equal(result.files.get("README.md")?.toString(), "existing")
  assert.equal(result.files.size, 2)
})

test("files created, edited and deleted in the first commit produce a truly empty baseline", () => {
  const result = reconstructInitialBaseline(root, new Map(), [
    event(1, "file_create", { path: "", name: "First.java" }),
    edit(2, "First.java", "", "class First {}\n"),
    event(3, "file_delete", { path: "First.java" }),
  ])
  assert.equal(result.files.size, 0)
  // Legacy v1 is also safe if the file was explicitly created inside this batch.
  assert.equal(reconstructInitialBaseline(root, files({ "New.java": "class New {}" }), [
    event(1, "file_create", { path: "", name: "New.java" }), event(2, "create", { path: "New.java", content: "class New {}" }, "file"),
  ]).files.size, 0)
})

test("missing legacy evidence, corrupt hashes and divergent snapshots are errors, never invented empty files", () => {
  assert.throws(() => reconstructInitialBaseline(root, new Map(), [event(1, "file_delete", { path: "Lost.java" })]), /preimage unavailable/)
  assert.throws(() => reconstructInitialBaseline(root, files({ "Old.java": "after" }), [event(1, "update", { path: "Old.java" }, "file")]), /preimage unavailable/)
  assert.throws(() => reconstructInitialBaseline(root, files({ "A.java": "other" }), [edit(1, "A.java", "before", "after")]), /differs/)
  const corrupt = edit(1, "A.java", "before", "after"); (corrupt.req_body as Record<string, unknown>).beforeHash = "wrong"
  assert.throws(() => reconstructInitialBaseline(root, files({ "A.java": "after" }), [corrupt]), /hashes/)
})

test("external root snapshots restore original binary bytes and reject escaped historical paths", () => {
  const original = Buffer.from([0, 255, 13, 10])
  const result = reconstructInitialBaseline(root, files({ "binary.dat": "after", "New.java": "class New {}" }), [event(1, "external_bundle", {}, "project")], [
    { change_id: 1, path: "binary.dat", before_kind: "file", before_content: original },
    { change_id: 1, path: "New.java", before_kind: null, before_content: null },
    { change_id: 1, path: "empty-folder", before_kind: "directory", before_content: null },
  ])
  assert.equal(result.directories.has("empty-folder"), true)
  assert.deepEqual(result.files.get("binary.dat"), original); assert.equal(result.files.has("New.java"), false)
  assert.throws(() => reconstructInitialBaseline(root, new Map(), [event(1, "file_create", { path: "../outside", name: "x" })]), /Cannot reconstruct/)
  assert.throws(() => reconstructInitialBaseline(root, new Map(), [event(1, "file_create", { path: ".git", name: "config" })]), /metadata/)
  assert.throws(() => reconstructInitialBaseline(root, new Map(), [event(1, "unknown_create", { path: "", name: "x" })]), /Unsupported/)
})


test("explicit directory operations retain empty parents and distinguish nonrecursive deletion from unknown recursive contents", () => {
  const baseline = reconstructInitialBaseline(root, new Map(), [
    event(1, "file_create", { path: "existing", name: "Temporary.java" }),
    event(2, "file_delete", { path: "existing/Temporary.java" }),
    event(3, "dir_rename", { path: "empty-old", name: "empty-new" }),
    event(4, "dir_delete", { path: "empty-new", recursive: false }),
  ])
  assert.equal(baseline.files.size, 0)
  assert.deepEqual([...baseline.directories].sort(), ["empty-old", "existing"])
  assert.throws(() => reconstructInitialBaseline(root, new Map(), [event(1, "dir_delete", { path: "lost", recursive: true })]), /preimage unavailable/)
})
