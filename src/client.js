import { ScreepsHttpClient } from 'screeps-api'
import { getConnection, readConfig, writeConfig } from './config.js'

function addServerPassword(api, serverPassword) {
  if (!serverPassword || !api._http?.interceptors) return
  api._http.interceptors.request.use(request => {
    request.headers ||= {}
    request.headers['X-Server-Password'] = serverPassword
    return request
  })
}

function persistLiveTokens(api, connection) {
  let pendingWrite = Promise.resolve()
  const save = token => {
    if (!token) return
    api._token = token
    connection.liveToken = token
    pendingWrite = pendingWrite.then(async () => {
      const config = await readConfig()
      const saved = config.servers?.[connection.url]
      if (!saved) return
      saved.liveToken = token
      await writeConfig(config)
    })
  }
  api.on('token', save)
  api.socket.on('token', save)
  const connect = api.socket.connect.bind(api.socket)
  api.socket.connect = async () => {
    await connect()
    await pendingWrite
  }
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

  if (connection.liveToken) {
    const liveApi = new ScreepsHttpClient({ url: connection.url, token: connection.liveToken })
    addServerPassword(liveApi, connection.serverPassword)
    liveApi.appConfig.defaultShard = options.shard || connection.shard
    liveApi.me = api.me.bind(api)
    persistLiveTokens(liveApi, connection)
    api.socket = liveApi.socket
  }
  return { api, connection, shard: options.shard || connection.shard }
}

export function output(value, options = {}) {
  if (options.json || typeof value !== 'string') {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
  } else {
    process.stdout.write(`${value}\n`)
  }
}

export function unwrap(response, key) {
  if (key && response && Object.hasOwn(response, key)) return response[key]
  return response
}
