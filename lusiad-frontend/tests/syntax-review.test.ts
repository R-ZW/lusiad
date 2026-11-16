import assert from 'node:assert/strict'
import test from 'node:test'
import { SyntaxReviewSession } from '../src/lib/models/model-editor/syntax-review.model.ts'

test('a syntax confirmation authorizes only its own proposal and can decide only once', async () => {
  const session = new SyntaxReviewSession(), first = session.open()
  assert.equal(session.current(first.ticket), true)
  assert.equal(session.decide(first.ticket, 'apply'), true)
  assert.equal(session.decide(first.ticket, 'apply'), false)
  assert.equal(await first.decision, 'apply')
  const second = session.open()
  session.invalidate()
  assert.equal(await second.decision, 'correct')
  assert.equal(session.decide(second.ticket, 'apply'), false)
})

test('editing, cancelling or switching context invalidates late syntax approval', async () => {
  const session = new SyntaxReviewSession(), first = session.open()
  const second = session.open()
  assert.equal(await first.decision, 'correct')
  assert.equal(session.decide(first.ticket, 'apply'), false)
  session.decide(second.ticket, 'cancel')
  assert.equal(await second.decision, 'cancel')
})
