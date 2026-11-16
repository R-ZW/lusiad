import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { compareGitSources, countGitSourceLines, gitCommand, readGitComparisonRefs, readGitJavaSnapshot } from "../src/lib/services/model-comparison/git-snapshot.ts"

test("Git unified hunks preserve real source and agree with line statistics for edits, additions and deletions", async () => {
  const sources = [
    { before: 'class Cálculo {\n    String text = "base";\n}\n', after: 'class Cálculo {\n    String text = "alvo";\n}\n' },
    { before: null, after: 'class Added {}\n' },
    { before: 'class Removed {}', after: null },
    { before: 'class Same {}\n', after: 'class Same {}\n' },
    { before: '', after: '' },
  ]
  for (const { before, after } of sources) {
    const diff = await compareGitSources(before, after)
    const lines = diff.hunks.split("\n")
    assert.equal(lines.filter((line) => line.startsWith("+")).length, diff.addedLines)
    assert.equal(lines.filter((line) => line.startsWith("-")).length, diff.removedLines)
    assert.equal(diff.hunks.includes("before.java"), false)
    assert.equal(diff.hunks.includes("after.java"), false)
    if ((before ?? "") === (after ?? "")) assert.equal(diff.hunks, "")
    else assert.match(diff.hunks, /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/)
    if (before?.includes('"base"')) {
      assert.ok(diff.hunks.includes('-    String text = "base";'))
      assert.ok(diff.hunks.includes('+    String text = "alvo";'))
      assert.ok(diff.hunks.includes(' class Cálculo {'))
    }
    if (before && !before.endsWith("\n")) assert.ok(diff.hunks.includes("\\ No newline at end of file"))
  }
})

test("Git line counts include edits in existing files, file creation/deletion and real blank lines", async () => {
  const cases = [
    { before: "int value = 1;\nreturn value;\n", after: "int value = 2;\nreturn value;\n", addedLines: 1, removedLines: 1 },
    { before: null, after: "class Cálculo {\n}\n", addedLines: 2, removedLines: 0 },
    { before: "class Removed {}", after: null, addedLines: 0, removedLines: 1 },
    { before: "same\n", after: "same\n", addedLines: 0, removedLines: 0 },
    { before: null, after: "", addedLines: 0, removedLines: 0 },
    { before: "", after: "\n", addedLines: 1, removedLines: 0 },
  ]
  for (const { before, after, addedLines, removedLines } of cases) {
    assert.deepEqual(await countGitSourceLines(before, after), { addedLines, removedLines })
    assert.deepEqual(await countGitSourceLines(after, before), { addedLines: removedLines, removedLines: addedLines })
  }
})

test("Git counts a small edit in a large snapshot without counting the entire file", async () => {
  const lines = Array.from({ length: 600 }, (_, index) => `int value${index} = ${index};`)
  const before = `${lines.join("\n")}\n`
  lines[300] = "int value300 = -1;"
  assert.deepEqual(await countGitSourceLines(before, `${lines.join("\n")}\n`), { addedLines: 1, removedLines: 1 })
})

test("two committed Git trees yield real Java sources without touching the working tree", async () => {
  const root = await mkdtemp(join(tmpdir(), "lusiad-model-diff-"))
  try {
    await gitCommand(root, ["init", "-b", "main"])
    await gitCommand(root, ["config", "user.name", "Lusiad Test"])
    await gitCommand(root, ["config", "user.email", "test@example.invalid"])
    await mkdir(join(root, "src"))
    await writeFile(join(root, "src", "Calculator.java"), "class Calculator { int value = 1; }\n")
    await writeFile(join(root, "README.md"), "not a Java model\n")
    await gitCommand(root, ["add", "."])
    await gitCommand(root, ["commit", "-m", "first"])
    const first = (await gitCommand(root, ["rev-parse", "HEAD"])).trim()
    await gitCommand(root, ["tag", "demo-v1"])
    await gitCommand(root, ["tag", "-a", "versão-1", "-m", "Annotated version"])
    await gitCommand(root, ["branch", "demo/v1"])

    await writeFile(join(root, "src", "Calculator.java"), "class Calculator { int value = 2; }\n")
    await writeFile(join(root, "src", "Extra.java"), "class Extra {}\n")
    await writeFile(join(root, "src", "Cálculo.java"), "class Cálculo {}\n")
    await gitCommand(root, ["add", "."])
    await gitCommand(root, ["commit", "-m", "second"])
    const second = (await gitCommand(root, ["rev-parse", "HEAD"])).trim()

    const base = await readGitJavaSnapshot(root, first)
    const target = await readGitJavaSnapshot(root, second)
    assert.equal(base.get("src/Calculator.java"), "class Calculator { int value = 1; }\n")
    assert.equal(base.has("README.md"), false)
    assert.equal(base.has("src/Extra.java"), false)
    assert.equal(target.get("src/Calculator.java"), "class Calculator { int value = 2; }\n")
    assert.equal(target.get("src/Extra.java"), "class Extra {}\n")
    assert.equal(target.get("src/Cálculo.java"), "class Cálculo {}\n")
    assert.deepEqual(await countGitSourceLines(base.get("src/Calculator.java")!, target.get("src/Calculator.java")!),
      { addedLines: 1, removedLines: 1 })
    assert.equal((await gitCommand(root, ["rev-parse", "refs/tags/demo-v1^{commit}"])).trim(), first)
    const refs = await readGitComparisonRefs(root, "all")
    assert.equal(refs.find((option) => option.value === "branch:main")?.sha, second)
    assert.equal(refs.find((option) => option.value === "branch:demo/v1")?.sha, first)
    assert.equal(refs.find((option) => option.value === "tag:demo-v1")?.sha, first)
    assert.equal(refs.find((option) => option.value === "tag:versão-1")?.sha, first)
    assert.ok(refs.every((option) => option.timestamp))
    assert.ok((await readGitComparisonRefs(root, "tag")).every((option) => option.kind === "tag"))
    assert.ok((await readGitComparisonRefs(root, "branch")).every((option) => option.kind === "branch"))
    assert.equal((await gitCommand(root, ["status", "--porcelain"])).trim(), "")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
