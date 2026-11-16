export interface ProjectListItem { id: number; name: string; description: string | null; path: string }
export interface ProjectCreateState { error: string | null }

const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
/** Registry fields only: never read source files or interpret paths while filtering. */
export function filterProjects(projects: ProjectListItem[], query: string): ProjectListItem[] {
  const terms = searchable(query).trim().split(/\s+/).filter(Boolean)
  return terms.length ? projects.filter(project => {
    const text = searchable(`${project.name}\n${project.description ?? ''}\n${project.path}`)
    return terms.every(term => text.includes(term))
  }) : projects
}

export function projectPreviewKey(project: ProjectListItem, locale: string, refresh: number): string {
  return JSON.stringify([project.id, project.path, project.name, project.description, locale, refresh])
}
