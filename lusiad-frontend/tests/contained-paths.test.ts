import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { assertPathName, relativeContained, containedPath, assertSeparateRoots, assertContainedTree, normalizeHistoricalPaths } from "../src/lib/services/contained-paths.ts"
import { validateGitArchivePaths } from "../src/lib/config/test-git.ts"

test("contained roots support Windows drive roots, case, separators, UNC and legacy absolute paths", () => {
  assert.equal(relativeContained("D:/User/Project", "d:\\user\\project\\src\\Árvore.java"), "src/Árvore.java")
  assert.equal(relativeContained("D:/User/Project", "d:/user/project/", true), "")
  assert.equal(relativeContained("D:/", "d:/src/X.java"), "src/X.java")
  assert.equal(relativeContained("//Server/Share/Project", "\\\\server\\share\\project\\X.java"), "X.java")
  assert.equal(relativeContained("/project", "./src//X.java"), "src/X.java")
  assert.deepEqual(normalizeHistoricalPaths("D:/project", { path: "d:/project", sourcePath: "D:\\project\\X.java", destPath: "src" }),
    { path: "", sourcePath: "X.java", destPath: "src" })
  for (const path of ["D:/project-other/X.java", "D:/other/X.java", "../X.java", "src/../X.java", "C:foo", "/Windows/x", "//?/D:/project/X.java", "src/X.java:stream", "NUL.java", "src./X.java", "src /X.java", "x\0.java"]) {
    assert.throws(() => relativeContained("D:/project", path), path)
  }
  assert.throws(() => relativeContained("D:/project", ""))
  assert.throws(() => relativeContained("/project", "D:/outside.java"))
  for (const name of ["../x", "src/x", "x\\y", ".", "..", "con", "x:stream"]) assert.throws(() => assertPathName(name))
})

test("physical containment refuses internal junctions before reads/writes/recursive copies, accepts registered root alias", () => {
  const fixture = mkdtempSync(join(tmpdir(), "lusiad-path-boundary-"))
  try {
    const live = join(fixture, "project"), temp = join(fixture, "temporary"), outside = join(fixture, "outside")
    for (const path of [live, temp, outside]) mkdirSync(path)
    writeFileSync(join(outside, "X.java"), "untouched")
    writeFileSync(join(live, "Árvore.java"), "class Árvore {}")
    assert.equal(containedPath(live, "new/deep/X.java"), join(live, "new/deep/X.java"))
    if (process.platform === "win32") assert.equal(containedPath(live.toUpperCase(), "árvore.java").toLowerCase(), join(live, "Árvore.java").toLowerCase())
    assert.throws(() => containedPath(live, join(outside, "X.java")))
    const link = join(live, "redirect"), alias = join(fixture, "registered-alias")
    symlinkSync(outside, link, "junction"); symlinkSync(outside, alias, "junction")
    assert.throws(() => containedPath(live, "redirect/X.java"))
    assert.throws(() => containedPath(live, "redirect/new/X.java"))
    assert.throws(() => assertContainedTree(live))
    assert.equal(containedPath(alias, "X.java"), join(alias, "X.java"))
    assertSeparateRoots(live, temp)
    assert.throws(() => assertSeparateRoots(alias, outside))
    assert.throws(() => assertSeparateRoots(live, join(live, "temp")))
    assert.throws(() => assertSeparateRoots(live, fixture))
    symlinkSync(outside, join(temp, "working-copy"), "junction")
    assert.throws(() => containedPath(temp, "working-copy/X.java"))
    assert.equal(readFileSync(join(outside, "X.java"), "utf8"), "untouched")
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test("normal Git snapshot validation refuses links, submodules and platform escapes before extraction", () => {
  const root = process.platform === "win32" ? "D:/project" : "/project"
  validateGitArchivePaths(root, "100644 blob abc\tsrc/Árvore.java\0" + "100755 blob def\tREADME.md\0")
  for (const entry of ["120000 blob abc\tlink", "160000 commit abc\tmodule", "100644 blob abc\t../outside", "100644 blob abc\tD:/outside", "100644 blob abc\t/absolute", "100644 blob abc\tNUL.java", "100644 blob abc\tsrc/../../outside"]) {
    assert.throws(() => validateGitArchivePaths(root, `${entry}\0`), entry)
  }
})
