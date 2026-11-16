import assert from 'node:assert/strict'
import test from 'node:test'
import { operations, plan, receipt } from '../src/lib/services/project-management/contract.ts'
import { BackendApiError } from '../src/lib/services/backend-response.ts'

const id = '12345678-1234-1234-1234-123456789abc'
test('published cleanup is pending until an explicit completed receipt is returned', () => {
  const pending = receipt({ status: 'ok', operationId: id, state: 'applied', completed: false }, 'project')
  assert.equal(pending.completed, false)
  assert.equal(receipt({ status: 'ok', operationId: id, state: 'completed', completed: true }, 'project').completed, true)
})
test('contradictory, missing or aborted acknowledgements cannot claim completion', () => {
  for (const body of [
    { status: 'ok', operationId: id, state: 'applied', completed: true },
    { status: 'ok', operationId: id, state: 'completed', completed: false },
    { status: 'ok', operationId: id, state: 'aborted', completed: true },
    { status: 'ok', state: 'completed', completed: true },
  ]) assert.throws(() => receipt(body, 'project'), BackendApiError)
})

test('physical move plans need the exact destination and preserve typed pending recovery', () => {
  const move = { status: 'ok', id: 1, name: 'Project', description: '', path: 'D:/source/Project', revision: 'a'.repeat(64),
    pending: 0, changes: 2, commits: 1, tags: 1, kind: 'move', destinationDirectory: 'D:/destination', newPath: 'D:/destination/Project', files: 3, bytes: 42, snapshotsRetained: '' }
  assert.equal(plan(move, 'project').kind, 'move')
  for (const key of ['destinationDirectory', 'newPath', 'files', 'bytes']) {
    const invalid: Record<string, unknown> = { ...move }; delete invalid[key]
    assert.throws(() => plan(invalid, 'project'), BackendApiError)
  }
  const pending = { operationId: id, projectId: 1, kind: 'move', state: 'prepared', path: move.path, newPath: move.newPath }
  assert.equal(operations({ status: 'ok', operations: [pending] }, 'project')[0].newPath, move.newPath)
  assert.throws(() => operations({ status: 'ok', operations: [{ ...pending, kind: ['move'] }] }, 'project'), BackendApiError)
})
