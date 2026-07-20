import assert from 'node:assert/strict'
import test from 'node:test'
import { WebSocketServer } from 'ws'
import { exchangeSocketToken, extractServerPassword, extractSessionCandidates } from '../src/token.js'

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
