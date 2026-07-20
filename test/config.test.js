import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { forgetServer, getConnection, normalizeUrl, readConfig, writeConfig } from '../src/config.js'

async function isolatedConfig(t) {
  const directory = await mkdtemp(join(tmpdir(), 'screeps-config-test-'))
  const previous = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('SCREEPS_')))
  for (const key of Object.keys(process.env)) if (key.startsWith('SCREEPS_')) delete process.env[key]
  process.env.SCREEPS_CLI_CONFIG = join(directory, 'config.json')
  t.after(async () => {
    for (const key of Object.keys(process.env)) if (key.startsWith('SCREEPS_')) delete process.env[key]
    Object.assign(process.env, previous)
    await rm(directory, { recursive: true, force: true })
  })
  return process.env.SCREEPS_CLI_CONFIG
}

test('an environment server never inherits credentials from another server', async t => {
  await isolatedConfig(t)
  const first = 'http://one.example'
  await writeConfig({ current: first, servers: { [first]: { url: first, token: 'first-secret' } } })
  process.env.SCREEPS_URL = 'two.example'

  const { connection } = await getConnection({ requireAuth: false })
  assert.equal(connection.url, 'http://two.example')
  assert.equal(connection.token, undefined)
})

test('selects saved credentials for the environment server itself', async t => {
  await isolatedConfig(t)
  const first = 'http://one.example'
  const second = 'http://two.example'
  await writeConfig({
    current: first,
    servers: {
      [first]: { url: first, token: 'first-secret' },
      [second]: { url: second, token: 'second-secret' }
    }
  })
  process.env.SCREEPS_URL = second

  const { connection } = await getConnection()
  assert.equal(connection.token, 'second-secret')
})

test('does not change permissions on a custom config parent', { skip: process.platform === 'win32' }, async t => {
  const path = await isolatedConfig(t)
  const directory = join(path, '..')
  await chmod(directory, 0o755)
  await writeConfig({ servers: {} })
  assert.equal((await stat(directory)).mode & 0o777, 0o755)
})

test('normalizes safe server URLs and rejects embedded credentials', () => {
  assert.equal(normalizeUrl('example.test:21025/api/'), 'http://example.test:21025')
  assert.throws(() => normalizeUrl('https://user:pass@example.test'), /credentials/)
  assert.throws(() => normalizeUrl('ftp://example.test'), /HTTP or HTTPS/)
})

test('selects and forgets remembered servers by hostname', async t => {
  await isolatedConfig(t)
  const first = 'https://screeps.com'
  const second = 'http://example.test:21025'
  await writeConfig({
    current: first,
    servers: {
      [first]: { url: first, token: 'first-secret' },
      [second]: { url: second, token: 'second-secret' }
    }
  })
  assert.equal((await getConnection({ server: 'example.test' })).connection.url, second)
  assert.equal(await forgetServer('example.test'), second)
  assert.deepEqual(Object.keys((await readConfig()).servers), [first])
})
