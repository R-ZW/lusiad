export type ComparisonRefKind = "change" | "commit" | "sha" | "branch" | "tag" | "version" | "empty"
export type ComparisonFilter = "all" | "commit" | "change" | "branch" | "tag"
export const COMPARISON_PAGE_SIZE = 30

export interface ComparisonOption {
  value: string
  label: string
  kind: ComparisonRefKind
  timestamp?: string
  branchName?: string
  commitId?: number
  sha?: string
  filePath?: string
  changeType?: string
  changeBody?: unknown
  targetRef?: string
}

export interface ComparisonSearchRequest {
  query?: string
  kind?: ComparisonFilter
  offset?: number
}

export interface ComparisonOptionPage {
  options: ComparisonOption[]
  nextOffset: number | null
}

export interface ComparisonChangeContext {
  projectId: number
  commitId: number
  changeType: string
}

export interface ExternalComparisonNotice {
  side: "base" | "target"
  changeId: number
  commitId: number
}

/** External bundles represent a commit boundary, never a separately replayed state. */
export async function resolveComparisonReference(projectId: number, value: string,
  findChange: (changeId: number) => Promise<ComparisonChangeContext | null>,
  findVersion?: (tagId: number) => Promise<{ projectId: number; value: string } | null>): Promise<{
    value: string; externalChange?: { changeId: number; commitId: number }
  }> {
  const ref = parseComparisonRef(value)
  const normalizedValue = ref.kind === "empty" ? "empty" : `${ref.kind}:${ref.id}`
  if (ref.kind === "version") {
    const tag = await findVersion?.(Number(ref.id))
    if (!tag || tag.projectId !== projectId || !["commit", "change"].includes(parseComparisonRef(tag.value).kind)) {
      throw new Error("Tag não encontrada neste projeto")
    }
    return resolveComparisonReference(projectId, tag.value, findChange)
  }
  if (ref.kind !== "change") return { value: normalizedValue }
  const changeId = Number(ref.id)
  const context = await findChange(changeId)
  if (!context || context.projectId !== projectId || !Number.isSafeInteger(context.commitId) || context.commitId <= 0) {
    throw new Error("Mudança commitada não encontrada neste projeto")
  }
  return context.changeType === "external_bundle"
    ? { value: `commit:${context.commitId}`, externalChange: { changeId, commitId: context.commitId } }
    : { value: normalizedValue }
}

export function parseComparisonRef(value: string): { kind: ComparisonRefKind; id: string } {
  if (value.trim() === "empty") return { kind: "empty", id: "" }
  const match = /^(change|commit|sha|branch|tag|version):(.+)$/.exec(value.trim())
  if (!match) throw new Error("Use change:ID, commit:ID, sha:HASH, branch:NOME, tag:NOME ou version:ID")
  const kind = match[1] as Exclude<ComparisonRefKind, "empty">
  const id = match[2].trim()
  if (kind === "change" || kind === "commit" || kind === "version") {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new Error("Identificador numérico inválido")
  } else if (kind === "sha") {
    if (!/^[a-fA-F0-9]{7,64}$/.test(id)) throw new Error("SHA inválido")
  } else if (!/^[\p{L}\p{N}_][\p{L}\p{N}\p{M}_./-]*$/u.test(id) || id.includes("..") || id.includes("//") || id.endsWith("/")) {
    throw new Error("Nome de branch ou tag inválido")
  }
  return { kind, id }
}

/** Pasted references use the same grammar as the comparison itself. */
export function directComparisonOption(query: string): ComparisonOption | null {
  const text = query.trim()
  const value = /^[a-fA-F0-9]{7,64}$/.test(text) && /[a-f]/i.test(text) ? `sha:${text}` : text
  try {
    const ref = parseComparisonRef(value)
    return { value: ref.kind === "empty" ? "empty" : `${ref.kind}:${ref.id}`, label: ref.id, kind: ref.kind }
  } catch {
    return null
  }
}

export function normalizeComparisonSearch(request: ComparisonSearchRequest) {
  const query = (request.query ?? "").trim()
  const kind = request.kind ?? "all"
  const offset = request.offset ?? 0
  if (query.length > 200 || !["all", "commit", "change", "branch", "tag"].includes(kind)
    || !Number.isSafeInteger(offset) || offset < 0) throw new Error("Busca de referências inválida")
  const direct = directComparisonOption(query)
  const searchKind = direct?.kind === "sha" ? "commit" : direct?.kind ?? kind
  const text = direct ? parseComparisonRef(direct.value).id : query.replace(/^#(?=\d+$)/, "")
  const isId = !direct || direct.kind === "commit" || direct.kind === "change"
  const exactId = isId && /^[1-9]\d*$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null
  return { query: text, kind: searchKind, offset, exactId, exactRef: direct?.value ?? null }
}

/** Match Git reference names consistently across case and accents. */
export function matchesComparisonOption(option: ComparisonOption, query: string): boolean {
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase()
  const text = normalize([option.value, option.label, option.sha, option.branchName, option.filePath, option.timestamp].join(" "))
  return normalize(query).split(/\s+/).filter(Boolean).every((word) => text.includes(word))
}

/** A page can span the boundary between Git refs and the SQL history. */
export async function pageComparisonOptions(refs: ComparisonOption[], offset: number,
  loadHistory?: (limit: number, offset: number) => Promise<ComparisonOption[]>): Promise<ComparisonOptionPage> {
  const options = refs.slice(offset, offset + COMPARISON_PAGE_SIZE + 1)
  if (loadHistory && options.length < COMPARISON_PAGE_SIZE + 1) {
    options.push(...await loadHistory(COMPARISON_PAGE_SIZE + 1 - options.length, Math.max(0, offset - refs.length)))
  }
  return { options: options.slice(0, COMPARISON_PAGE_SIZE),
    nextOffset: options.length > COMPARISON_PAGE_SIZE ? offset + COMPARISON_PAGE_SIZE : null }
}
