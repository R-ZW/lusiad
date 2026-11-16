import assert from 'node:assert/strict'
import test from 'node:test'
import { directorySelection } from '../src/lib/models/projects/directory-selection.ts'

const id = '3ae6ec66-4114-49a1-a7d0-99395fa84f65'
test('folder picker distinguishes pending, cancellation and actual absolute selection', () => {
  for (const state of ['pending', 'cancelled', 'failed']) {
    assert.equal(directorySelection({ status: 'ok', requestId: id, state }, 'Picker', id).state, state)
  }
  for (const path of ['D:\\Projetos\\Árvore Ω', '/home/user/Java', '\\\\server\\share\\Java']) {
    assert.equal(directorySelection({ status: 'ok', requestId: id, state: 'selected', path }, 'Picker', id).path, path)
  }
})
test('a stale, malformed or relative picker response cannot overwrite a path', () => {
  for (const fields of [
    { requestId: 'other' }, { state: ['selected'] }, { state: 'selected' }, { state: 'selected', path: '' },
    { state: 'selected', path: 'relative/folder' }, { state: 'cancelled', path: 'D:\\folder' }, { status: 'error' },
  ]) assert.throws(() => directorySelection({ status: 'ok', requestId: id, state: 'pending', ...fields }, 'Picker', id))
})
