import { access, readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { normalizeUrl, readConfig, writeConfig } from './config.js'

export function defaultClientStoragePaths() {
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
    for (const match of text.matchAll(/auth\+[^\x20-\x7e]*"([A-Za-z0-9_+\/.=-]{40})"/g)) found.push(match[1])
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
  const buffers = []
  for (const entry of entries) {
    if (!entry.isFile() || entry.name === 'LOCK') continue
    try {
      buffers.push(await readFile(join(path, entry.name)))
    } catch {}
  }
  return buffers
}

async function requestJson(url, options) {
  const response = await fetch(url, options)
  let body = {}
  try { body = await response.json() } catch {}
  return { response, body }
}

export async function validateToken({ url, token, serverPassword, username }) {
  if (!token) return null
  const headers = { 'X-Token': token, 'X-Username': token }
  if (serverPassword) headers['X-Server-Password'] = serverPassword
  const { response, body } = await requestJson(`${url.replace(/\/$/, '')}/api/auth/me`, { headers })
  if (!response.ok || body.error || (username && body.username !== username)) return null
  return body
}

async function importDesktopToken({ connection, storagePath }) {
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
    const headers = { 'X-Token': candidate, 'X-Username': candidate }
    if (serverPassword) headers['X-Server-Password'] = serverPassword
    const { response, body } = await requestJson(`${baseUrl}/api/auth/me`, { headers })
    if (!response.ok || body.error) continue
    if (connection.username && body.username !== connection.username) continue
    sessionToken = candidate
    identity = body
    break
  }
  if (!sessionToken) throw new Error('No active desktop session matched this server. Open Screeps, connect to it, leave it running, then retry.')

  const headers = {
    'Content-Type': 'application/json',
    'X-Token': sessionToken,
    'X-Username': sessionToken
  }
  if (serverPassword) headers['X-Server-Password'] = serverPassword
  const { response, body } = await requestJson(`${baseUrl}/api/user/auth-token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'full', description: 'screeps-terminal CLI' })
  })
  if (!response.ok || !body.token) throw new Error(`The server did not create a persistent API token (${body.error || response.status}).`)

  const config = await readConfig()
  config.current = baseUrl
  config.servers ||= {}
  config.servers[baseUrl] = {
    ...(config.servers[baseUrl] || {}),
    url: baseUrl,
    username: identity.username || connection.username,
    token: body.token,
    ...(serverPassword ? { serverPassword } : {})
  }
  delete config.servers[baseUrl].password
  await writeConfig(config)
  return { username: identity.username }
}

export async function login({ server, username, serverPassword, shard, storagePath }) {
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
    config.current = url
    config.servers ||= {}
    config.servers[url] = { ...connection, username: identity.username, token: suppliedToken }
    delete config.servers[url].password
    await writeConfig(config)
    return { username: identity.username }
  }
  if (process.env.SCREEPS_TOKEN) throw new Error('SCREEPS_TOKEN was rejected by this server or belongs to another user.')

  return importDesktopToken({ connection, storagePath })
}
