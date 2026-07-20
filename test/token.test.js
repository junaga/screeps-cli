import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { WebSocketServer } from 'ws'
import { createLiveSocket } from '../src/live.js'
import { exchangeSocketToken, extractServerPassword, extractSessionCandidates, login } from '../src/token.js'

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

test('builds a live client from a newly authenticated HTTP token', () => {
  const httpApi = { token: 'fresh-http-token', async me() { return { _id: 'me' } } }
  const socket = createLiveSocket(httpApi, { url: 'http://127.0.0.1' })
  assert.equal(typeof socket.connect, 'function')
  socket.disconnect()
})

test('validates and persists a supplied API token', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'screeps-login-test-'))
  const previousConfig = process.env.SCREEPS_CLI_CONFIG
  const previousToken = process.env.SCREEPS_TOKEN
  process.env.SCREEPS_CLI_CONFIG = join(directory, 'config.json')
  process.env.SCREEPS_TOKEN = 'persistent-token'
  t.after(async () => {
    if (previousConfig === undefined) delete process.env.SCREEPS_CLI_CONFIG
    else process.env.SCREEPS_CLI_CONFIG = previousConfig
    if (previousToken === undefined) delete process.env.SCREEPS_TOKEN
    else process.env.SCREEPS_TOKEN = previousToken
    await rm(directory, { recursive: true, force: true })
  })

  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/api/auth/me') {
      assert.equal(request.headers['x-token'], 'persistent-token')
      return response.end(JSON.stringify({ ok: 1, _id: 'me', username: 'Ada', password: true }))
    }
    if (request.url === '/api/version') return response.end(JSON.stringify({ ok: 1, protocol: 14 }))
    response.writeHead(404).end()
  })
  const sockets = new WebSocketServer({ server })
  sockets.on('connection', socket => socket.on('message', message => {
    if (message.toString() === 'auth persistent-token') socket.send('auth ok rotated-token')
  }))
  await new Promise(resolve => server.listen(0, resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))

  const url = `http://127.0.0.1:${server.address().port}`
  assert.deepEqual(await login({ server: url }), { username: 'Ada', passwordCreated: false })
  const config = JSON.parse(await readFile(process.env.SCREEPS_CLI_CONFIG, 'utf8'))
  assert.equal(config.current, url)
  assert.equal(config.servers[url].token, 'persistent-token')
  assert.equal(config.servers[url].username, 'Ada')
})

test('imports a persistent token from an active desktop session', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'screeps-desktop-login-test-'))
  const storage = join(directory, 'leveldb')
  const previousConfig = process.env.SCREEPS_CLI_CONFIG
  const previousToken = process.env.SCREEPS_TOKEN
  process.env.SCREEPS_CLI_CONFIG = join(directory, 'config.json')
  delete process.env.SCREEPS_TOKEN
  await mkdir(storage)
  const desktopToken = 'd'.repeat(40)
  await writeFile(join(storage, '000001.log'), Buffer.from(`auth+\u0000"${desktopToken}"`, 'latin1'))
  t.after(async () => {
    if (previousConfig === undefined) delete process.env.SCREEPS_CLI_CONFIG
    else process.env.SCREEPS_CLI_CONFIG = previousConfig
    if (previousToken === undefined) delete process.env.SCREEPS_TOKEN
    else process.env.SCREEPS_TOKEN = previousToken
    await rm(directory, { recursive: true, force: true })
  })

  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/api/auth/me') {
      assert.equal(request.headers['x-token'], desktopToken)
      return response.end(JSON.stringify({ ok: 1, _id: 'me', username: 'Ada', password: true }))
    }
    if (request.url === '/api/user/auth-token' && request.method === 'POST') {
      assert.equal(request.headers['x-token'], desktopToken)
      return response.end(JSON.stringify({ ok: 1, token: 'imported-token' }))
    }
    if (request.url === '/api/version') {
      assert.equal(request.headers['x-token'], 'imported-token')
      return response.end(JSON.stringify({ ok: 1, protocol: 14 }))
    }
    response.writeHead(404).end()
  })
  const sockets = new WebSocketServer({ server })
  sockets.on('connection', socket => socket.on('message', message => {
    if (message.toString() === 'auth imported-token') socket.send('auth ok rotated-token')
  }))
  await new Promise(resolve => server.listen(0, resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))

  const url = `http://127.0.0.1:${server.address().port}`
  let prompted = false
  assert.deepEqual(await login({ server: url, storagePath: storage, onDesktopRequired() { prompted = true } }),
    { username: 'Ada', passwordCreated: false })
  assert.equal(prompted, true)
  const config = JSON.parse(await readFile(process.env.SCREEPS_CLI_CONFIG, 'utf8'))
  assert.equal(config.servers[url].token, 'imported-token')
})

test('exchanges a rotating Screeps socket token', async t => {
  const server = new WebSocketServer({ port: 0 })
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => server.close())
  server.on('connection', socket => {
    socket.on('message', message => {
      if (message.toString() === 'auth current-session') socket.send('auth ok next-session')
    })
  })
  const address = server.address()
  const token = await exchangeSocketToken({
    url: `http://127.0.0.1:${address.port}`,
    token: 'current-session'
  })
  assert.equal(token, 'next-session')
})

test('preserves a private server URL path when opening its socket', async t => {
  const server = new WebSocketServer({ port: 0 })
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => server.close())
  server.on('connection', (socket, request) => {
    assert.equal(request.url, '/screeps/socket/websocket')
    socket.on('message', () => socket.send('auth ok'))
  })
  const address = server.address()
  assert.equal(await exchangeSocketToken({
    url: `http://127.0.0.1:${address.port}/screeps`,
    token: 'session'
  }), 'session')
})

test('returns null when a Screeps socket rejects a token', async t => {
  const server = new WebSocketServer({ port: 0 })
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => server.close())
  server.on('connection', socket => socket.on('message', () => socket.send('auth failed')))
  const address = server.address()
  const token = await exchangeSocketToken({
    url: `http://127.0.0.1:${address.port}`,
    token: 'wrong-session'
  })
  assert.equal(token, null)
})
