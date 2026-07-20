import { randomBytes } from 'node:crypto'
import { access, readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHttpClient, createSessionToken, exchangeSocketToken } from './client.js'
import { normalizeUrl, readConfig, writeConfig } from './config.js'
import { assertServerCompatibility } from './version.js'

function defaultClientStoragePaths() {
  if (process.platform === 'darwin') {
    return [join(homedir(), 'Library', 'Application Support', 'Screeps', 'Default', 'Local Storage', 'leveldb')]
  }
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    return [
      join(base, 'Screeps', 'User Data', 'Default', 'Local Storage', 'leveldb'),
      join(base, 'Screeps', 'Default', 'Local Storage', 'leveldb')
    ]
  }
  return [join(homedir(), '.config', 'Screeps', 'Default', 'Local Storage', 'leveldb')]
}

export function extractSessionCandidates(buffers) {
  const found = []
  for (const buffer of buffers) {
    const text = buffer.toString('latin1')
    for (const match of text.matchAll(/auth\+[^\x20-\x7e]*"([A-Za-z0-9_+/.=-]{40})"/g)) found.push(match[1])
  }
  return [...new Set(found)].reverse()
}

export function extractServerPassword(buffers, hostname) {
  const escaped = hostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`"host":"${escaped}"[\\s\\S]{0,240}?"password":"((?:\\\\.|[^"])*)"`, 'g')
  let password
  for (const buffer of buffers) {
    for (const match of buffer.toString('latin1').matchAll(pattern)) {
      try { password = JSON.parse(`"${match[1]}"`) } catch { password = match[1] }
    }
  }
  return password
}

async function findStoragePath(explicitPath) {
  const selectedPath = explicitPath || process.env.SCREEPS_CLIENT_DATA
  const candidates = selectedPath ? [selectedPath] : defaultClientStoragePaths()
  for (const path of candidates) {
    try { await access(path); return path } catch {}
  }
  throw new Error(`Screeps desktop storage not found. Checked: ${candidates.join(', ')}`)
}

async function readStorage(path) {
  const entries = await readdir(path, { withFileTypes: true })
  return (await Promise.all(entries
    .filter(entry => entry.isFile() && entry.name !== 'LOCK')
    .map(entry => readFile(join(path, entry.name)).catch(() => null)))).filter(Boolean)
}

const request = (connection, method, path, params) => createHttpClient(connection).req(method, path, params)

async function identityFor(connection) {
  try {
    const api = createHttpClient(connection)
    const identity = await api.authMe()
    return identity.error ? null : { identity, token: api.token }
  } catch (error) {
    if (!error.status) throw error
    return null
  }
}

async function setAccountPassword(connection, password) {
  const body = await request(connection, 'POST', '/api/user/password', { password })
  if (body.ok !== 1) throw new Error(`The server could not enable durable live login (${body.error || 'request failed'}).`)
}

async function saveLogin(config, connection) {
  config.current = connection.url
  config.servers ||= {}
  config.servers[connection.url] = { ...config.servers[connection.url], ...connection }
  delete config.servers[connection.url].liveToken
  await writeConfig(config)
}

async function prepareLiveLogin({ connection, config, identity, token }) {
  if (await exchangeSocketToken({ ...connection, token })) return { password: connection.password, passwordCreated: false }

  let password = process.env.SCREEPS_PASSWORD || connection.password
  let passwordCreated = false
  if (identity.password === false) {
    password ||= randomBytes(32).toString('base64url')
    await saveLogin(config, { ...connection, username: identity.username, token, password })
    await setAccountPassword({ ...connection, token }, password)
    passwordCreated = true
  }
  if (!password) throw new Error('This account already has a password. Set SCREEPS_PASSWORD, then run login again.')
  const sessionToken = await createSessionToken({ ...connection, username: identity.username, password })
  if (!await exchangeSocketToken({ ...connection, token: sessionToken })) {
    throw new Error('Account sign-in succeeded but the server rejected its live session.')
  }
  return { password, passwordCreated }
}

