import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  insertProject,
  listProjects,
  setProjectTempPath,
  type ProjectRow,
} from '@/lib/repositories/track-control/track-control.repository'
import { createProjectTempDirectories } from '@/lib/services/project-temp/project-temp.service'
import { getServerI18n } from '@/lib/i18n/server'
import { Header } from '@/components/header'
import { ProjectsHome } from '@/components/projects/projects-home'
import type { ProjectCreateState } from '@/lib/models/projects-overview'

// Projects are live database state; builds must not query a working database.
export const dynamic = 'force-dynamic'

async function createProjectAction(_previous: ProjectCreateState, formData: FormData): Promise<ProjectCreateState> {
  'use server'

  const { t } = await getServerI18n()
  const name = String(formData.get('name') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const path = String(formData.get('path') ?? '').trim()

  if (!path) {
    return { error: t('projects.pathRequired') }
  }

  let project: ProjectRow | undefined
  try {
    project = await insertProject({
      name: name || undefined,
      description: description || null,
      path,
    })

    const tempPath = await createProjectTempDirectories(project.id)
    await setProjectTempPath(project.id, tempPath)

  } catch {
    if (project) revalidatePath('/')
    return { error: t(project ? 'projects.overview.preparationError' : 'projects.overview.createError') }
  }
  revalidatePath('/')
  redirect(`/project/${project.id}`)
}

export default async function HomePage() {
  const projects = await listProjects()
  return <div className="flex h-dvh flex-col overflow-hidden"><Header /><main data-testid="projects-page" className="min-h-0 flex-1 overflow-hidden px-3 py-4 text-foreground sm:px-6">
    <div className="mx-auto flex h-full min-h-0 max-w-[90rem] flex-col gap-4">
      <ProjectsHome projects={projects.map(({ id, name, description, path }) => ({ id, name: String(name ?? '').trim(), description, path }))} createAction={createProjectAction} />
    </div>
  </main></div>
}
