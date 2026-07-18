import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { WebSocketServer } from 'ws'
import { createClient } from '../src/client.js'
import { writeConfig } from '../src/config.js'

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
      token: 'persistent-http'
    } }
  })

  const { api } = await createClient()
  await api.socket.connect()
  api.socket.disconnect()

  const config = JSON.parse(await readFile(process.env.SCREEPS_CLI_CONFIG, 'utf8'))
  assert.equal(signins, 1)
  assert.equal(config.servers[url].token, 'persistent-http')
  assert.equal(config.servers[url].password, 'account-secret')
  assert.equal(config.servers[url].liveToken, undefined)
})
