const GLYPHS = {
  source: 'S', mineral: 'M', deposit: 'D', controller: 'C', spawn: 'P',
  extension: 'e', tower: 'T', storage: 'G', terminal: 'L', container: 'n',
  link: 'k', lab: 'l', factory: 'F', observer: 'O', powerSpawn: 'Q', nuker: 'N',
  road: '·', constructedWall: 'W', rampart: 'R', extractor: 'x', portal: '◎',
  keeperLair: 'K', invaderCore: 'I', powerBank: 'B', constructionSite: '+',
  tombstone: '†', ruin: 'r', nuke: '*', creep: '@', powerCreep: '&'
}

const PRIORITY = {
  road: 1, rampart: 2, constructedWall: 3, container: 4, constructionSite: 5,
  creep: 20, powerCreep: 21, spawn: 15, controller: 14, source: 13, mineral: 12
}

export function decodeTerrain(response) {
  const entry = Array.isArray(response?.terrain) ? response.terrain[0] : response?.terrain?.[0] ?? response?.terrain?.['0']
  const encoded = entry?.terrain
  if (typeof encoded !== 'string' || encoded.length < 2500) {
    const grid = Array.from({ length: 50 }, () => Array(50).fill(0))
    for (const tile of response?.terrain || []) grid[tile.y][tile.x] = tile.type === 'wall' ? 1 : tile.type === 'swamp' ? 2 : 0
    return grid
  }
  return Array.from({ length: 50 }, (_, y) => Array.from({ length: 50 }, (_, x) => Number(encoded[y * 50 + x]) || 0))
}

export function indexObjects(objects) {
  const list = Array.isArray(objects) ? objects : Object.values(objects || {}).filter(Boolean)
  const cells = new Map()
  for (const object of list) {
    if (!Number.isInteger(object.x) || !Number.isInteger(object.y)) continue
    const key = `${object.x},${object.y}`
    const current = cells.get(key)
    if (!current || (PRIORITY[object.type] || 6) >= (PRIORITY[current.type] || 6)) cells.set(key, object)
  }
  return cells
}

function glyphFor(object, ownUserId) {
  if (!object) return null
  if (object.type === 'creep' || object.type === 'powerCreep') {
    if (object.user && ownUserId && object.user !== ownUserId) return '!'
  }
  return GLYPHS[object.type] || '?'
}

export function renderRoom({ name, terrain, objects, ownUserId, gameTime, color = process.stdout.isTTY }) {
  const cells = indexObjects(objects)
  const lines = []
  const title = `${name}${gameTime == null ? '' : `  tick ${gameTime}`}`
  lines.push(title, `   ${Array.from({ length: 50 }, (_, x) => Math.floor(x / 10) || ' ').join('')}`, `   ${Array.from({ length: 50 }, (_, x) => x % 10).join('')}`)
  for (let y = 0; y < 50; y++) {
    let row = `${String(y).padStart(2, '0')} `
    for (let x = 0; x < 50; x++) {
      const object = cells.get(`${x},${y}`)
      let glyph = glyphFor(object, ownUserId)
      if (!glyph) glyph = (terrain[y]?.[x] & 1) ? '#' : (terrain[y]?.[x] & 2) ? '~' : ' '
      if (color && object?.user && ownUserId) glyph = object.user === ownUserId ? `\x1b[36m${glyph}\x1b[0m` : `\x1b[31m${glyph}\x1b[0m`
      row += glyph
    }
    lines.push(row)
  }
  lines.push('Legend: # wall  ~ swamp  S source  M mineral  C controller  P spawn  @ your creep  ! hostile  + site')
  return lines.join('\n')
}

export function roomNameToCoordinates(name) {
  const match = /^([WE])(\d+)([NS])(\d+)$/i.exec(name)
  if (!match) throw new Error(`Invalid room name "${name}"`)
  const x = match[1].toUpperCase() === 'E' ? Number(match[2]) : -Number(match[2]) - 1
  const y = match[3].toUpperCase() === 'S' ? Number(match[4]) : -Number(match[4]) - 1
  return { x, y }
}

export function coordinatesToRoomName(x, y) {
  return `${x >= 0 ? `E${x}` : `W${-x - 1}`}${y >= 0 ? `S${y}` : `N${-y - 1}`}`
}

export function roomsAround(center, radius) {
  const origin = roomNameToCoordinates(center)
  const rooms = []
  for (let y = origin.y - radius; y <= origin.y + radius; y++) {
    for (let x = origin.x - radius; x <= origin.x + radius; x++) rooms.push(coordinatesToRoomName(x, y))
  }
  return rooms
}

export function renderWorldMap(center, radius, response) {
  const origin = roomNameToCoordinates(center)
  const stats = response?.stats || {}
  const users = response?.users || {}
  const names = new Map()
  const lines = [`World around ${center}  tick ${response?.gameTime ?? '?'}`, 'Symbol: . neutral  0 reserved  1-8 controller level  # closed']
  for (let y = origin.y - radius; y <= origin.y + radius; y++) {
    const row = []
    for (let x = origin.x - radius; x <= origin.x + radius; x++) {
      const name = coordinatesToRoomName(x, y)
      const room = stats[name]
      let glyph = room?.status && room.status !== 'normal' ? '#' : room?.own ? String(room.own.level ?? 0) : '.'
      if (name === center) glyph = `[${glyph}]`
      else glyph = ` ${glyph} `
      row.push(glyph)
      if (room?.own?.user) names.set(room.own.user, users[room.own.user]?.username || room.own.user)
    }
    lines.push(row.join(''))
  }
  if (names.size) lines.push('', `Owners: ${[...names.values()].join(', ')}`)
  return lines.join('\n')
}

export function mergeRoomObjects(state, patches) {
  for (const [id, patch] of Object.entries(patches || {})) {
    if (patch === null) state.delete(id)
    else state.set(id, { ...(state.get(id) || {}), ...patch })
  }
  return state
}

export function summarizeObjects(objects, users = {}) {
  return (Array.isArray(objects) ? objects : Object.values(objects || {})).filter(Boolean).map(object => ({
    id: object._id,
    type: object.type,
    name: object.name,
    x: object.x,
    y: object.y,
    owner: users[object.user]?.username || object.user,
    hits: object.hits,
    hitsMax: object.hitsMax,
    store: object.store,
    energy: object.energy,
    level: object.level,
    progress: object.progress,
    progressTotal: object.progressTotal
  }))
}
