'use server'

import { loadRuntimeConfig } from '@/lib/config/runtime-config'
import { loadOperationalConfig } from '@/lib/config/operational-config'
import { configurationRevision, saveTempRoot } from '@/lib/config/temp-root-settings'
import { listProjects } from '@/lib/repositories/track-control/track-control.repository'

export async function listSettingsProjectsController() {
  return (await listProjects()).map(project => ({ id: project.id, name: project.name }))
}

export async function loadSettingsController() {
  const runtime = loadRuntimeConfig()
  if (runtime.test) return { tempRoot: runtime.tempRoot, apiUrl: runtime.apiUrl,
    configFile: runtime.test.configPath, editable: false, revision: 'test',
    environment: { profile: runtime.profile, frontendUrl: runtime.test.frontendUrl, allowCloudflareTunnel: false, requestTimeoutMs: runtime.requestTimeoutMs, analyticsEnabled: false,
      database: { host: runtime.test.database.host, port: runtime.test.database.port, name: runtime.test.database.name, tls: false, connectTimeoutMs: null, socketTimeoutMs: null } } }
  const config = loadOperationalConfig()
  // Explicit allowlist: never serialize the operational object or database credentials.
  return { tempRoot: runtime.tempRoot, apiUrl: runtime.apiUrl, configFile: config.configFile,
    editable: process.env.LUSIAD_TEMP_ROOT === undefined,
    revision: configurationRevision(config.configFile),
    environment: { profile: runtime.profile, frontendUrl: config.frontendUrl, allowCloudflareTunnel: config.allowCloudflareTunnel, requestTimeoutMs: config.requestTimeoutMs, analyticsEnabled: config.analyticsEnabled,
      database: { host: config.database.host, port: config.database.port, name: config.database.name, tls: config.database.tls,
        connectTimeoutMs: config.database.connectTimeoutMs, socketTimeoutMs: config.database.socketTimeoutMs } } }
}

export async function saveTempRootController(value: string, revision: string): Promise<{ ok: boolean; code?: 'conflict' | 'managed' | 'invalid' }> {
  try {
    saveTempRoot(value, revision)
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return { ok: false, code: message === 'conflict' || message === 'managed' ? message : 'invalid' }
  }
}
