import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { loadOperationalConfig } from '../src/lib/config/operational-config.ts'
import { loadRuntimeConfig } from '../src/lib/config/runtime-config.ts'

const require = createRequire(import.meta.url)
const mode = process.argv[2]
if (!['dev', 'start'].includes(mode)) throw new Error('Use dev or start')
require('@next/env').loadEnvConfig(process.cwd(), mode === 'dev')
const runtime = loadRuntimeConfig()
const frontendUrl = runtime.test?.frontendUrl ?? loadOperationalConfig().frontendUrl
const args = process.argv.slice(3)
// Explicit CLI/PORT keep Next's normal precedence. Passing a port also makes
// an occupied port fail rather than silently opening the app on another one.
const explicit = args.some((arg) => arg === '-p' || arg === '--port' || arg.startsWith('--port='))
if (!explicit) args.push('--port', process.env.PORT ?? (new URL(frontendUrl).port || (frontendUrl.startsWith('https:') ? '443' : '80')))
const explicitHost = args.some((arg) => arg === '-H' || arg === '--hostname' || arg.startsWith('--hostname='))
if (!explicitHost) {
  const host = new URL(frontendUrl).hostname.replace(/^\[|\]$/g, '')
  args.push('--hostname', host === 'localhost' ? '127.0.0.1' : host)
}
console.log(`Frontend do Lusiad: ${frontendUrl}`)
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', mode, ...args], { stdio: 'inherit', windowsHide: true })
child.on('error', () => { process.exitCode = 1 })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal))
