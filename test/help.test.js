import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('top-level help is semantic, brief, and hides transport internals', () => {
  const result = spawnSync(process.execPath, ['bin/screeps.js', '--help'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /screeps status/)
  assert.match(result.stdout, /screeps room E4S1/)
  assert.match(result.stdout, /screeps watch E4S1/)
  assert.match(result.stdout, /docs .*read the official game documentation/)
  assert.match(result.stdout, /tile .*show everything on one tile/)
  assert.match(result.stdout, /build .*place a construction site/)
  assert.doesNotMatch(result.stdout, /raw <method>/)
  assert.doesNotMatch(result.stdout, /place-spawn|construct <|messages /)
})

test('docs help lists repository-authored game guides without the API reference', () => {
  const result = spawnSync(process.execPath, ['bin/screeps.js', 'docs', '--help'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /cpu-limit .*How does CPU limit work/)
  assert.match(result.stdout, /power .*Power/)
  assert.doesNotMatch(result.stdout, /^  api\s/m)
})
