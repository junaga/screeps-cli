import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const configPath = () => process.env.SCREEPS_CLI_CONFIG || join(homedir(), '.config', 'screeps-cli', 'config.json')

function normalizeConfig(value = {}) {
  if (value.servers) {
    const servers = {}
    for (const connection of Object.values(value.servers)) {
      if (!connection?.url) continue
      const url = normalizeUrl(connection.url)
      servers[url] = { ...connection, url }
    }
    const current = value.current ? normalizeUrl(value.current) : Object.keys(servers)[0]
    return { current, servers }
  }

  // Migrate the pre-0.1 named-profile format.
  const servers = {}
  for (const connection of Object.values(value.profiles || {})) {
    if (connection.url) servers[normalizeUrl(connection.url)] = { ...connection, url: normalizeUrl(connection.url) }
  }
  const currentUrl = value.profiles?.[value.current]?.url
  return { current: currentUrl ? normalizeUrl(currentUrl) : Object.keys(servers)[0], servers }
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
  await chmod(directory, 0o700)
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

export function environmentConnection() {
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

export async function getConnection({ requireAuth = true } = {}) {
  const config = await readConfig()
  const env = environmentConnection() || {}
  const selectedUrl = env.url ? normalizeUrl(env.url) : config.current
  const saved = config.servers?.[selectedUrl] || {}
  const connection = Object.fromEntries(Object.entries({ ...saved, ...env, url: selectedUrl }).filter(([, value]) => value !== undefined && value !== ''))
  if (!connection.url) throw new Error('No active server. Run: screeps login <server>')
  if (requireAuth && !connection.token && !(connection.username && connection.password)) {
    throw new Error('The active server has no credentials. Run: screeps login <server>')
  }
  return { connection, config }
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
