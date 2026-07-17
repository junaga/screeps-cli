import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('top-level help is semantic, brief, and hides transport internals', () => {
  const result = spawnSync(process.execPath, ['bin/screeps.js', '--help'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /screeps status/)
  assert.match(result.stdout, /screeps room E4S1 --watch --details/)
  assert.match(result.stdout, /build .*place a construction site/)
  assert.doesNotMatch(result.stdout, /raw <method>/)
  assert.doesNotMatch(result.stdout, /place-spawn|construct <|messages /)
})
