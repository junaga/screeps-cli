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
  assert.match(summary, /screeps-api 2\.1\.0/)
  assert.match(summary, /market 1/)
  assert.match(summary, /unavailable/)
})
