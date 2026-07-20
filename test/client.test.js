import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { WebSocketServer } from 'ws'
import {
  createClient, createHttpClient, createLiveSocket, discoverShard,
  isOfficialServerUrl, marketItems, openRoomSubscription, playerId, shardItems
} from '../src/client.js'
import { writeConfig } from '../src/config.js'

test('selects one shard or combines all shard results', () => {
  const shards = { shard0: ['W1N1'], shard3: ['E2S2'] }
  assert.deepEqual(shardItems(shards, 'shard3'), ['E2S2'])
  assert.deepEqual(shardItems(shards), ['W1N1', 'E2S2'])
  assert.deepEqual(shardItems(shards, 'missing'), [])
  assert.deepEqual(shardItems({ privSrv: ['W5N5'] }, 'ignored-private-shard'), ['W5N5'])
})

test('selects world and account-wide market orders across response shapes', () => {
  const response = {
    ok: 1,
    shard0: [{ _id: 'world' }],
    shard3: [{ _id: 'other-world' }],
    intershard: [{ _id: 'account-wide' }]
  }
  assert.deepEqual(marketItems(response, 'shard0').map(order => order._id), ['world', 'account-wide'])
  assert.deepEqual(marketItems(response).map(order => order._id), ['world', 'other-world', 'account-wide'])
  assert.deepEqual(marketItems({ shards: response }, 'shard0').map(order => order._id), ['world', 'account-wide'])
  assert.deepEqual(marketItems({ shards: { privSrv: [{ _id: 'private' }] } }, 'ignored').map(order => order._id), ['private'])
})

test('resolves message recipients from usernames to database IDs', async () => {
  const api = { async userFind(username) { return { user: username === 'Alice' ? { _id: 'alice-id' } : null } } }
  assert.equal(await playerId(api, 'Alice'), 'alice-id')
  await assert.rejects(playerId(api, 'Missing'), /Player @Missing was not found/)
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

test('classifies only the real Screeps hostname as official', () => {
  assert.equal(isOfficialServerUrl('https://screeps.com/ptr'), true)
  assert.equal(isOfficialServerUrl('https://my-screeps.com'), false)
  assert.equal(isOfficialServerUrl('https://screeps.com.example.org'), false)
  assert.equal(isOfficialServerUrl('https://example.org/screeps.com'), false)
  assert.equal(createHttpClient({ url: 'https://my-screeps.com', token: 'x' }).isOfficialServer, false)
})

test('uses a valid persistent live token before a stale saved password', async t => {
  let signins = 0
  const server = createServer((request, response) => {
    if (request.url === '/api/auth/signin') signins++
    response.writeHead(401).end()
  })
  const sockets = new WebSocketServer({ server })
  await new Promise(resolve => server.listen(0, resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  sockets.on('connection', socket => socket.on('message', message => {
    if (message.toString() === 'auth persistent-live') socket.send('auth ok rotated')
  }))

  const url = `http://127.0.0.1:${server.address().port}`
  const socket = createLiveSocket(
    { token: 'persistent-live', async me() { return { _id: 'me' } } },
    { url, token: 'persistent-live', username: 'player', password: 'stale' }
  )
  await socket.connect()
  socket.disconnect()
  assert.equal(signins, 0)
})

test('reconnects successfully and restores each subscription once', async t => {
  const server = createServer()
  const sockets = new WebSocketServer({ server })
  await new Promise(resolve => server.listen(0, resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  const socket = createLiveSocket(
    { token: 'persistent-live', async me() { return { _id: 'me' } } },
    { url, token: 'persistent-live' }
  )
  t.after(() => {
    socket.disconnect()
    return new Promise(resolve => server.close(resolve))
  })

  let connections = 0
  const subscriptions = []
  let resolveRestored
  const restored = new Promise(resolve => { resolveRestored = resolve })
  sockets.on('connection', ws => {
    const connection = ++connections
    ws.on('message', message => {
      const text = message.toString()
      if (text === 'auth persistent-live') ws.send('auth ok rotated')
      if (text === 'subscribe room:W1N1') {
        subscriptions.push(connection)
        if (connection === 1) ws.close()
        if (connection === 2) resolveRestored()
      }
    })
  })

  await socket.connect()
  await socket.subscribe('room:W1N1', () => {})
  await Promise.race([
    restored,
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('reconnect timed out')), 3000))
  ])
  assert.deepEqual(subscriptions, [1, 2])
})

test('waits for a room snapshot and surfaces subscription limits', async () => {
  const listeners = new Map()
  const socket = {
    on(name, callback) { listeners.set(name, callback) },
    off(name, callback) { if (listeners.get(name) === callback) listeners.delete(name) },
    emit(name, value) { listeners.get(name)?.(value) },
    async subscribeRoom(_room, _shard, callback) { this.callback = callback },
    async unsubscribeRoom() { this.unsubscribed = true }
  }
  const opening = openRoomSubscription(socket, 'W1N1', 'shard0', () => {}, { timeout: 100 })
  socket.emit('message', { type: 'server', path: 'err@room:shard0/W1N1', data: ['subscribe limit reached'] })
  await assert.rejects(opening, /subscribe limit reached/)
  assert.equal(socket.unsubscribed, true)

  const updates = []
  const successful = openRoomSubscription(socket, 'W2N2', 'shard0', event => updates.push(event), { timeout: 100 })
  socket.callback({ data: { objects: { first: { type: 'source' } } } })
  const subscription = await successful
  socket.callback({ data: { objects: { second: { type: 'creep' } } } })
  assert.deepEqual(updates, [])
  subscription.start()
  assert.equal(updates.length, 1)
  await subscription.close()
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
    else if (message.toString().startsWith('auth ')) socket.send('auth failed')
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
