import { execFile } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { access, lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { resolve, join } from "node:path"
import { containedPath } from "../contained-paths.ts"
import { promisify } from "node:util"
import { GIT_STAGE_PATHSPEC } from "../external-sync/external-sync.model.ts"
import { BackendApiError } from "../backend-response.ts"

const execute = promisify(execFile)
export const textHash = (text: string) => createHash("sha256").update(text).digest("hex")
export const canonicalText = (text: string) => text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")

/** Only deliberately public validation messages may cross the action boundary. */
export class GitValidationError extends BackendApiError {
  constructor(message: string) { super("Git", message, "operation_failed", 409) }
}
export class GitPendingError extends BackendApiError {
  readonly operationId: string
  readonly originalCause: unknown
  constructor(operationId: string, cause: unknown) {
    super("Git", operationId, "git_pending", 409)
    this.message = `Operação Git ${operationId} sem confirmação; reabra o menu de commit para recuperar.`
    this.operationId = operationId; this.originalCause = cause
  }
}

export interface GitPlan {
  version: 1
  id: string
  kind: "commit" | "branch" | "merge" | "initialize" | "restore"
  ref: string
  sourceRef: string
  before: string | null
  source: string | null
  sha: string
  tree: string
  originalIndex: string
  restoreSource?: string
}

/** Frozen tree + compare-and-swap refs. No working-tree checkout/reset and no staging on status. */
export class GitOperation {
  readonly root: string
  readonly env: NodeJS.ProcessEnv
  constructor(root: string, env: NodeJS.ProcessEnv) { this.root = root; this.env = env }

  async git(args: string[], extra: Partial<NodeJS.ProcessEnv> = {}): Promise<string> {
    const { stdout } = await execute("git", ["-C", this.root, ...args], {
      env: { ...this.env, ...extra }, encoding: "utf8", windowsHide: true,
      timeout: 30000, maxBuffer: 64 * 1024 * 1024,
    })
    return stdout
  }

  async headRef(): Promise<string> { return (await this.git(["symbolic-ref", "--quiet", "HEAD"])).trim() }
  async bytes(args: string[]): Promise<Buffer> {
    const { stdout } = await execute("git", ["-C", this.root, ...args], { env: this.env,
      encoding: "buffer", windowsHide: true, timeout: 30000, maxBuffer: 64 * 1024 * 1024 })
    return stdout
  }
  async contentObject(path: string, content: Buffer): Promise<string> {
    // Match Git's actual clean/CRLF policy without writing another file or object.
    const request = execute("git", ["-C", this.root, "hash-object", `--path=${path}`, "--stdin"], {
      env: this.env, encoding: "utf8", windowsHide: true, timeout: 30000,
    })
    request.child.stdin!.on("error", () => {}) // The exec promise reports a failed/exited Git process.
    request.child.stdin!.end(content)
    return (await request).stdout.trim()
  }
  async ref(ref: string): Promise<string | null> {
    try { return (await this.git(["rev-parse", "--verify", ref])).trim() }
    catch { // Distinguish a missing ref from an inaccessible/broken repository.
      await this.git(["rev-parse", "--git-dir"])
      if ((await this.git(["show-ref", "--head"]).catch((e) => {
        if (e.code === 1) return ""
        throw e
      })).split("\n").some((line) => line.endsWith(` ${ref}`))) throw new GitValidationError("Referência Git inválida")
      return null
    }
  }
  async gitPath(name: string): Promise<string> {
    return resolve(this.root, (await this.git(["rev-parse", "--git-path", name])).trim())
  }
  async indexHash(): Promise<string> {
    try { return createHash("sha256").update(await readFile(await this.gitPath("index"))).digest("hex") }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return "absent"; throw e }
  }
  async privateIndex(id: string): Promise<string> {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new GitValidationError("Identificador de operação inválido")
    const directory = await this.gitPath("lusiad-operations")
    await mkdir(directory, { recursive: true })
    if ((await lstat(directory)).isSymbolicLink()) throw new GitValidationError("Diretório de operação Git não pode ser link")
    const index = join(directory, `${id}.index`)
    for (const file of [index, index + ".message"]) {
      try { if ((await lstat(file)).isSymbolicLink()) throw new GitValidationError("Arquivo de operação Git não pode ser link") }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e }
    }
    return index
  }
  async assertClean(): Promise<void> {
    // GIT_OPTIONAL_LOCKS=0 deliberately leaves the shared index untouched.
    // Porcelain status can report a stat-only modification even when Git's
    // clean-filtered file content still matches the index. Compare the actual
    // content and staged tree instead of treating that cache miss as an edit.
    const differs = async (args: string[]) => this.git(args).then(() => false, (error: unknown) => {
      if ((error as { code?: number }).code === 1) return true
      throw error
    })
    if (await differs(["diff", "--quiet", "--no-ext-diff", "--no-textconv", "--"])
      || await differs(["diff", "--cached", "--quiet", "--no-ext-diff", "--no-textconv", "HEAD", "--"])
      || (await this.git(["ls-files", "--others", "--exclude-standard", "-z"])).length)
      throw new GitValidationError("Conclua as mudanças pendentes antes desta operação Git")
  }
  /** Freeze a reconstructed project without staging or changing the real worktree. */
  async treeFromSnapshot(snapshotRoot: string): Promise<string> {
    const id = randomUUID(), index = await this.privateIndex(id)
    try {
      await this.git(["read-tree", "--empty"], { GIT_INDEX_FILE: index })
      const gitDir = (await this.git(["rev-parse", "--absolute-git-dir"])).trim()
      await execute("git", ["-C", snapshotRoot, `--git-dir=${gitDir}`, `--work-tree=${snapshotRoot}`,
        "add", "--all", "--force"], {
        env: { ...this.env, GIT_INDEX_FILE: index }, encoding: "utf8", windowsHide: true,
        timeout: 30000, maxBuffer: 64 * 1024 * 1024,
      })
      return (await this.git(["write-tree"], { GIT_INDEX_FILE: index })).trim()
    } finally { await this.cleanup(id) }
  }
  async plan(id: string, kind: GitPlan["kind"], title: string, description: string | null, target?: string): Promise<GitPlan> {
    const actualRoot = await realpath((await this.git(["rev-parse", "--show-toplevel"])).trim())
    const authorizedRoot = await realpath(this.root)
    if (process.platform === "win32" ? actualRoot.toLowerCase() !== authorizedRoot.toLowerCase() : actualRoot !== authorizedRoot)
      throw new GitValidationError("O repositório Git não corresponde à raiz deste projeto")
    if ((await this.git(["ls-files", "--unmerged"])).trim()) throw new GitValidationError("Resolva os conflitos Git antes de continuar")
    for (const state of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"]) {
      const exists = await access(await this.gitPath(state)).then(() => true, (e) => { if (e.code === "ENOENT") return false; throw e })
      if (exists) throw new GitValidationError("Conclua ou cancele a integração Git em andamento antes de continuar")
    }
    const sourceRef = await this.headRef(), source = await this.ref(sourceRef)
    const ref = kind === "commit" || kind === "initialize" || kind === "restore" ? sourceRef : `refs/heads/${target}`
    await this.git(["check-ref-format", ref])
    const before = await this.ref(ref)
    if (kind === "branch" && before) throw new GitValidationError("Já existe uma branch Git com este nome")
    if (kind === "initialize" && source) throw new GitValidationError("O repositório já possui uma versão inicial")
    if (kind === "restore") {
      if (!source || !target || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(target)) throw new GitValidationError("Commit de origem inválido")
      await this.assertClean()
    }
    if (kind === "branch" || kind === "merge") {
      if (!source || (kind === "merge" && !before)) throw new GitValidationError("Branch sem commit ou base Git inexistente")
      await this.assertClean()
    }
    if (kind === "merge") await this.git(["merge-base", "--is-ancestor", before!, source!])
    const index = await this.privateIndex(id), extra = { GIT_INDEX_FILE: index }
    const originalIndex = await this.indexHash()
    try {
      await this.git(kind === "restore" ? ["read-tree", target!] : source ? ["read-tree", source] : ["read-tree", "--empty"], extra)
      if (kind === "commit" || kind === "initialize") await this.git(["add", ...GIT_STAGE_PATHSPEC], extra)
      // Run normal local validation hooks against the private index. A rejection publishes nothing.
      await this.git(["hook", "run", "--ignore-missing", "pre-commit"], extra)
      const messagePath = index + ".message"
      await writeFile(messagePath, `${title}\n${description ? `\n${description}\n` : ""}`, "utf8")
      await this.git(["hook", "run", "--ignore-missing", "prepare-commit-msg", "--", messagePath, "message"], extra)
      await this.git(["hook", "run", "--ignore-missing", "commit-msg", "--", messagePath], extra)
      const tree = (await this.git(["write-tree"], extra)).trim()
      if (kind === "restore" && tree !== (await this.git(["rev-parse", `${target}^{tree}`])).trim())
        throw new GitValidationError("Hook alterou o snapshot da restauração")
      if ((kind === "branch" || kind === "merge") && tree !== (await this.git(["rev-parse", `${source}^{tree}`])).trim())
        throw new GitValidationError("Hook alterou o snapshot da operação de branch")
      const parents = kind === "merge" ? [...new Set([before!, source!])] : source ? [source] : []
      const sign = await this.git(["config", "--bool", "--get", "commit.gpgsign"]).catch((e) => { if (e.code === 1) return ""; throw e })
      const sha = (await this.git(["commit-tree", tree, ...parents.flatMap((p) => ["-p", p]),
        ...(sign.trim() === "true" ? ["-S"] : []), "-F", messagePath])).trim()
      await rm(messagePath, { force: true })
      return { version: 1, id, kind, ref, sourceRef, before, source, sha, tree, originalIndex,
        ...(kind === "restore" ? { restoreSource: target } : {}) }
    } catch (e) { await this.cleanup(id); throw e }
  }
  async verify(plan: GitPlan): Promise<void> {
    const sha = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/
    if (plan.version !== 1 || !["commit", "branch", "merge", "initialize", "restore"].includes(plan.kind)
      || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(plan.id)
      || typeof plan.ref !== "string" || !plan.ref.startsWith("refs/heads/")
      || typeof plan.sourceRef !== "string" || !plan.sourceRef.startsWith("refs/heads/")
      || ![plan.sha, plan.tree].every((value) => typeof value === "string" && sha.test(value))
      || ![plan.before, plan.source].every((value) => value === null || (typeof value === "string" && sha.test(value))))
      throw new GitValidationError("Contrato da intenção Git inválido")
    if (plan.kind === "initialize" && (plan.source !== null || plan.before !== null || plan.ref !== plan.sourceRef))
      throw new GitValidationError("Base inicial deve ser um commit raiz na branch atual")
    if (plan.kind === "restore" && (!plan.source || !plan.restoreSource || !sha.test(plan.restoreSource)
      || plan.ref !== plan.sourceRef || plan.tree !== (await this.git(["rev-parse", `${plan.restoreSource}^{tree}`])).trim()))
      throw new GitValidationError("Snapshot de restauração diverge da origem")
    await this.git(["check-ref-format", plan.ref]); await this.git(["check-ref-format", plan.sourceRef])
    if ((await this.git(["rev-parse", `${plan.sha}^{tree}`])).trim() !== plan.tree) throw new GitValidationError("Objeto Git diverge da intenção")
    const parents = (await this.git(["show", "-s", "--format=%P", plan.sha])).trim().split(" ").filter(Boolean)
    const expected = plan.kind === "merge" ? [...new Set([plan.before!, plan.source!])] : plan.source ? [plan.source] : []
    if (parents.join(" ") !== expected.join(" ")) throw new GitValidationError("Pais Git divergem da intenção")
  }
  async publish(plan: GitPlan): Promise<void> {
    await this.verify(plan)
    const current = await this.ref(plan.ref)
    if (current !== plan.sha) {
      if (current !== plan.before || await this.headRef() !== plan.sourceRef || await this.ref(plan.sourceRef) !== plan.source)
        throw new GitValidationError("Referências Git mudaram; operação preservada para inspeção")
      if (plan.kind === "restore") await this.restoreWorktree(plan, true)
      await this.git(["update-ref", plan.ref, plan.sha, plan.before ?? "0".repeat(plan.sha.length)])
    }
    const head = await this.headRef()
    if (head !== plan.ref) {
      if (head !== plan.sourceRef || await this.ref(plan.sourceRef) !== plan.source) throw new GitValidationError("HEAD mudou durante recuperação")
      await this.git(["symbolic-ref", "HEAD", plan.ref])
    }
    // Branch/merge keep the same source tree. Commit installs its private index only
    // when no external process changed the real one; never destroy staged user work.
    if (plan.kind === "restore") {
      await this.restoreWorktree(plan)
      return
    }
    if (plan.kind === "commit" || plan.kind === "initialize") {
      const actual = await this.indexHash()
      const index = await this.privateIndex(plan.id)
      // Rebuild after a process restart if the disposable private index disappeared.
      try { await readFile(index) } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
        await this.git(["read-tree", plan.sha], { GIT_INDEX_FILE: index })
      }
      const desired = await readFile(index)
      if (actual === createHash("sha256").update(desired).digest("hex")) return
      // A restarted recovery can rebuild an equivalent index with different stat
      // caches. Semantic equality is sufficient and preserves those caches.
      if (await this.git(["diff-index", "--cached", "--quiet", plan.sha, "--"]).then(() => true, (e) => {
        if (e.code === 1) return false
        throw e
      })) return
      const lock = await this.gitPath("index.lock"), destination = await this.gitPath("index")
      const handle = await open(lock, "wx")
      try {
        if (await this.indexHash() !== plan.originalIndex) throw new GitValidationError("Índice Git alterado; preserve a seleção e revise a operação pendente")
        await handle.writeFile(desired); await handle.sync(); await handle.close()
        await rename(lock, destination)
      } finally { await handle.close().catch(() => {}); await rm(lock, { force: true }) }
    }
  }
  private async treeFiles(ref: string): Promise<Map<string, { mode: string; sha: string }>> {
    const files = new Map<string, { mode: string; sha: string }>()
    for (const row of (await this.git(["ls-tree", "-r", "-z", ref])).split("\0").filter(Boolean)) {
      const match = /^(100644|100755) blob ([a-f0-9]+)\t(.+)$/.exec(row)
      if (!match) throw new GitValidationError("Snapshot contém link, submódulo ou entrada inválida")
      containedPath(this.root, match[3])
      files.set(match[3], { mode: match[1], sha: match[2] })
    }
    return files
  }
  private async restoreWorktree(plan: GitPlan, validateOnly = false): Promise<void> {
    const old = await this.treeFiles(plan.source!), target = await this.treeFiles(plan.sha)
    const changed = new Set([...old.keys(), ...target.keys()].filter(path =>
      old.get(path)?.sha !== target.get(path)?.sha || old.get(path)?.mode !== target.get(path)?.mode))
    const indexTree = (await this.git(["write-tree"])).trim()
    const oldTree = (await this.git(["rev-parse", `${plan.source}^{tree}`])).trim()
    if (indexTree !== oldTree && indexTree !== plan.tree) {
      // A failed checkout can leave a mixed index. Recover only entries from the two
      // frozen trees; an unrelated staged edit is never overwritten.
      const staged = new Map<string, { mode: string; sha: string }>()
      for (const row of (await this.git(["ls-files", "--stage", "-z"])).split("\0").filter(Boolean)) {
        const match = /^(100644|100755) ([a-f0-9]+) 0\t(.+)$/.exec(row)
        if (!match || staged.has(match[3])) throw new GitValidationError("Índice Git contém conflitos ou mudanças alheias à restauração")
        staged.set(match[3], { mode: match[1], sha: match[2] })
      }
      for (const path of new Set([...old.keys(), ...target.keys(), ...staged.keys()])) {
        const item = staged.get(path), before = old.get(path), after = target.get(path)
        const matches = (other?: { mode: string; sha: string }) => item?.mode === other?.mode && item?.sha === other?.sha
        if (!matches(before) && !matches(after)) throw new GitValidationError("Índice Git contém mudanças alheias à restauração")
      }
    }
    for (const path of new Set([...old.keys(), ...target.keys()])) {
      const file = containedPath(this.root, path)
      let actual: string | null
      try {
        const stat = await lstat(file)
        if (!stat.isFile()) throw new GitValidationError(`Caminho foi alterado externamente: ${path}`)
        actual = await this.contentObject(path, await readFile(file))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        actual = null
      }
      if (changed.has(path) ? actual !== (old.get(path)?.sha ?? null) && actual !== (target.get(path)?.sha ?? null)
        : actual !== (old.get(path)?.sha ?? null)) throw new GitValidationError(`Arquivo alterado durante a restauração: ${path}`)
    }
    const untracked = (await this.git(["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean)
    if (untracked.some(path => !changed.has(path)))
      throw new GitValidationError("Há arquivos não registrados no projeto; sincronize antes de restaurar")
    if (validateOnly) return
    if (changed.size && (await this.ref(plan.ref)) === plan.sha) await this.git(["reset", "--hard", plan.sha])
    if ((await this.git(["write-tree"])).trim() !== plan.tree) throw new GitValidationError("Índice Git não corresponde ao commit restaurado")
    await this.assertClean()
  }
  async cleanup(id: string): Promise<void> {
    const index = await this.privateIndex(id)
    await rm(index, { force: true }); await rm(index + ".message", { force: true })
  }
}
