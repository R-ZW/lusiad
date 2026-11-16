import { containedPath, assertSeparateRoots } from "@/lib/services/contained-paths"
import { notFound } from 'next/navigation'
import { findProjectById } from '@/lib/repositories/track-control/track-control.repository'
import { loadFileTree, loadOptionalSnapshotTree } from '@/lib/services/file-explorer/file-explorer.service'
import { ProjectWorkspace } from '@/components/project-workspace'
import { backendErrorMessage } from '@/lib/services/backend-action'
import { BackendApiError } from '@/lib/services/backend-response'
import type { FileNode } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface ProjectPageProps {
  params: Promise<{
    projectId: string
  }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId: projectIdStr } = await params
  const projectId = Number.parseInt(projectIdStr, 10)

  if (!Number.isFinite(projectId)) {
    notFound()
  }

  const project = await findProjectById(projectId)

  if (!project) {
    notFound()
  }

  if (project.tempPath) assertSeparateRoots(project.path, project.tempPath)
  let fileTree: FileNode[] = []
  let initialTreeError: string | undefined
  try { fileTree = await loadFileTree(project.path) }
  catch (error) {
    if (!(error instanceof BackendApiError)) throw error
    initialTreeError = await backendErrorMessage(error)
  }
  const workingCopyTree = project.tempPath ? await loadOptionalSnapshotTree(containedPath(project.tempPath, 'working-copy')) : []
  const workingCopyPrevTree = project.tempPath ? await loadOptionalSnapshotTree(containedPath(project.tempPath, 'working-copy-prev')) : []

  return (
    <ProjectWorkspace
      key={projectId}
      projectId={projectId}
      projectTempPath={project.tempPath ?? ''}
      projectName={String(project.name ?? '').trim() || project.path}
      projectDescription={project.description}
      projectPath={project.path}
      fileTree={fileTree}
      initialTreeError={initialTreeError}
      workingCopyTree={workingCopyTree}
      workingCopyPrevTree={workingCopyPrevTree}
    />
  )
}
