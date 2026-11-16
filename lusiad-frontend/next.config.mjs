import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// Keep the test dev/build output separate from the author's normal .next directory.
let testRunId
if (process.env.LUSIAD_ENV === 'test') {
  const manifest = JSON.parse(readFileSync(process.env.LUSIAD_TEST_CONFIG, 'utf8'))
  if (!/^[a-f0-9]{32}$/.test(manifest.runId)) throw new Error('Invalid test runId')
  testRunId = manifest.runId
  // Next adjusts tsconfig automatically; direct those changes to an ignored test file.
  const directory = '.lusiad-test-config'
  mkdirSync(directory, { recursive: true })
  if (!existsSync(`${directory}/${testRunId}.json`)) writeFileSync(`${directory}/${testRunId}.json`, JSON.stringify({
    extends: '../tsconfig.json', include: ['../next-env.d.ts', '../src/**/*.ts', '../src/**/*.tsx', `../.next-test/${testRunId}/types/**/*.ts`, `../.next-test/${testRunId}/dev/types/**/*.ts`],
    exclude: ['../node_modules'],
  }, null, 2))
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(testRunId ? { distDir: `.next-test/${testRunId}`, typescript: { tsconfigPath: `.lusiad-test-config/${testRunId}.json` } } : {}),
  images: {
    unoptimized: true,
  },
}

export default nextConfig
