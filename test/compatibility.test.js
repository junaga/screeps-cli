import assert from 'node:assert/strict'
import test from 'node:test'
import { assertServerCompatibility, formatServerSummary } from '../src/compatibility.js'

test('accepts the supported Screeps wire protocol', () => {
  assert.equal(assertServerCompatibility({ protocol: 14 }).protocol, 14)
})

test('rejects unknown Screeps wire protocols clearly', () => {
  assert.throws(
    () => assertServerCompatibility({ protocol: 15 }),
    /Unsupported Screeps protocol 15/
  )
})

test('formats server and client versions for terminal users', () => {
  const summary = formatServerSummary({
    url: 'http://example.test:21025',
    auth: { name: 'screepsmod-auth', version: '2.9.0' },
    live: false,
    version: { protocol: 14, serverData: { features: [{ name: 'market', version: 1 }] } }
  })
  assert.match(summary, /Protocol: 14 \(supported\)/)
  assert.match(summary, /screeps\/docs c7cb981/)
  assert.match(summary, /screeps 0\.2\.0 using screeps-api/)
  assert.match(summary, /market 1/)
  assert.match(summary, /unavailable/)
})
