import { closeSync, existsSync, lstatSync, mkdirSync, openSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadOperationalConfig, readSharedConfig, tempRootPath, type Environment } from './operational-config.ts'

export function configurationRevision(file: string): string {
  if (!existsSync(file)) return 'missing'
  const stat = statSync(file, { bigint: true })
  return `${stat.mtimeNs}:${stat.ctimeNs}:${stat.size}`
}

/** Changes the default only. Existing projects and reconstruction paths stay pinned in SQL. */
export function saveTempRoot(value: string, revision: string, env: Environment = process.env): void {
  if (env.LUSIAD_ENV === 'test' || env.LUSIAD_TEMP_ROOT !== undefined) throw new Error('managed')
  const config = loadOperationalConfig(env), root = tempRootPath(value), file = config.configFile
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const lock = `${file}.lock`, pending = `${file}.${randomUUID()}.tmp`
  let descriptor: number
  try { descriptor = openSync(lock, 'wx', 0o600) } catch { throw new Error('conflict') }
  try {
    if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error('managed')
    if (configurationRevision(file) !== revision) throw new Error('conflict')
    const values = readSharedConfig(file)
    mkdirSync(root, { recursive: true })
    const probe = `${root}/.lusiad-write-${randomUUID()}`
    const handle = openSync(probe, 'wx', 0o600)
    closeSync(handle); unlinkSync(probe)
    const mode = existsSync(file) ? statSync(file).mode & 0o777 : 0o600
    writeFileSync(pending, JSON.stringify({ ...values, tempRoot: root }, null, 2) + '\n', { flag: 'wx', mode })
    if (configurationRevision(file) !== revision) throw new Error('conflict')
    renameSync(pending, file)
  } finally {
    if (existsSync(pending)) unlinkSync(pending)
    closeSync(descriptor)
    unlinkSync(lock)
  }
}
