// Node only: shared operational settings. Never pass this object to a client.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, normalize, parse } from 'node:path'

export type Environment = Readonly<Record<string, string | undefined>>
export interface OperationalConfig {
  configFile: string
  apiUrl: string
  frontendUrl: string
  allowCloudflareTunnel: boolean
  apiToken: string
  tempRoot: string
  requestTimeoutMs: number
  analyticsEnabled: boolean
  database: { host: string; port: number; name: string; user: string; password: string; tls: boolean; connectTimeoutMs: number; socketTimeoutMs: number }
}

export function configFilePath(env: Environment = process.env): string {
  return absolutePath(env.LUSIAD_CONFIG_FILE ?? join(homedir(), '.lusiad', 'config.json'), 'LUSIAD_CONFIG_FILE')
}

export function absolutePath(value: unknown, name: string): string {
  if (typeof value !== 'string' || !isAbsolute(value) || /[\0\r\n]/.test(value) || !value.trim()) throw new Error(`${name} must be an absolute path`)
  return normalize(value)
}

export function tempRootPath(value: unknown): string {
  const path = absolutePath(value, 'LUSIAD_TEMP_ROOT')
  if (parse(path).root === path) throw new Error('LUSIAD_TEMP_ROOT cannot be a filesystem root')
  return path
}

export function origin(value: unknown, name: string, localApi = false): string {
  try {
    if (typeof value !== 'string' || !value.trim()) throw new Error()
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port === '0') throw new Error()
    if (localApi && (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error()
    return url.origin
  } catch { throw new Error(`${name} must be an HTTP(S) origin${localApi ? ' on localhost or 127.0.0.1 (HTTP)' : ''}`) }
}

export function integer(value: unknown, name: string, min: number, max: number): number {
  if (!/^\d+$/.test(String(value))) throw new Error(`Invalid ${name}`)
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(`Invalid ${name}`)
  return number
}

export function boolean(value: unknown, name: string): boolean {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  throw new Error(`Invalid ${name}: use true or false`)
}

export function readSharedConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return { version: 1 }
  try {
    const value = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) throw new Error()
    if (value.database !== undefined && (!value.database || typeof value.database !== 'object' || Array.isArray(value.database))) throw new Error()
    return value
  } catch { throw new Error(`Invalid Lusiad configuration file: ${path}`) }
}

function apiTokenValue(value: unknown): string {
  if (value === undefined) return '' // Plugin may not have bootstrapped the existing private file yet.
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(value)) throw new Error('Invalid LUSIAD_API_TOKEN')
  return value
}

/** Legacy test profile takes SQL/roots from its manifest; only the local API credential is shared. */
export function loadApiToken(env: Environment = process.env): string {
  return apiTokenValue(env.LUSIAD_API_TOKEN ?? readSharedConfig(configFilePath(env)).apiToken)
}

export function loadOperationalConfig(env: Environment = process.env): OperationalConfig {
  const configFile = configFilePath(env), file = readSharedConfig(configFile)
  const db = (file.database ?? {}) as Record<string, unknown>
  const string = (value: unknown, name: string, empty = false): string => {
    if (typeof value !== 'string' || (!empty && !value.trim()) || /[\0\r\n]/.test(value)) throw new Error(`Invalid ${name}`)
    return value
  }
  const apiUrl = origin(env.LUSIAD_API_URL ?? (env.LUSIAD_API_PORT !== undefined
    ? `http://127.0.0.1:${integer(env.LUSIAD_API_PORT, 'LUSIAD_API_PORT', 1, 65535)}` : file.apiUrl ?? 'http://127.0.0.1:8765'), 'LUSIAD_API_URL', true)
  if (env.LUSIAD_API_PORT !== undefined && Number(new URL(apiUrl).port || 80) !== integer(env.LUSIAD_API_PORT, 'LUSIAD_API_PORT', 1, 65535)) throw new Error('LUSIAD_API_URL and LUSIAD_API_PORT disagree')
  const host = string(env.LUSIAD_DB_HOST ?? db.host ?? '127.0.0.1', 'LUSIAD_DB_HOST')
  const name = string(env.LUSIAD_DB_NAME ?? db.name ?? 'lusiad', 'LUSIAD_DB_NAME')
  const tls = boolean(env.LUSIAD_DB_TLS ?? db.tls ?? false, 'LUSIAD_DB_TLS')
  const apiToken = apiTokenValue(env.LUSIAD_API_TOKEN ?? file.apiToken)
  if (!/^[\w.-]+$/.test(host) || !/^[\w-]+$/.test(name)) throw new Error('Invalid SQL host or database name')
  if (tls && /^\d+(\.\d+){3}$/.test(host)) throw new Error('SQL TLS requires a DNS hostname matching the certificate')
  return {
    configFile, apiUrl, apiToken,
    frontendUrl: origin(env.LUSIAD_FRONTEND_URL ?? file.frontendUrl ?? 'http://localhost:3000', 'LUSIAD_FRONTEND_URL'),
    allowCloudflareTunnel: boolean(env.LUSIAD_ALLOW_CLOUDFLARE_TUNNEL ?? file.allowCloudflareTunnel ?? false, 'LUSIAD_ALLOW_CLOUDFLARE_TUNNEL'),
    tempRoot: tempRootPath(env.LUSIAD_TEMP_ROOT ?? file.tempRoot ?? join(homedir(), '.lusiad', 'temp')),
    // Existing zero values now select the finite default, rather than an unlimited request.
    requestTimeoutMs: integer(env.LUSIAD_API_TIMEOUT_MS ?? file.requestTimeoutMs ?? 60000, 'LUSIAD_API_TIMEOUT_MS', 0, 120000) || 60000,
    analyticsEnabled: boolean(env.LUSIAD_ANALYTICS_ENABLED ?? file.analyticsEnabled ?? false, 'LUSIAD_ANALYTICS_ENABLED'),
    database: {
      host: !tls && host === 'localhost' ? '127.0.0.1' : host,
      port: integer(env.LUSIAD_DB_PORT ?? db.port ?? 3306, 'LUSIAD_DB_PORT', 1, 65535), name,
      user: string(env.LUSIAD_DB_USER ?? db.user ?? '', 'LUSIAD_DB_USER', true),
      password: string(env.LUSIAD_DB_PASSWORD ?? db.password ?? '', 'LUSIAD_DB_PASSWORD', true),
      tls,
      connectTimeoutMs: integer(env.LUSIAD_DB_CONNECT_TIMEOUT_MS ?? db.connectTimeoutMs ?? 5000, 'LUSIAD_DB_CONNECT_TIMEOUT_MS', 1, 120000),
      socketTimeoutMs: integer(env.LUSIAD_DB_SOCKET_TIMEOUT_MS ?? db.socketTimeoutMs ?? 30000, 'LUSIAD_DB_SOCKET_TIMEOUT_MS', 0, 120000),
    },
  }
}
