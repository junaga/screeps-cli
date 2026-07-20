import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import test from 'node:test'
import { promisify } from 'node:util'
import { WebSocketServer } from 'ws'

const execute = promisify(execFile)
const project = new URL('../', import.meta.url)

function streamCli(args, env, ready, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['bin.js', ...args], { cwd: project, env })
    let stdout = ''
    let stderr = ''
    let stopping = false
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`streaming CLI timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`))
    }, timeout)
    child.stdout.on('data', chunk => {
      stdout += chunk
      if (!stopping && ready(stdout)) {
        stopping = true
        child.kill('SIGINT')
      }
    })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', code => {
      clearTimeout(timer)
      if (code && !stopping) reject(new Error(`CLI exited ${code}\n${stderr}`))
      else resolve({ stdout, stderr })
    })
  })
}

function send(response, body, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

test('runs HTTP-backed game commands against their real client contracts', async t => {
  const requests = []
  let liveSocket
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    const text = request.method === 'POST' ? await new Promise(resolve => {
      let body = ''
      request.setEncoding('utf8')
      request.on('data', chunk => { body += chunk })
      request.on('end', () => resolve(body))
    }) : ''
    const body = text ? JSON.parse(text) : null
    requests.push({ method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body })

    if (url.pathname === '/api/auth/me') return send(response, {
      ok: 1, _id: 'me', username: 'Ada', cpu: 100, gcl: 10, power: 0, money: 50
    })
    if (url.pathname === '/api/auth/query-token') return send(response, {
      ok: 1, _id: 'token-id', token: { full: true, token: 'test-token' }
    })
    if (url.pathname === '/api/user/world-status') return send(response, { ok: 1, status: 'normal' })
    if (url.pathname === '/api/game/time') return send(response, { ok: 1, time: 1234 })
    if (url.pathname === '/api/user/rooms') return send(response, {
      ok: 1, shards: { shard0: ['W1N1'] }, reservations: {}
    })
    if (url.pathname === '/api/user/messages/unread-count') return send(response, { ok: 1, count: 1 })
    if (url.pathname === '/api/game/market/my-orders') return send(response, { ok: 1, shards: {
      shard0: [{ _id: 'world-order', type: 'sell', resourceType: 'energy', remainingAmount: 10, price: 2 }],
      intershard: [{ _id: 'pixel-order', type: 'sell', resourceType: 'pixel', remainingAmount: 1, price: 5 }]
    } })
    if (url.pathname === '/api/game/market/orders') return send(response, { ok: 1, list: [], users: {} })
    if (url.pathname === '/api/user/find') {
      if (url.searchParams.get('id') === 'alice-id') return send(response, { ok: 1, user: { _id: 'alice-id', username: 'Alice' } })
      if (url.searchParams.get('username') === 'Missing') return send(response, { ok: 1, user: {} })
      return send(response, { ok: 1, user: { _id: 'bob-id', username: 'Bob' } })
    }
    if (url.pathname === '/api/user/messages/index') return send(response, {
      ok: 1,
      messages: [{ message: { user: 'me', respondent: 'alice-id', type: 'in', text: 'private hello' } }],
      users: { me: { _id: 'me', username: 'Ada' } }
    })
    if (url.pathname === '/api/user/messages/list') return send(response, {
      ok: 1, messages: [{ type: 'in', text: 'hello' }]
    })
    if (url.pathname === '/api/user/messages/send') return send(response, { ok: 1 })
    if (url.pathname === '/api/user/memory' && request.method === 'POST') return send(response, { ok: 1 })
    if (url.pathname === '/api/user/branches') return send(response, { ok: 1, list: [
      { branch: 'default', activeWorld: true, activeSim: false }
    ] })
    if (url.pathname === '/api/game/room-terrain') return send(response, {
      ok: 1, terrain: { 0: { room: 'W1N1', terrain: '0'.repeat(2500) } }
    })
    if (url.pathname === '/api/game/room-objects') return send(response, {
      ok: 1, objects: [{ _id: 'source', type: 'source', x: 1, y: 1, energy: 3000 }], users: {}
    })
    if (url.pathname === '/api/game/map-stats') return send(response, {
      ok: 1, gameTime: 1234,
      stats: { W1N1: { status: 'normal', own: { user: 'me', level: 3 } } },
      users: { me: { username: 'Ada' } }
    })
    if (url.pathname === '/api/user/console') {
      send(response, { ok: 1 })
      const marker = body.expression.match(/screeps-cli:[0-9a-f-]+:/)?.[0]
      setImmediate(() => liveSocket.send(JSON.stringify(['user:me/console', {
        shard: 'shard0', messages: { log: [`${marker}{"value":0}`] }
      }])))
      return
    }
    return send(response, { error: `unexpected test route: ${request.method} ${url.pathname}` }, 404)
  })
  const sockets = new WebSocketServer({ server })
  sockets.on('connection', socket => {
    liveSocket = socket
    socket.on('message', message => {
      if (message.toString() === 'auth test-token') socket.send('auth ok rotated-token')
    })
  })
  await new Promise(resolve => server.listen(0, resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))

  const url = `http://127.0.0.1:${server.address().port}`
  const env = {
    ...process.env,
    SCREEPS_URL: url,
    SCREEPS_TOKEN: 'test-token',
    SCREEPS_SHARD: 'shard0',
    SCREEPS_CLI_CONFIG: '/does/not/exist'
  }
  const cli = (...args) => execute(process.execPath, ['bin.js', ...args], { cwd: project, env })

  assert.match((await cli()).stdout, /Ada at .* · shard0 · tick 1,234[\s\S]*Room: W1N1/)
  const market = (await cli('market')).stdout
  assert.match(market, /world-order/)
  assert.match(market, /pixel-order/)
  assert.equal(JSON.parse((await cli('market', 'token', '--json')).stdout).resource, 'token')
  assert.equal((await cli('messages')).stdout, 'Alice: private hello\n')
  assert.equal((await cli('messages', '@Bob')).stdout, 'Bob: hello\n')
  assert.equal((await cli('messages', 'send', '@Bob', 'hi')).stdout, 'Sent message to @Bob.\n')
  assert.equal((await cli('memory', 'set', 'settings.mode', '{"safe":true}')).stdout, 'Set Memory.settings.mode.\n')
  assert.match((await cli('code', 'branches')).stdout, /^\* default$/m)
  const tile = JSON.parse((await cli('W1N1', '1,1', '--json')).stdout)
  assert.deepEqual({ room: tile.room, terrain: tile.terrain, object: tile.objects[0]._id }, {
    room: 'W1N1', terrain: 0, object: 'source'
  })
  const map = JSON.parse((await cli('map', 'W1N1', '--radius', '0', '--json')).stdout)
  assert.equal(map.rooms.W1N1.own.level, 3)
  assert.equal((await cli('power', 'delete', 'Operator')).stdout, 'Scheduled Operator for deletion.\n')
  await assert.rejects(cli('@Missing'), /Player @Missing was not found/)

  const recipientCalls = requests.filter(item => item.path.startsWith('/api/user/messages'))
  assert.equal(recipientCalls.find(item => item.path.endsWith('/list')).query.respondent, 'bob-id')
  assert.equal(recipientCalls.find(item => item.path.endsWith('/send')).body.respondent, 'bob-id')
  assert.deepEqual(requests.find(item => item.path === '/api/user/memory').body, {
    path: 'settings.mode', value: { safe: true }, shard: 'shard0'
  })
  assert.deepEqual(requests.find(item => item.path === '/api/game/map-stats').body.rooms, ['W1N1'])
  const tokenMarket = requests.find(item => item.path === '/api/game/market/orders')
  assert.equal(tokenMarket.query.shard, undefined)
  assert.equal(tokenMarket.body?.shard, undefined)
  assert.match(requests.find(item => item.path === '/api/user/console').body.expression,
    /Game\.powerCreeps/)
})

