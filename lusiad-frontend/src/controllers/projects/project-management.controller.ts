'use server'

import { revalidatePath } from 'next/cache'
import { postBackendJson } from '@/lib/services/backend-client'
import { backendUrl } from '@/lib/config/backend'
import { BackendApiError } from '@/lib/services/backend-response'
import * as contract from '@/lib/services/project-management/contract'

export type ManagementResult<T> = { ok: true; value: T } | { ok: false; code: string }
async function request<T>(route: string, body: unknown, validate: (body: Record<string, unknown>, context: string) => T): Promise<ManagementResult<T>> {
  try { return { ok: true, value: await postBackendJson(backendUrl(`/projects/${route}`), body, 'Project management', validate) } }
  catch (error) { return { ok: false, code: error instanceof BackendApiError ? error.code : 'project_unavailable' } }
}
export async function readProject(id: number) { return request('read', { projectId: id }, contract.registration) }
export async function updateProject(id: number, registryRevision: string, name: string, description: string) {
  const result = await request('update', { projectId: id, registryRevision, name, description }, contract.registration)
  if (result.ok) { revalidatePath('/'); revalidatePath(`/project/${id}`) }
  return result
}
export async function previewProject(id: number, adminAction: contract.ProjectAction, newPath: string) {
  return request('preview', { projectId: id, adminAction, newPath }, contract.plan)
}
export async function applyProject(id: number, adminAction: contract.ProjectAction, newPath: string, registryRevision: string, confirmation: string, requestId: string) {
  const result = await request('apply', { projectId: id, adminAction, newPath, registryRevision, confirmation, requestId }, contract.receipt)
  // Removing a card also unmounts its dialog. Keep it present until a completed receipt
  // is known so a pending cleanup or lost acknowledgement remains visible.
  if (result.ok && result.value.completed) { revalidatePath('/'); revalidatePath(`/project/${id}`) }
  return result
}
export async function pendingProjectOperations() { return request('operations', {}, contract.operations) }
export async function recoverProjectOperation(id: number, requestId: string) {
  const result = await request('recover', { projectId: id, requestId }, contract.receipt)
  revalidatePath('/'); revalidatePath(`/project/${id}`)
  return result
}
