'use server'

import { postBackendJson } from '@/lib/services/backend-client'
import { backendUrl } from '@/lib/config/backend'
import { BackendApiError } from '@/lib/services/backend-response'
import { directorySelection, type DirectorySelectionOperation } from '@/lib/models/projects/directory-selection'
import type { AppLocale } from '@/lib/i18n/core'

export async function chooseProjectDirectory(requestId: string, operation: DirectorySelectionOperation, path: string, locale: AppLocale) {
  try {
    const value = await postBackendJson(backendUrl('/fs/directory-picker'), { requestId, operation, path, locale }, 'Folder selection',
      (body, context) => directorySelection(body, context, requestId))
    return { ok: true as const, value }
  } catch (error) {
    return { ok: false as const, code: error instanceof BackendApiError ? error.code : 'directory_picker_unavailable' }
  }
}
