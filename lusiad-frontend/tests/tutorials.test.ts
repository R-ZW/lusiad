import assert from 'node:assert/strict'
import test from 'node:test'
import { clipTourRect, placeTourCard } from '../src/components/tutorials/tutorial-layout.ts'
import { tutorials } from '../src/components/tutorials/tutorial-catalogue.ts'

test('guide card stays in the viewport and avoids the highlighted control when space exists', () => {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    for (const target of [
      { left: 12, top: 12, width: 32, height: 32 },
      { left: viewport.width - 44, top: 12, width: 32, height: 32 },
      { left: 12, top: viewport.height - 44, width: 32, height: 32 },
    ]) {
      const size = { width: Math.min(368, viewport.width - 24), height: 300 }
      const card = { ...placeTourCard(target, size, viewport), ...size }
      assert.ok(card.left >= 12 && card.top >= 12)
      assert.ok(card.left + card.width <= viewport.width - 12)
      assert.ok(card.top + card.height <= viewport.height - 12)
      assert.equal(clipTourRect(card, target), null)
    }
  }
})

test('nested clipping never highlights invisible portions of a menu', () => {
  assert.deepEqual(clipTourRect({ left: -20, top: 40, width: 300, height: 500 }, { left: 0, top: 50, width: 240, height: 200 }),
    { left: 0, top: 50, width: 240, height: 200 })
  assert.equal(clipTourRect({ left: 500, top: 0, width: 30, height: 30 }, { left: 0, top: 0, width: 240, height: 200 }), null)
})

test('missing controls and large panels still produce a visible guide', () => {
  const viewport = { width: 1366, height: 768 }, size = { width: 368, height: 300 }
  assert.deepEqual(placeTourCard(null, size, viewport), { left: 499, top: 234 })
  const point = placeTourCard({ left: 0, top: 0, ...viewport }, size, viewport)
  assert.ok(point.left >= 12 && point.top >= 12 && point.top + size.height <= viewport.height - 12)
})

test('every guide has bilingual, uniquely identified steps and explicit DOM anchors', () => {
  assert.deepEqual(Object.keys(tutorials).sort(), ['branches', 'commit', 'comparison', 'files', 'history', 'library', 'projects', 'properties', 'sync', 'workspace'])
  for (const tour of Object.values(tutorials)) {
    assert.equal(new Set(tour.steps.map(step => step.id)).size, tour.steps.length)
    assert.ok(tour.root && tour.steps.length)
    for (const step of tour.steps) {
      assert.ok(step.targets.length)
      for (const locale of ['pt-BR', 'en'] as const) assert.ok(step.title[locale].trim() && step.body[locale].trim())
    }
  }
})
