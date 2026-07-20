import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('top-level help exactly matches the interface designed in the README', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8')
  const block = readme.match(/```text\n\$ screeps --help\n\n([\s\S]*?)\n```/)
  assert.ok(block)
  const result = spawnSync(process.execPath, ['bin.js', '--help'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, `${block[1]}\n`)
  assert.doesNotMatch(result.stdout, /\b(raw|build|flag|spawn|status|rooms)\b.*\n/)
})

test('docs help lists every bundled guide without an API reference', () => {
  const result = spawnSync(process.execPath, ['bin.js', 'docs', '--help'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /cpu-limit .*How does CPU limit work/)
  assert.match(result.stdout, /power .*Power/)
  assert.doesNotMatch(result.stdout, /^  api\s/m)
  assert.doesNotMatch(result.stdout, /--search/)

  const removed = spawnSync(process.execPath, ['bin.js', 'docs', '--search', 'tower'], { encoding: 'utf8' })
  assert.equal(removed.status, 1)
  assert.match(removed.stderr, /unknown option '--search'/)
})

test('bare docs and docs help show the same topic catalog', () => {
  const result = spawnSync(process.execPath, ['bin.js', 'docs'], { encoding: 'utf8' })
  const help = spawnSync(process.execPath, ['bin.js', 'docs', '--help'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, help.stdout)
  assert.match(result.stdout, /Offline snapshot: \d{4}-\d{2}-\d{2}/)
  assert.match(result.stdout, /https:\/\/docs\.screeps\.com\//)
  assert.match(result.stdout, /advanced-grunt/)

  const json = spawnSync(process.execPath, ['bin.js', '--json', 'docs'], { encoding: 'utf8' })
  assert.equal(JSON.parse(json.stdout).topics.length > 25, true)
})

test('market help exposes every action and explicit terminal context', () => {
  const result = spawnSync(process.execPath, ['bin.js', 'market', '--help'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  for (const command of ['buy', 'sell', 'deal', 'price', 'extend', 'cancel']) {
    assert.match(result.stdout, new RegExp(`^  ${command}\\b`, 'm'))
  }
  const deal = spawnSync(process.execPath, ['bin.js', 'market', 'deal', '--help'], { encoding: 'utf8' })
  assert.match(deal.stdout, /--from <room>.*terminal room/)
})

test('command groups expose detailed help and implementation seams stay hidden', () => {
  for (const command of ['map', 'watch', 'code', 'console', 'memory', 'market', 'power', 'messages', 'docs', 'login', 'logout']) {
    const result = spawnSync(process.execPath, ['bin.js', command, '--help'], { encoding: 'utf8' })
    assert.equal(result.status, 0, command)
    assert.match(result.stdout, /Usage:/)
  }
  const code = spawnSync(process.execPath, ['bin.js', 'code', '--help'], { encoding: 'utf8' })
  assert.match(code.stdout, /--branch <name>/)
  assert.match(code.stdout, /^  branches\b/m)
  assert.match(code.stdout, /^  use\b/m)

  const memory = spawnSync(process.execPath, ['bin.js', 'memory', '--help'], { encoding: 'utf8' })
  const market = spawnSync(process.execPath, ['bin.js', 'market', '--help'], { encoding: 'utf8' })
  assert.doesNotMatch(code.stdout, /^  diff\b/m)
  assert.doesNotMatch(memory.stdout, /^  get\b/m)
  assert.doesNotMatch(market.stdout, /^  (mine|orders)\b/m)
})

test('unknown targets fail before attempting a server connection', () => {
  const result = spawnSync(process.execPath, ['bin.js', 'somewhere'], {
    encoding: 'utf8', env: { ...process.env, SCREEPS_CLI_CONFIG: '/does/not/exist' }
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Unknown target "somewhere"/)
  assert.doesNotMatch(result.stderr, /No active server/)
})