test('starts room watches from the authoritative socket snapshot', async t => {
  const requests = []
  const server = createServer((request, response) => {
    requests.push(request.url)
    if (request.url.startsWith('/api/game/time')) return send(response, { ok: 1, time: 100 })
    return send(response, { error: 'unexpected route' }, 404)
  })
  const sockets = new WebSocketServer({ server })
  sockets.on('connection', socket => socket.on('message', message => {
    const text = message.toString()
    if (text === 'auth test-token') socket.send('auth ok rotated-token')
    if (text === 'subscribe room:W1N1') {
      socket.send(JSON.stringify(['room:W1N1', {
        gameTime: 101,
        objects: { source: { type: 'source', x: 1, y: 1, energy: 3000 } },
        users: {}
      }]))
      setImmediate(() => socket.send(JSON.stringify(['room:W1N1', {
        gameTime: 102,
        objects: { site: { type: 'constructionSite', x: 2, y: 3, progress: 0, progressTotal: 100 } }
      }])))
    }
  }))
  await new Promise(resolve => server.listen(0, resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))

  const env = {
    ...process.env,
    SCREEPS_URL: `http://127.0.0.1:${server.address().port}`,
    SCREEPS_TOKEN: 'test-token',
    SCREEPS_SHARD: 'shard0',
    SCREEPS_CLI_CONFIG: '/does/not/exist'
  }
  const result = await streamCli(['watch', 'W1N1', '--json'], env, output => output.includes('construction site appeared'))
  const lines = result.stdout.trim().split('\n').map(JSON.parse)
  assert.deepEqual(lines[0], {
    type: 'start', tick: 101, room: 'W1N1', target: { kind: 'room', room: 'W1N1' }
  })
  assert.equal(lines[1].tick, 102)
  assert.match(lines[1].message, /construction site appeared/)
  assert.equal(requests.some(path => path.startsWith('/api/game/room-objects')), false)
})

