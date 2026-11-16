import assert from "node:assert/strict"
import { cp, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import simpleGit from "simple-git"

test("the Java fixture can be copied to an isolated Git repository", async (context) => {
  const workspace = await mkdtemp(join(tmpdir(), "lusiad-test-"))
  context.after(async () => rm(workspace, { recursive: true, force: true }))

  await cp(join(process.cwd(), "tests", "fixtures", "java", "basic"), workspace, { recursive: true })
  const git = simpleGit(workspace)
  await git.init()
  await git.addConfig("user.name", "Lusiad Tests")
  await git.addConfig("user.email", "tests@lusiad.local")
  await git.add(".")
  await git.commit("fixture baseline")

  const source = await readFile(join(workspace, "src", "main", "java", "example", "Calculator.java"), "utf8")
  const status = await git.status()

  assert.match(source, /class Calculator/)
  assert.equal(status.isClean(), true)
  assert.notEqual(await git.revparse(["HEAD"]), "")
})
