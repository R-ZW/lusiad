import type { SimpleGit } from "simple-git"

/** symbolic-ref also works before the first commit; branchLocal does not. */
export async function readRepositoryBranch(git: Pick<SimpleGit, "raw">): Promise<string> {
  const name = (await git.raw(["symbolic-ref", "--quiet", "--short", "HEAD"])).trim()
  if (!name) throw new Error("Git não possui uma branch atual; selecione uma branch antes de continuar")
  return name
}

export function resolveRecordedBranch<T extends { name: string; selected: string }>(branches: T[], gitBranch: string): T | null {
  const selected = branches.find((branch) => branch.selected === "1")
  if (selected && selected.name !== gitBranch) {
    throw new Error(`A branch selecionada no Lusiad (${selected.name}) difere da branch Git (${gitBranch}). Corrija essa divergência antes de commitar; o histórico existente foi preservado.`)
  }
  return selected ?? branches.find((branch) => branch.name === gitBranch) ?? null
}
