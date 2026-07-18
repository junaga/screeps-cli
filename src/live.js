import WebSocket from 'ws'
import { ScreepsHttpClient } from 'screeps-api'

function socketUrl(serverUrl) {
  const url = new URL('socket/websocket', serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url
}

export async function createSessionToken({ url, username, password, serverPassword }) {
  if (!username || !password) throw new Error('Account credentials are required for a fresh live session.')
  const headers = { 'Content-Type': 'application/json' }
  if (serverPassword) headers['X-Server-Password'] = serverPassword
  const response = await fetch(`${url.replace(/\/$/, '')}/api/auth/signin`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: username, password })
  })
  let body = {}
  try { body = await response.json() } catch {}
  if (!response.ok || !body.token) throw new Error('The server rejected the saved account credential.')
  return body.token
}

export async function exchangeSocketToken({ url, token, serverPassword, timeout = 5000 }) {
  if (!token) return null

  const headers = serverPassword ? { 'X-Server-Password': serverPassword } : undefined
  return new Promise(resolve => {
    const socket = new WebSocket(socketUrl(url), { headers })
    let timer
    let settled = false

    const finish = nextToken => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (socket.readyState === WebSocket.OPEN) socket.close()
      else if (socket.readyState === WebSocket.CONNECTING) socket.terminate()
      resolve(nextToken)
    }

    timer = setTimeout(() => finish(null), timeout)
    socket.once('open', () => socket.send(`auth ${token}`))
    socket.on('message', data => {
      const match = data.toString().match(/^auth (ok|failed)(?: (.+))?$/)
      if (match) finish(match[1] === 'ok' ? (match[2] || token) : null)
    })
    socket.once('error', () => finish(null))
    socket.once('unexpected-response', () => finish(null))
  })
}

export function createLiveSocket(httpApi, connection, shard) {
  const liveApi = new ScreepsHttpClient({ url: connection.url, token: connection.token })
  liveApi.appConfig.defaultShard = shard

  // User-scoped subscriptions need the player ID. Resolve it with the stable
  // HTTP token instead of consuming the rotating live credential.
  liveApi.me = httpApi.me.bind(httpApi)

  const connect = liveApi.socket.connect.bind(liveApi.socket)
  liveApi.socket.connect = async () => {
    // The upstream client has no public token setter. Reset its private token
    // at this pinned compatibility seam before every initial connection or
    // automatic reconnect; rotating socket tokens are deliberately not saved.
    liveApi._token = connection.username && connection.password
      ? await createSessionToken(connection)
      : connection.token
    await connect()
  }

  return liveApi.socket
}
