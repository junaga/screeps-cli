import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('top-level help exactly matches the interface designed in the README', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8')
  const block = readme.match(/```text\n\$ screeps --help\n\n([\s\S]*?)\n```/)
  assert.ok(block)
  const result = spawnSync(process.execPath, ['bin/screeps.js', '--help'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, `${block[1]}\n`)
  assert.doesNotMatch(result.stdout, /\b(raw|build|flag|spawn|status|rooms)\b.*\n/)
})

test('docs help lists every bundled guide without an API reference', () => {
  const result = spawnSync(process.execPath, ['bin/screeps.js', 'docs', '--help'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /cpu-limit .*How does CPU limit work/)
  assert.match(result.stdout, /power .*Power/)
  assert.doesNotMatch(result.stdout, /^  api\s/m)
})

test('documentation search ranks relevant partial matches', () => {
  const result = spawnSync(process.execPath, ['bin/screeps.js', 'docs', 'tower', 'falloff'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /defense .*Defending your room/)
})

test('market help exposes every action and explicit terminal context', () => {
  const result = spawnSync(process.execPath, ['bin/screeps.js', 'market', '--help'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  for (const command of ['buy', 'sell', 'deal', 'price', 'extend', 'cancel']) {
    assert.match(result.stdout, new RegExp(`^  ${command}\\b`, 'm'))
  }
  const deal = spawnSync(process.execPath, ['bin/screeps.js', 'market', 'deal', '--help'], { encoding: 'utf8' })
  assert.match(deal.stdout, /--from <room>.*terminal room/)
})

test('command groups expose detailed help and implementation seams stay hidden', () => {
  for (const command of ['map', 'watch', 'code', 'console', 'memory', 'market', 'power', 'messages', 'docs', 'login', 'logout']) {
    const result = spawnSync(process.execPath, ['bin/screeps.js', command, '--help'], { encoding: 'utf8' })
    assert.equal(result.status, 0, command)
    assert.match(result.stdout, /Usage:/)
  }
  const code = spawnSync(process.execPath, ['bin/screeps.js', 'code', '--help'], { encoding: 'utf8' })
  assert.match(code.stdout, /--branch <name>/)
  assert.match(code.stdout, /^  branches\b/m)
  assert.match(code.stdout, /^  use\b/m)

  const memory = spawnSync(process.execPath, ['bin/screeps.js', 'memory', '--help'], { encoding: 'utf8' })
  const market = spawnSync(process.execPath, ['bin/screeps.js', 'market', '--help'], { encoding: 'utf8' })
  assert.doesNotMatch(code.stdout, /^  diff\b/m)
  assert.doesNotMatch(memory.stdout, /^  get\b/m)
  assert.doesNotMatch(market.stdout, /^  (mine|orders)\b/m)
})

test('unknown targets fail before attempting a server connection', () => {
  const result = spawnSync(process.execPath, ['bin/screeps.js', 'somewhere'], {
    encoding: 'utf8', env: { ...process.env, SCREEPS_CLI_CONFIG: '/does/not/exist' }
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Unknown target "somewhere"/)
  assert.doesNotMatch(result.stderr, /No active server/)
})
