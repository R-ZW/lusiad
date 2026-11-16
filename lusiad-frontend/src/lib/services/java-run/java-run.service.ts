import 'server-only'
import { postBackendJson } from '../backend-client'
import { backendUrl } from '@/lib/config/backend'
import { requireJavaRunList, requireJavaRunStatus } from './java-run-contract'

export async function javaRunRequest(projectId: number, action: 'list' | 'status' | 'start' | 'stop', values: { main?: string; contextRevision?: string; runId?: string } = {}) {
  return postBackendJson(backendUrl('/run/' + action), { projectId, ...values }, 'Executar Java',
    body => action === 'list' ? requireJavaRunList(body) : requireJavaRunStatus(body))
}
