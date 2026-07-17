import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { WebSocketServer } from 'ws'
import { createClient } from '../src/client.js'
import { writeConfig } from '../src/config.js'

test('uses and persists the rotating live token separately from HTTP auth', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'screeps-client-test-'))
  const previousConfig = process.env.SCREEPS_CLI_CONFIG
  process.env.SCREEPS_CLI_CONFIG = join(directory, 'config.json')
  t.after(async () => {
    if (previousConfig === undefined) delete process.env.SCREEPS_CLI_CONFIG
    else process.env.SCREEPS_CLI_CONFIG = previousConfig
    await rm(directory, { recursive: true, force: true })
  })

  const server = new WebSocketServer({ port: 0 })
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => server.close())
  server.on('connection', socket => socket.on('message', message => {
    if (message.toString() === 'auth current-live') socket.send('auth ok next-live')
  }))

  const address = server.address()
  const url = `http://127.0.0.1:${address.port}`
  await writeConfig({
    current: url,
    servers: { [url]: { url, token: 'persistent-http', liveToken: 'current-live' } }
  })

  const { api } = await createClient()
  await api.socket.connect()
  api.socket.disconnect()

  const config = JSON.parse(await readFile(process.env.SCREEPS_CLI_CONFIG, 'utf8'))
  assert.equal(config.servers[url].token, 'persistent-http')
  assert.equal(config.servers[url].liveToken, 'next-live')
})
