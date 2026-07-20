import { ScreepsHttpClient } from 'screeps-api'
import { getConnection } from './config.js'
import { createLiveSocket } from './live.js'

function addServerPassword(api, serverPassword) {
  if (!serverPassword || !api._http?.interceptors) return
  api._http.interceptors.request.use(request => {
    request.headers ||= {}
    request.headers['X-Server-Password'] = serverPassword
    return request
  })
}

export async function createClient(options = {}) {
  const { connection } = await getConnection({ requireAuth: options.requireAuth !== false, server: options.server })
  const api = new ScreepsHttpClient({
    url: connection.url,
    // The upstream client requires credentials at construction time even for
    // public endpoints. A non-secret placeholder is ignored by those routes.
    token: connection.token || (options.requireAuth === false ? 'anonymous' : undefined),
    username: connection.username,
    password: connection.password
  })
  addServerPassword(api, connection.serverPassword)
  let shard = options.shard || connection.shard
  if (!connection.token && connection.username && connection.password) await api.auth()
  if (!shard && api.isOfficialServer) shard = await discoverShard(api)
  api.appConfig.defaultShard = shard

  api.socket = createLiveSocket(api, connection, shard)
  return { api, connection, shard }
}

export function shardItems(response, shard) {
  const shards = response?.shards || {}
  return shard ? shards[shard] || [] : Object.values(shards).flat()
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
