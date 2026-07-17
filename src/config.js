import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const configPath = () => process.env.SCREEPS_CLI_CONFIG || join(homedir(), '.config', 'screeps-cli', 'config.json')

function normalizeConfig(value = {}) {
  if (value.servers) return { current: value.current, servers: value.servers }

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
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  await chmod(temporary, 0o600)
  await rename(temporary, path)
}

export function environmentConnection() {
  const url = process.env.SCREEPS_URL
  const token = process.env.SCREEPS_TOKEN
  const username = process.env.SCREEPS_USERNAME
  const password = process.env.SCREEPS_PASSWORD
  const serverPassword = process.env.SCREEPS_SERVER_PASSWORD
  const shard = process.env.SCREEPS_SHARD
  if (!url && !token && !username && !password && !serverPassword && !shard) return null
  return { url, token, username, password, serverPassword, shard }
}

export async function getConnection({ requireAuth = true } = {}) {
  const config = await readConfig()
  const saved = config.servers?.[config.current] || {}
  const env = environmentConnection() || {}
  const connection = Object.fromEntries(Object.entries({ ...saved, ...env }).filter(([, value]) => value !== undefined && value !== ''))
  if (!connection.url) throw new Error('No active server. Run: screeps login <server>')
  if (requireAuth && !connection.token && !(connection.username && connection.password)) {
    throw new Error('The active server has no credentials. Run: screeps login <server>')
  }
  return { connection, config }
}

export function normalizeUrl(input) {
  const withProtocol = /^https?:\/\//i.test(input) ? input : `http://${input}`
  const url = new URL(withProtocol)
  url.pathname = url.pathname.replace(/\/?api\/?$/, '').replace(/\/$/, '') || '/'
  return url.toString().replace(/\/$/, '')
}
