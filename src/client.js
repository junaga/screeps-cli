import { on, once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
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

export function isOfficialServerUrl(serverUrl) {
  try {
    return new URL(serverUrl).hostname.toLowerCase() === 'screeps.com'
  } catch {
    return false
  }
}

function correctServerClassification(api, serverUrl) {
  const url = new URL(serverUrl)
  const official = isOfficialServerUrl(serverUrl)
  Object.defineProperties(api, {
    isOfficialServer: { configurable: true, value: official },
    isPtrServer: { configurable: true, value: official && /^\/ptr(?:\/|$)/.test(url.pathname) },
    isSeasonServer: { configurable: true, value: official && /^\/season(?:\/|$)/.test(url.pathname) }
  })
}

export function createHttpClient(connection) {
  const api = new ScreepsHttpClient(connection)
  correctServerClassification(api, connection.url)
  addServerPassword(api, connection.serverPassword)
  return api
}

export async function requireDurableAuthentication(connection) {
  if (isOfficialServerUrl(connection.url)) return
  try {
    const response = await createHttpClient({ ...connection, token: connection.token || 'anonymous' }).authmod()
    if (response?.ok === 1 && response.name) return
  } catch {}
  throw new Error('This private server needs screepsmod-auth before the CLI can save a durable login.')
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
  const liveApi = createHttpClient({
    url: connection.url,
    token: connection.token || httpApi.token,
    serverPassword: connection.serverPassword
  })
  liveApi.appConfig.defaultShard = shard

  // User-scoped subscriptions need the player ID. Resolve it with the stable
  // HTTP token instead of consuming the rotating live credential.
  liveApi.me = httpApi.me.bind(httpApi)

  const socket = liveApi.socket
  liveApi.appConfig.wsResubscribe = false
  const connect = socket.connect.bind(socket)
  const disconnect = socket.disconnect.bind(socket)
  let credential = connection.token ? 'token' : 'password'
  let reconnecting
  let generation = 0

  const abandonFailedConnection = () => {
    if (socket.ws) {
      socket.ws.removeAllListeners()
      socket.ws.terminate()
    }
    socket.__authed = false
    socket.__connected = false
  }

  socket.connect = async () => {
    const token = credential === 'password'
      ? await createSessionToken(connection)
      : (connection.token || httpApi.token)
    liveApi._token = token
    try {
      await connect()
    } catch (error) {
      abandonFailedConnection()
      if (credential !== 'token' || !connection.username || !connection.password) throw error
      credential = 'password'
      liveApi._token = await createSessionToken(connection)
      await connect()
    }
  }

  // screeps-api 2.1.0 rejects after a successful reconnect and subscribes
  // twice. Keep its connection/subscription machinery, but correct the retry
  // loop at this compatibility seam until the dependency ships a fix.
  socket.reconnect = () => {
    if (reconnecting) return reconnecting
    const attemptGeneration = generation
    socket.__reconnecting = true
    const pending = (async () => {
      let lastError
      for (let attempt = 0; attempt < liveApi.appConfig.wsReconnectMaxRetries; attempt++) {
        const milliseconds = Math.min(
          2 ** attempt * liveApi.appConfig.wsReconnectInitDelay,
          liveApi.appConfig.wsReconnectMaxDelay
        )
        await delay(milliseconds)
        if (generation !== attemptGeneration) return
        try {
          await socket.connect()
          for (const eventSpec of Object.keys(socket.__subs)) socket.send(`subscribe ${eventSpec}`)
          return
        } catch (error) {
          lastError = error
        }
      }
      if (generation !== attemptGeneration) return
      const error = new Error(
        `Live connection failed after ${liveApi.appConfig.wsReconnectMaxRetries} retries.`,
        { cause: lastError }
      )
      socket.emit('reconnectFailed', error)
      throw error
    })().finally(() => {
      socket.__reconnecting = false
      if (reconnecting === pending) reconnecting = undefined
    })
    reconnecting = pending
    return pending
  }

  socket.disconnect = () => {
    generation++
    reconnecting = undefined
    disconnect()
  }

  return socket
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

export async function hydrateMessageUsers(api, response) {
  const users = { ...(response?.users || {}) }
  const ids = new Set()
  for (const entry of response?.messages || []) {
    const message = entry.message || entry
    const id = message.respondent || message.user
    if (id && !users[id]) ids.add(id)
  }
  await Promise.all([...ids].map(async id => {
    try {
      const user = (await api.userFindById(id)).user
      if (user?._id && user.username) users[id] = user
    } catch {}
  }))
  return { ...response, users }
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

function roomSubscriptionError(room, event) {
  if (event?.type !== 'server') return null
  const suffix = event.path?.match(/^err@room:(.+)$/)?.[1]
  if (!suffix || (suffix !== room && !suffix.endsWith(`/${room}`))) return null
  const detail = Array.isArray(event.data) ? event.data.join(' ') : String(event.data || 'rejected')
  const error = new Error(`The server refused live updates for ${room}: ${detail}.`)
  error.code = 'SCREEPS_ROOM_SUBSCRIPTION'
  return error
}

export async function openRoomSubscription(socket, room, shard, onUpdate, { timeout = 10_000 } = {}) {
  let initial
  let rejectInitial
  let resolveInitial
  let started = false
  const queued = []
  const first = new Promise((resolve, reject) => {
    resolveInitial = resolve
    rejectInitial = reject
  })
  const receive = event => {
    if (!initial) {
      initial = event
      resolveInitial(event)
    } else if (started) onUpdate(event)
    else queued.push(event)
  }
  const receiveMessage = event => {
    const error = roomSubscriptionError(room, event)
    if (!error) return
    if (!initial) rejectInitial(error)
    else socket.emit('subscriptionFailed', error)
  }
  const reconnectFailed = error => rejectInitial(error)
  socket.on('message', receiveMessage)
  socket.on('reconnectFailed', reconnectFailed)

  let timer
  let subscribed = false
  try {
    await socket.subscribeRoom(room, shard, receive)
    subscribed = true
    const expired = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`The server did not send an initial live snapshot for ${room}.`)
        error.code = 'SCREEPS_ROOM_SUBSCRIPTION'
        reject(error)
      }, timeout)
    })
    await Promise.race([first, expired])
  } catch (error) {
    socket.off('message', receiveMessage)
    socket.off('reconnectFailed', reconnectFailed)
    if (subscribed) {
      try { await socket.unsubscribeRoom(room, shard, receive) } catch {}
    }
    throw error
  } finally {
    clearTimeout(timer)
  }

  return {
    initial,
    start() {
      if (started) return
      started = true
      for (const event of queued.splice(0)) onUpdate(event)
    },
    async close() {
      socket.off('message', receiveMessage)
      socket.off('reconnectFailed', reconnectFailed)
      await socket.unsubscribeRoom(room, shard, receive)
    }
  }
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
