import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { WebSocketServer } from 'ws'
import { createClient, discoverShard, marketItems, shardItems } from '../src/client.js'
import { writeConfig } from '../src/config.js'

test('selects one shard or combines all shard results', () => {
  const shards = { shard0: ['W1N1'], shard3: ['E2S2'] }
  assert.deepEqual(shardItems(shards, 'shard3'), ['E2S2'])
  assert.deepEqual(shardItems(shards), ['W1N1', 'E2S2'])
  assert.deepEqual(shardItems(shards, 'missing'), [])
})

test('selects world and account-wide market orders from the top-level response', () => {
  const response = {
    ok: 1,
    shard0: [{ _id: 'world' }],
    shard3: [{ _id: 'other-world' }],
    intershard: [{ _id: 'account-wide' }]
  }
  assert.deepEqual(marketItems(response, 'shard0').map(order => order._id), ['world', 'account-wide'])
  assert.deepEqual(marketItems(response).map(order => order._id), ['world', 'other-world', 'account-wide'])
})

test('discovers an occupied shard, then falls back to the busiest shard', async () => {
  const api = {
    async authMe() { return { _id: 'me' } },
    async userRooms() { return { shards: { shard0: [], shard2: ['E1S1'] } } },
    async gameShardsInfo() { throw new Error('not needed') }
  }
  assert.equal(await discoverShard(api), 'shard2')

  api.userRooms = async () => ({ shards: {} })
  api.gameShardsInfo = async () => ({ shards: [
    { name: 'shard0', users: 10 }, { name: 'shard3', users: 50 }
  ] })
  assert.equal(await discoverShard(api), 'shard3')
})

test('creates a fresh live session without persisting its rotation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'screeps-client-test-'))
  const previousConfig = process.env.SCREEPS_CLI_CONFIG
  process.env.SCREEPS_CLI_CONFIG = join(directory, 'config.json')
  t.after(async () => {
    if (previousConfig === undefined) delete process.env.SCREEPS_CLI_CONFIG
    else process.env.SCREEPS_CLI_CONFIG = previousConfig
    await rm(directory, { recursive: true, force: true })
  })

  let signins = 0
  const server = createServer((request, response) => {
    if (request.url !== '/api/auth/signin') return response.writeHead(404).end()
    signins++
    assert.equal(request.headers['x-server-password'], 'shared-secret')
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ ok: 1, token: 'fresh-session' }))
  })
  const sockets = new WebSocketServer({ server })
  await new Promise(resolve => server.listen(0, resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  sockets.on('connection', socket => socket.on('message', message => {
    if (message.toString() === 'auth fresh-session') socket.send('auth ok next-live')
  }))

  const address = server.address()
  const url = `http://127.0.0.1:${address.port}`
  await writeConfig({
    current: url,
    servers: { [url]: {
      url,
      username: 'player',
      password: 'account-secret',
      serverPassword: 'shared-secret',
      token: 'persistent-http',
      shard: 'shard2'
    } }
  })

  const { api, shard } = await createClient()
  assert.equal(shard, 'shard2')
  await api.socket.connect()
  api.socket.disconnect()

  const config = JSON.parse(await readFile(process.env.SCREEPS_CLI_CONFIG, 'utf8'))
  assert.equal(signins, 1)
  assert.equal(config.servers[url].token, 'persistent-http')
  assert.equal(config.servers[url].password, 'account-secret')
  assert.equal(config.servers[url].liveToken, undefined)
})
