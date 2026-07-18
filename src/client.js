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
  const { connection } = await getConnection({ requireAuth: options.requireAuth !== false })
  const api = new ScreepsHttpClient({
    url: connection.url,
    // The upstream client requires credentials at construction time even for
    // public endpoints. A non-secret placeholder is ignored by those routes.
    token: connection.token || (options.requireAuth === false ? 'anonymous' : undefined),
    username: connection.username,
    password: connection.password
  })
  addServerPassword(api, connection.serverPassword)
  api.appConfig.defaultShard = options.shard || connection.shard
  if (!connection.token && connection.username && connection.password) await api.auth()

  api.socket = createLiveSocket(api, connection, options.shard || connection.shard)
  return { api, connection, shard: options.shard || connection.shard }
}

export function output(value, options = {}) {
  if (options.json || typeof value !== 'string') {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
  } else {
    process.stdout.write(`${value}\n`)
  }
}
