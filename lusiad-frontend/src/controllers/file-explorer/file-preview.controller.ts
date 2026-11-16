'use server'

import { backendAction } from '@/lib/services/backend-action'
import { authorizedItem, readTextPreview } from '@/lib/services/file-explorer/file-preview.service'
import { postBackendJson } from '@/lib/services/backend-client'
import { backendUrl } from '@/lib/config/backend'
import { BackendApiError } from '@/lib/services/backend-response'

export async function loadFileTextController(projectId: number, path: string) {
  return backendAction(async () => {
    try { return await readTextPreview(projectId, path) }
    catch (error) { if (error instanceof BackendApiError) throw error; throw new BackendApiError('File', 'Read unavailable', 'file_text_unavailable', 503) }
  })
}
export async function revealFileController(projectId: number, path: string) {
  return backendAction(async () => {
    try {
    const target = await authorizedItem(projectId, path, true)
    return await postBackendJson(backendUrl('/fs/reveal'), { projectId, path: target }, 'System explorer', body => {
      if (body.status !== 'ok' || !['folder', 'selected', 'parent'].includes(String(body.mode))) throw new BackendApiError('System explorer', 'Invalid response', 'invalid_response', 200)
      return { mode: body.mode as 'folder' | 'selected' | 'parent' }
    })
    } catch (error) { if (error instanceof BackendApiError) throw error; throw new BackendApiError('System explorer', 'Unavailable', 'native_explorer_unavailable', 503) }
  })
}
