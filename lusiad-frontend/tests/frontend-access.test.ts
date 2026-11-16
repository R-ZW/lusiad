import assert from "node:assert/strict"
import test from "node:test"
import { allowsFrontendRequest, authorizedFrontendOrigin, frontendForwardHeaders } from "../src/lib/config/frontend-access.ts"

test("the configured web origin protects pages and Next Server Actions from foreign origins and rebinding hosts", () => {
  const origin = "http://localhost:3000"
  assert.equal(allowsFrontendRequest(origin, "localhost:3000", origin), true)
  assert.equal(allowsFrontendRequest(origin, "LOCALHOST:3000", null), true)
  for (const host of [null, "evil.example:3000", "localhost:3001", "localhost:3000.evil.example", "127.0.0.1:3000", "user@localhost:3000"]) {
    assert.equal(allowsFrontendRequest(origin, host, origin), false, String(host))
  }
  for (const foreign of ["null", "http://evil.example", "http://localhost:3001", "http://localhost:3000/path", "http://localhost:3000?x=1", "http://user@localhost:3000"]) {
    assert.equal(allowsFrontendRequest(origin, "localhost:3000", foreign), false, foreign)
  }
  assert.equal(allowsFrontendRequest("http://127.0.0.1:13000", "127.0.0.1:13000", "http://127.0.0.1:13000"), true)
})

test('evaluation mode accepts changing HTTPS Quick Tunnel addresses and preserves local access', () => {
  const local = 'http://localhost:3000'
  for (const host of ['first-random-session.trycloudflare.com', 'another-generated-address.trycloudflare.com']) {
    const publicOrigin = `https://${host}`
    assert.equal(allowsFrontendRequest(local, host, null), false)
    assert.equal(allowsFrontendRequest(local, host, null, true), true)
    assert.equal(authorizedFrontendOrigin(local, host, publicOrigin, true), publicOrigin)
    assert.equal(allowsFrontendRequest(local, host + ':443', publicOrigin, true), true)
    assert.equal(allowsFrontendRequest(local, host, local, true), false)
    assert.equal(allowsFrontendRequest(local, host, 'https://other.trycloudflare.com', true), false)
    assert.equal(allowsFrontendRequest(local, host, 'http://' + host, true), false)
    assert.equal(allowsFrontendRequest(local, host, publicOrigin + '/project/1', true), false)
    assert.equal(allowsFrontendRequest(local, host, 'null', true), false)
  }
  assert.equal(allowsFrontendRequest(local, 'localhost:3000', local, true), true)
  assert.equal(allowsFrontendRequest(local, 'localhost:3000', 'https://remote.trycloudflare.com', true), false)
})

test('tunnel permission does not authorize lookalike domains, arbitrary hosts or malformed authorities', () => {
  for (const host of [null, 'evil.example', 'trycloudflare.com', 'fake.trycloudflare.com.evil.example',
    'fake-trycloudflare.com', 'a.b.trycloudflare.com', '-a.trycloudflare.com', 'a_.trycloudflare.com',
    'a.trycloudflare.com:3000', 'a.trycloudflare.com:80', 'a.trycloudflare.com, localhost:3000',
    'user@a.trycloudflare.com', 'a.trycloudflare.com/path', ' a.trycloudflare.com', 'a.try%63loudflare.com']) {
    assert.equal(allowsFrontendRequest('http://localhost:3000', host, null, true), false, String(host))
  }
})

test('Server Actions receive the validated public host rather than untrusted forwarded metadata', () => {
  const incoming = new Headers({ host: 'demo.trycloudflare.com', origin: 'https://demo.trycloudflare.com',
    'x-forwarded-host': 'localhost:3000, evil.example', 'x-forwarded-proto': 'http', 'next-action': 'action-id' })
  const authorized = authorizedFrontendOrigin('http://localhost:3000', incoming.get('host'), incoming.get('origin'), true)
  assert.equal(authorized, 'https://demo.trycloudflare.com')
  const forwarded = frontendForwardHeaders(incoming, authorized!)
  assert.equal(forwarded.get('x-forwarded-host'), 'demo.trycloudflare.com')
  assert.equal(forwarded.get('x-forwarded-proto'), 'https')
  assert.equal(forwarded.get('next-action'), 'action-id')
  assert.equal(forwarded.get('origin'), incoming.get('origin'))
  assert.equal(forwarded.get('x-lusiad-token'), null)
  assert.equal(incoming.get('x-forwarded-host'), 'localhost:3000, evil.example')
  assert.equal(authorizedFrontendOrigin('http://localhost:3000', 'evil.example', incoming.get('origin'), true), null)
  assert.equal(frontendForwardHeaders(new Headers(), 'http://localhost:3000').get('x-forwarded-host'), 'localhost:3000')
})
