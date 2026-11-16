import 'server-only'
import { open, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { findProjectById } from '@/lib/repositories/track-control/track-control.repository'
import { assertSeparateRoots, containedPath, relativeContained } from '../contained-paths'
import { readReadyPreview } from '../restore/preview-snapshot'
import { BackendApiError } from '../backend-response'
import { decodePreview, type FileTextPreview } from '@/lib/models/file-explorer/text-preview'

export const MAX_TEXT_BYTES = 2 * 1024 * 1024
/** Live project or a published preview of this project; never an arbitrary browser path. */
export async function authorizedItem(projectId: number, input: string, allowRoot = false): Promise<string> {
  const project = await findProjectById(projectId)
  if (!project?.tempPath) throw new BackendApiError('File', 'Project unavailable', 'project_not_found', 404)
  assertSeparateRoots(project.path, project.tempPath)
  try { relativeContained(project.path, input, allowRoot); return containedPath(project.path, input, allowRoot) }
  catch (error) { if (!(error instanceof BackendApiError) || error.code !== 'path_not_authorized') throw error }
  const relative = relativeContained(project.tempPath, input)
  const match = /^comparisons\/(compare-[a-f0-9-]{36})\/(working-copy|working-copy-prev)(?:\/(.+))?$/.exec(relative)
  if (!match || (!allowRoot && !match[3])) throw new BackendApiError('File', 'Unauthorized preview', 'path_not_authorized', 400)
  await readReadyPreview(project.tempPath, match[1], projectId)
  return containedPath(project.tempPath, relative)
}

export async function readTextPreview(projectId: number, input: string): Promise<FileTextPreview> {
  const path = await authorizedItem(projectId, input)
  const file = await open(path, 'r')
  try {
    const before = await file.stat()
    if (!before.isFile()) throw new BackendApiError('File', 'Not a regular file', 'file_not_text', 400)
    if (before.size > MAX_TEXT_BYTES) throw new BackendApiError('File', 'Text size limit', 'file_text_limit', 400)
    const buffer = Buffer.alloc(MAX_TEXT_BYTES + 1); let length = 0
    while (length < buffer.length) { const { bytesRead } = await file.read(buffer, length, buffer.length - length, null); if (!bytesRead) break; length += bytesRead }
    if (length > MAX_TEXT_BYTES) throw new BackendApiError('File', 'Text size limit', 'file_text_limit', 400)
    const after = await file.stat()
    const current = await stat(await authorizedItem(projectId, input))
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || length !== after.size
      || current.ino !== before.ino || current.dev !== before.dev || current.size !== after.size || current.mtimeMs !== after.mtimeMs || current.ctimeMs !== after.ctimeMs)
      throw new BackendApiError('File', 'Changed while reading', 'revision_conflict', 409)
    const bytes = buffer.subarray(0, length)
    return { ...decodePreview(bytes), revision: createHash('sha256').update(bytes).digest('hex'), bytes: length }
  } finally { await file.close() }
}
