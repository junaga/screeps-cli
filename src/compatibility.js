export const CLI_VERSION = '0.1.0'
export const API_CLIENT = { name: 'screeps-api', version: '2.1.0' }
export const SUPPORTED_PROTOCOLS = [14]

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
    `Live:     ${live ? 'WebSocket' : 'HTTP polling'}`,
    `Features: ${features || 'none reported'}`,
    `CLI:      screeps ${CLI_VERSION} using ${API_CLIENT.name} ${API_CLIENT.version}`
  ].join('\n')
}
