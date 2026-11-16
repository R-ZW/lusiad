import { postBackendJson } from './backend-client'
import { backendUrl } from '../config/backend'
import { BackendApiError } from './backend-response'

export interface ProjectStatus { projectId: number; ideOpen: boolean; webOpen: boolean; directoryExists: boolean }
export interface IdeStatus { status: 'ok'; projects: ProjectStatus[]; unregisteredIdeProjects: { name: string; path: string }[] }
export async function projectPresence(body: object, status = false) {
  return postBackendJson(backendUrl('/ide/projects'), body, 'IDE projects', (value, context) => {
    if (value.status !== 'ok' || 'error' in value) throw new BackendApiError(context, 'Invalid IDE response', 'invalid_response', 200)
    if (!status) return { status: 'ok' }
    if (!Array.isArray(value.projects) || !Array.isArray(value.unregisteredIdeProjects)) throw new BackendApiError(context, 'Invalid IDE response', 'invalid_response', 200)
    const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'
    if (value.projects.some(p => !object(p) || !Number.isSafeInteger(p.projectId) || Number(p.projectId) <= 0 || ['ideOpen', 'webOpen', 'directoryExists'].some(k => typeof p[k] !== 'boolean')) || value.unregisteredIdeProjects.some(p => !object(p) || typeof p.name !== 'string' || typeof p.path !== 'string')) throw new BackendApiError(context, 'Invalid IDE response', 'invalid_response', 200)
    return value as unknown as IdeStatus
  })
}
