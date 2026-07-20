import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const configPath = () => process.env.SCREEPS_CLI_CONFIG || join(homedir(), '.config', 'screeps-cli', 'config.json')

function normalizeConfig(value = {}) {
  const servers = {}
  for (const connection of Object.values(value.servers || {})) {
    if (!connection?.url) continue
    const url = normalizeUrl(connection.url)
    servers[url] = { ...connection, url }
  }
  const current = value.current ? normalizeUrl(value.current) : Object.keys(servers)[0]
  return { current, servers }
}

export async function readConfig() {
  try {
    return normalizeConfig(JSON.parse(await readFile(configPath(), 'utf8')))
  } catch (error) {
    if (error.code === 'ENOENT') return { current: undefined, servers: {} }
    throw new Error(`Cannot read ${configPath()}: ${error.message}`)
  }
}

export async function writeConfig(config) {
  const path = configPath()
  const directory = dirname(path)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
    await chmod(temporary, 0o600)
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch(error => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

function environmentConnection() {
  const values = {
    url: process.env.SCREEPS_URL,
    token: process.env.SCREEPS_TOKEN,
    username: process.env.SCREEPS_USERNAME,
    password: process.env.SCREEPS_PASSWORD,
    serverPassword: process.env.SCREEPS_SERVER_PASSWORD,
    shard: process.env.SCREEPS_SHARD
  }
  const connection = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== ''))
  return Object.keys(connection).length ? connection : null
}

function configuredServer(config, selector) {
  if (!selector) return config.current
  const lowered = selector.toLowerCase()
  const match = Object.entries(config.servers || {}).find(([url, connection]) => {
    const parsed = new URL(url)
    return url.toLowerCase() === lowered || parsed.host.toLowerCase() === lowered ||
      parsed.hostname.toLowerCase() === lowered || connection.name?.toLowerCase() === lowered
  })
  if (match) return match[0]
  try {
    const normalized = normalizeUrl(selector)
    if (config.servers?.[normalized]) return normalized
  } catch {}
  throw new Error(`Unknown server "${selector}". Run: screeps login ${selector}`)
}

export async function getConnection({ requireAuth = true, server } = {}) {
  const config = await readConfig()
  const env = environmentConnection() || {}
  const selectedUrl = env.url ? normalizeUrl(env.url) : configuredServer(config, server)
  const saved = config.servers?.[selectedUrl] || {}
  const connection = Object.fromEntries(Object.entries({ ...saved, ...env, url: selectedUrl }).filter(([, value]) => value !== undefined && value !== ''))
  if (!connection.url) throw new Error('No active server. Run: screeps login <server>')
  if (requireAuth && !connection.token && !(connection.username && connection.password)) {
    throw new Error('The active server has no credentials. Run: screeps login <server>')
  }
  return { connection, config }
}

export async function forgetServer(selector) {
  const config = await readConfig()
  const url = configuredServer(config, selector)
  if (!url) throw new Error('No remembered server to log out from.')
  if (!config.servers?.[url]) throw new Error(`Server "${selector}" is not remembered.`)
  delete config.servers[url]
  if (config.current === url) config.current = Object.keys(config.servers)[0]
  await writeConfig(config)
  return url
}

export function normalizeUrl(input) {
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `http://${input}`
  const url = new URL(withProtocol)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Server URL must use HTTP or HTTPS.')
  if (url.username || url.password) throw new Error('Do not put credentials in the server URL.')
  if (url.search || url.hash) throw new Error('Server URL cannot contain a query or fragment.')
  url.pathname = url.pathname.replace(/\/?api\/?$/, '').replace(/\/$/, '') || '/'
  return url.toString().replace(/\/$/, '')
}
