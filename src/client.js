import { on, once } from 'node:events'
import WebSocket from 'ws'
import { ScreepsHttpClient } from 'screeps-api'
import { getConnection } from './config.js'

function socketUrl(serverUrl) {
  const url = new URL('socket/websocket', `${serverUrl.replace(/\/$/, '')}/`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url
}

function addServerPassword(api, serverPassword) {
  if (!serverPassword || !api._http?.interceptors) return
  api._http.interceptors.request.use(request => {
    request.headers ||= {}
    request.headers['X-Server-Password'] = serverPassword
    return request
  })
}

export function createHttpClient(connection) {
  const api = new ScreepsHttpClient(connection)
  addServerPassword(api, connection.serverPassword)
  return api
}

export async function createSessionToken(connection) {
  if (!connection.username || !connection.password) throw new Error('Account credentials are required for a fresh live session.')
  try {
    const { token } = await createHttpClient({ ...connection, token: undefined })
      .authSignin(connection.username, connection.password)
    if (token) return token
  } catch {}
  throw new Error('The server rejected the saved account credential.')
}

export async function exchangeSocketToken({ url, token, serverPassword, timeout = 5000 }) {
  if (!token) return null

  const headers = serverPassword ? { 'X-Server-Password': serverPassword } : undefined
  const socket = new WebSocket(socketUrl(url), { headers })
  const signal = AbortSignal.timeout(timeout)
  try {
    await once(socket, 'open', { signal })
    const messages = on(socket, 'message', { signal })
    socket.send(`auth ${token}`)
    for await (const [data] of messages) {
      const match = data.toString().match(/^auth (ok|failed)(?: (.+))?$/)
      if (match) return match[1] === 'ok' ? (match[2] || token) : null
    }
  } catch {
    return null
  } finally {
    if (socket.readyState === WebSocket.OPEN) socket.close()
    else if (socket.readyState === WebSocket.CONNECTING) socket.terminate()
  }
}

export function createLiveSocket(httpApi, connection, shard) {
  const liveApi = new ScreepsHttpClient({ url: connection.url, token: connection.token || httpApi.token })
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

export async function createClient(options = {}) {
  const { connection } = await getConnection({ requireAuth: options.requireAuth !== false, server: options.server })
  // The upstream client requires credentials at construction time even for
  // public endpoints. A non-secret placeholder is ignored by those routes.
  const api = createHttpClient({ ...connection,
    token: connection.token || (options.requireAuth === false ? 'anonymous' : undefined) })
  let shard = options.shard || connection.shard
  if (!connection.token && connection.username && connection.password) await api.auth()
  if (!shard && api.isOfficialServer) shard = await discoverShard(api)
  api.appConfig.defaultShard = shard

  api.socket = createLiveSocket(api, connection, shard)
  return { api, connection, shard }
}

export function shardItems(shards, shard) {
  shards ||= {}
  return shard ? shards[shard] || shards.privSrv || [] : Object.values(shards).flat()
}

export function marketItems(response, shard) {
  const orders = response?.shards || response || {}
  const world = shard && !orders[shard] && orders.privSrv ? 'privSrv' : shard
  const groups = world ? [...new Set([world, 'intershard'])] : Object.keys(orders)
  return groups.flatMap(group => Array.isArray(orders[group]) ? orders[group] : [])
}

export async function playerId(api, username) {
  const id = (await api.userFind(username)).user?._id
  if (!id) throw new Error(`Player @${username} was not found.`)
  return id
}

export async function discoverShard(api) {
  const me = await api.authMe()
  const { shards = {} } = await api.userRooms(me._id)
  const occupied = Object.entries(shards).find(([, rooms]) => rooms.length)
  if (occupied) return occupied[0]
  const available = (await api.gameShardsInfo()).shards || []
  const shard = available.toSorted((left, right) => right.users - left.users)[0]?.name
  if (!shard) throw new Error('The server reported no available world shard.')
  return shard
}

export function output(value, options = {}) {
  if (options.ndjson) {
    process.stdout.write(`${JSON.stringify(value)}\n`)
    return
  }
  if (options.json || typeof value !== 'string') {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
  } else {
    process.stdout.write(`${value}\n`)
  }
}
