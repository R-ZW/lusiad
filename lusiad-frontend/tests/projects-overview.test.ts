import assert from 'node:assert/strict'
import test from 'node:test'
import { filterProjects, projectPreviewKey } from '../src/lib/models/projects-overview.ts'

const projects = [
  { id: 1, name: 'Árvore', description: 'Modelo — Ω', path: 'D:/trabalho/Exemplo' },
  { id: 2, name: 'API', description: null, path: 'D:/Outro' },
]
test('project search handles accents, case, description and path; preserves registry order', () => {
  assert.equal(filterProjects(projects, '  '), projects)
  assert.deepEqual(filterProjects(projects, 'arvore exemplo'), [projects[0]])
  assert.deepEqual(filterProjects(projects, 'Ω'), [projects[0]])
  assert.deepEqual(filterProjects(projects, 'api OUTRO'), [projects[1]])
  assert.deepEqual(filterProjects(projects, 'absent'), [])
  assert.equal(projects.length, 2)
})
test('preview identity changes after relink, rename, locale change and explicit refresh', () => {
  const key = projectPreviewKey(projects[0], 'pt-BR', 0)
  for (const p of [{ ...projects[0], id: 2 }, { ...projects[0], path: 'D:/moved' }, { ...projects[0], name: 'Renamed' }, { ...projects[0], description: 'updated' }]) {
    assert.notEqual(projectPreviewKey(p, 'pt-BR', 0), key)
  }
  assert.notEqual(projectPreviewKey(projects[0], 'en', 0), key)
  assert.notEqual(projectPreviewKey(projects[0], 'pt-BR', 1), key)
})