test('follows an object across a room border', async t => {
  const objectId = 'a'.repeat(24)
  let activeSocket
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    if (url.pathname === '/api/auth/me') return send(response, { ok: 1, _id: 'me', username: 'Ada' })
    if (url.pathname === '/api/auth/query-token') return send(response, {
      ok: 1, _id: 'token-id', token: { full: true, token: 'test-token' }
    })
    if (url.pathname === '/api/game/time') return send(response, { ok: 1, time: 200 })
    if (url.pathname === '/api/user/console') {
      let text = ''
      for await (const chunk of request) text += chunk
      const marker = JSON.parse(text).expression.match(/screeps-cli:[0-9a-f-]+:/)?.[0]
      send(response, { ok: 1 })
      setImmediate(() => activeSocket.send(JSON.stringify(['user:me/console', {
        shard: 'shard0',
        messages: { log: [`${marker}${JSON.stringify({ value: {
          id: objectId, type: 'creep', name: 'Scout', pos: { room: 'W0N0', x: 49, y: 25 }
        } })}`] }
      }])))
      return
    }
    return send(response, { error: `unexpected route ${url.pathname}` }, 404)
  })
  const sockets = new WebSocketServer({ server })
  sockets.on('connection', socket => {
    activeSocket = socket
    socket.on('message', message => {
      const text = message.toString()
      if (text === 'auth test-token') socket.send('auth ok rotated-token')
      if (text === 'subscribe room:W0N0') {
        socket.send(JSON.stringify(['room:W0N0', {
          gameTime: 201,
          objects: { [objectId]: { type: 'creep', name: 'Scout', x: 49, y: 25 } },
          users: {}
        }]))
        setImmediate(() => socket.send(JSON.stringify(['room:W0N0', {
          gameTime: 202, objects: { [objectId]: null }
        }])))
      }
      if (text === 'subscribe room:E0N0') {
        socket.send(JSON.stringify(['room:E0N0', {
          gameTime: 202,
          objects: { [objectId]: { type: 'creep', name: 'Scout', x: 0, y: 25 } },
          users: {}
        }]))
      }
    })
  })
  await new Promise(resolve => server.listen(0, resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))

  const env = {
    ...process.env,
    SCREEPS_URL: `http://127.0.0.1:${server.address().port}`,
    SCREEPS_TOKEN: 'test-token',
    SCREEPS_SHARD: 'shard0',
    SCREEPS_CLI_CONFIG: '/does/not/exist'
  }
  const result = await streamCli(['watch', objectId], env, output => output.includes('W0N0 49,25 -> E0N0 0,25'))
  assert.match(result.stdout, /Watching creep Scout in W0N0 from tick 201\./)
  assert.match(result.stdout, /creep Scout moved W0N0 49,25 -> E0N0 0,25\./)
})