async function validateToken({ url, token, serverPassword, username }) {
  if (!token) return null
  const result = await identityFor({ url, token, serverPassword })
  return result && (!username || result.identity.username === username) ? result.identity : null
}

async function validateServer({ url, token, serverPassword }) {
  const body = await createHttpClient({ url, token, serverPassword }).version()
  if (body.error) throw new Error(`Cannot inspect the Screeps server (${body.error}).`)
  return assertServerCompatibility(body)
}

async function findDesktopSession({ connection, storagePath }) {
  const path = await findStoragePath(storagePath)
  const buffers = await readStorage(path)
  const candidates = extractSessionCandidates(buffers)
  if (!candidates.length) throw new Error('No private-server session found. Open Screeps, connect to this server, leave it running, then retry.')

  const baseUrl = connection.url.replace(/\/$/, '')
  const hostname = new URL(baseUrl).hostname
  const serverPassword = connection.serverPassword ?? extractServerPassword(buffers, hostname)
  let sessionToken
  let identity

  for (const candidate of candidates) {
    const result = await identityFor({ url: baseUrl, token: candidate, serverPassword })
    if (!result || (connection.username && result.identity.username !== connection.username)) continue
    sessionToken = result.token
    identity = result.identity
    break
  }
  if (!sessionToken) throw new Error('No active desktop session matched this server. Open Screeps, connect to it, leave it running, then retry.')

  return { identity, serverPassword, sessionToken }
}

async function importDesktopToken({ connection, storagePath }) {
  const baseUrl = connection.url.replace(/\/$/, '')
  const { identity, serverPassword, sessionToken } = await findDesktopSession({ connection, storagePath })

  const body = await request({ url: baseUrl, token: sessionToken, serverPassword },
    'POST', '/api/user/auth-token', { type: 'full', description: 'screeps-terminal CLI' })
  if (!body.token) throw new Error(`The server did not create a persistent API token (${body.error || 'request failed'}).`)
  await validateServer({ url: baseUrl, token: body.token, serverPassword })
  const config = await readConfig()
  const imported = {
    ...connection,
    url: baseUrl,
    username: identity.username || connection.username,
    token: body.token,
    ...(serverPassword ? { serverPassword } : {})
  }
  await saveLogin(config, imported)
  const live = await prepareLiveLogin({ connection: imported, config, identity, token: body.token })
  await saveLogin(config, { ...imported, ...(live.password ? { password: live.password } : {}) })
  return { username: identity.username, passwordCreated: live.passwordCreated }
}

export async function login({ server, username, serverPassword, shard, storagePath, onDesktopRequired }) {
  const url = normalizeUrl(server)
  const config = await readConfig()
  const saved = config.servers?.[url] || {}
  const connection = {
    ...saved,
    url,
    username: username || saved.username,
    serverPassword: serverPassword || process.env.SCREEPS_SERVER_PASSWORD || saved.serverPassword,
    shard: shard || saved.shard
  }
  const suppliedToken = process.env.SCREEPS_TOKEN || connection.token
  const identity = await validateToken({ ...connection, token: suppliedToken })

  if (identity) {
    await validateServer({ ...connection, token: suppliedToken })
    const live = await prepareLiveLogin({ connection, config, identity, token: suppliedToken })
    await saveLogin(config, {
      ...connection,
      username: identity.username,
      token: suppliedToken,
      ...(live.password ? { password: live.password } : {})
    })
    return { username: identity.username, passwordCreated: live.passwordCreated }
  }
  if (process.env.SCREEPS_TOKEN) throw new Error('SCREEPS_TOKEN was rejected by this server or belongs to another user.')

  if (onDesktopRequired) await onDesktopRequired(url)

  return importDesktopToken({ connection, storagePath })
}
