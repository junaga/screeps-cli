import { CLI_VERSION, DOCS_REVISION, GAME_PROTOCOL } from './version.js'

export { CLI_VERSION }
export const API_CLIENT = { name: 'screeps-api' }
export const SUPPORTED_PROTOCOLS = [GAME_PROTOCOL]

export function assertServerCompatibility(version) {
  if (!version || !Number.isInteger(version.protocol)) {
    throw new Error('The server did not report a Screeps protocol version.')
  }
  if (!SUPPORTED_PROTOCOLS.includes(version.protocol)) {
    throw new Error(`Unsupported Screeps protocol ${version.protocol}; this CLI supports ${SUPPORTED_PROTOCOLS.join(', ')}.`)
  }
  return version
}

export function formatServerSummary({ url, auth, version, live }) {
  const features = (version.serverData?.features || [])
    .map(feature => `${feature.name}${feature.version == null ? '' : ` ${feature.version}`}`)
    .join(', ')
  return [
    `Server:   ${url}`,
    `Protocol: ${version.protocol} (supported)`,
    `Auth:     ${auth.name}${auth.version ? ` ${auth.version}` : ''}`,
    `Live:     ${live ? 'WebSocket' : 'unavailable'}`,
    `Features: ${features || 'none reported'}`,
    `Docs:     screeps/docs ${DOCS_REVISION.slice(0, 7)}`,
    `CLI:      screeps ${CLI_VERSION} using ${API_CLIENT.name}`
  ].join('\n')
}
