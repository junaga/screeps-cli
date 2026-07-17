import assert from 'node:assert/strict'
import test from 'node:test'
import { extractServerPassword, extractSessionCandidates } from '../src/token.js'

test('extracts newest unique private-server desktop sessions', () => {
  const first = 'a'.repeat(40)
  const second = 'b'.repeat(40)
  const data = Buffer.from(`noise auth+\u0000"${first}" more auth+\u0000"${second}" again auth+\u0000"${first}"`, 'latin1')
  assert.deepEqual(extractSessionCandidates([data]), [second, first])
})

test('extracts the shared password for the selected server only', () => {
  const data = Buffer.from('{"settings":{"host":"example.test","port":"21025","password":"server-secret","prefix":""}}')
  assert.equal(extractServerPassword([data], 'example.test'), 'server-secret')
  assert.equal(extractServerPassword([data], 'other.example'), undefined)
})
