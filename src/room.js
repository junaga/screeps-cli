import { formatNumber } from './format.js'

const GLYPHS = {
  source: 'S', mineral: 'M', deposit: 'D', controller: 'C', spawn: 'P',
  extension: 'e', tower: 'T', storage: 'G', terminal: 'L', container: 'n',
  link: 'k', lab: 'l', factory: 'F', observer: 'O', powerSpawn: 'Q', nuker: 'N',
  road: '.', constructedWall: 'W', rampart: 'R', extractor: 'x', portal: 'o',
  keeperLair: 'K', invaderCore: 'I', powerBank: 'B', constructionSite: '+',
  tombstone: 't', ruin: 'r', nuke: '*', energy: '$', creep: '@', powerCreep: '&'
}

const PRIORITY = {
  road: 1, rampart: 2, constructedWall: 3, container: 4, constructionSite: 5,
  energy: 10, creep: 20, powerCreep: 21, spawn: 15, controller: 14, source: 13, mineral: 12
}

export function decodeTerrain(response) {
  const entries = Array.isArray(response?.terrain) ? response.terrain : Object.values(response?.terrain || {})
  const encoded = entries.find(entry => typeof entry?.terrain === 'string')?.terrain
  if (typeof encoded !== 'string' || encoded.length < 2500) {
    const grid = Array.from({ length: 50 }, () => Array(50).fill(0))
    for (const tile of entries) {
      if (!Number.isInteger(tile?.x) || !Number.isInteger(tile?.y) || tile.x < 0 || tile.x > 49 || tile.y < 0 || tile.y > 49) continue
      grid[tile.y][tile.x] = tile.type === 'wall' ? 1 : tile.type === 'swamp' ? 2 : 0
    }
    return grid
  }
  return Array.from({ length: 50 }, (_, y) => Array.from({ length: 50 }, (_, x) => Number(encoded[y * 50 + x]) || 0))
}

function indexObjects(objects) {
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
  const title = `${name}${gameTime == null ? '' : `  tick ${formatNumber(gameTime)}`}`
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
  lines.push('Legend: # wall  ~ swamp  . road  S source  M mineral  C controller  P spawn  $ resource  @ your creep  ! hostile  + site')
  return lines.join('\n')
}

export function renderLiveRoomFrame(room) {
  const lines = renderRoom(room).split('\n')
  lines[0] += '  live · Ctrl-C to close'
  lines[lines.length - 1] = '# wall  ~ swamp  . road  S source  M mineral'
  lines.push('C controller  P spawn  $ resource  @ yours  ! hostile  + site')
  return lines.join('\n')
}

function words(value) {
  return String(value || 'object').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

function owner(object, users, ownUserId) {
  if (!object.user) return null
  if (object.user === ownUserId) return 'yours'
  return users[object.user]?.username || object.user
}

const amount = value => formatNumber(value, '?')

function describeObject(object, users = {}, ownUserId) {
  const title = object.type === 'energy'
    ? `dropped ${object.resourceType || 'resource'}`
    : `${words(object.type)}${object.name ? ` ${object.name}` : ''}`
  const details = [owner(object, users, ownUserId)]
  const held = resources(object)
  const energy = held.energy
  const capacity = object.storeCapacity ?? object.storeCapacityResource?.energy ?? object.energyCapacity
  if (energy != null) details.push(`${amount(energy)}${capacity == null ? '' : `/${amount(capacity)}`} energy`)
  for (const [resource, quantity] of Object.entries(held)) {
    if (resource !== 'energy') details.push(`${amount(quantity)} ${resource}`)
  }
  if (object.hits != null) details.push(`${amount(object.hits)}/${amount(object.hitsMax)} hits`)
  if (object.level != null) details.push(`level ${object.level}`)
  if (object.progress != null) details.push(`${amount(object.progress)}/${amount(object.progressTotal)} progress`)
  if (object.body?.length) {
    const parts = Object.entries(Object.groupBy(object.body, part => String(part.type).toUpperCase()))
      .map(([part, entries]) => `${entries.length} ${part}`)
    details.push(parts.join(', '))
  }
  if (object.fatigue) details.push(`${object.fatigue} fatigue`)
  if (object.spawning) details.push(`spawning ${object.spawning.name || 'a creep'}`)
  return `${title}${details.filter(Boolean).length ? ` · ${details.filter(Boolean).join(' · ')}` : ''}`
}

export function renderTile({ name, x, y, terrain, objects, users, ownUserId }) {
  const terrainName = (terrain[y]?.[x] & 1) ? 'wall' : (terrain[y]?.[x] & 2) ? 'swamp' : 'plain'
  const occupants = objects.filter(object => object.x === x && object.y === y)
  return [
    `${name} ${x},${y} · ${terrainName}`,
    ...(occupants.length ? occupants.map(object => describeObject(object, users, ownUserId)) : ['No objects.'])
  ].join('\n')
}

function objectName(object) {
  if (object.type === 'energy') return `dropped ${object.resourceType || 'resource'}`
  return `${words(object.type)}${object.name ? ` ${object.name}` : ''}`
}

function position(value) {
  return `${value.x},${value.y}`
}

function resources(object) {
  const values = { ...object.store }
  if (object.energy != null && values.energy == null) values.energy = object.energy
  if (object.mineralAmount != null && object.mineralType) values[object.mineralType] = object.mineralAmount
  if (object.amount != null && object.resourceType) values[object.resourceType] = object.amount
  if (object.resourceType && object[object.resourceType] != null) values[object.resourceType] = object[object.resourceType]
  return values
}

const onTile = (objects, target) => target && objects.some(object => object?.x === target.x && object?.y === target.y)

function movementAndDamage(previous, current, patch, name, detailed) {
  const lines = []
  if (detailed && (patch.x != null || patch.y != null) && (previous.x !== current.x || previous.y !== current.y)) {
    lines.push(`${name} moved ${position(previous)} -> ${position(current)}.`)
  }
  if (patch.hits != null && previous.hits != null && previous.hits !== current.hits) {
    const change = current.hits - previous.hits
    if (detailed || change < 0 || ['creep', 'powerCreep'].includes(current.type)) {
      lines.push(`${name} ${change < 0 ? 'lost' : 'recovered'} ${amount(Math.abs(change))} hits (${amount(current.hits)}/${amount(current.hitsMax)}).`)
    }
  }
  return lines
}

function resourceAndProgress(previous, current, patch, name, detailed) {
  if (!detailed) return []
  const lines = []
  const resourceType = current.resourceType || previous.resourceType
  if (patch.store || patch.energy != null || patch.mineralAmount != null || patch.amount != null ||
      (resourceType && Object.hasOwn(patch, resourceType))) {
    const before = resources(previous)
    const after = resources(current)
    for (const resource of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (before[resource] !== after[resource]) {
        const label = current.type === 'energy' && current.resourceType === resource ? name : `${name} ${resource}`
        lines.push(`${label} changed ${amount(before[resource] ?? 0)} -> ${amount(after[resource] ?? 0)}.`)
      }
    }
  }
  if (patch.progress != null && previous.progress != null && previous.progress !== current.progress) {
    lines.push(`${name} progress changed ${amount(previous.progress)} -> ${amount(current.progress)}.`)
  }
  return lines
}

function lifecycleChanges(previous, current, patch, name) {
  const lines = []
  if (patch.level != null && previous.level != null && previous.level !== current.level) lines.push(`${name} reached level ${current.level}.`)
  if (patch.spawning !== undefined && Boolean(previous.spawning) !== Boolean(current.spawning)) {
    if (current.spawning) lines.push(`${name} started spawning ${current.spawning.name || 'a creep'}.`)
    else if (previous.spawning) lines.push(`${name} finished spawning ${previous.spawning.name || 'a creep'}.`)
  }
  return lines
}

const userName = (users, id) => id ? users[id]?.username || id : null

function controlChanges(previous, current, patch, name, users) {
  const lines = []
  if (patch.user !== undefined && previous.user !== current.user) {
    const username = userName(users, current.user)
    lines.push(username ? `${name} is now owned by ${username}.` : `${name} became neutral.`)
  }
  if (patch.reservation !== undefined && previous.reservation?.user !== current.reservation?.user) {
    const username = userName(users, current.reservation?.user)
    lines.push(username ? `${name} is now reserved by ${username}.` : `${name} is no longer reserved.`)
  }
  if (patch.safeMode !== undefined && Boolean(previous.safeMode) !== Boolean(current.safeMode)) {
    lines.push(`${name} safe mode ${current.safeMode ? 'activated' : 'ended'}.`)
  }
  return lines
}

export function describeRoomChanges(state, patches, users = {}, options = {}) {
  const lines = []
  for (const [id, patch] of Object.entries(patches || {})) {
    const previous = state.get(id)
    const current = patch === null ? previous : applyObjectPatch(previous, patch, id)
    const onTargetTile = onTile([previous, current], options.targetPosition)
    const detailed = options.verbose || options.targetId === id || onTargetTile
    if (options.targetId && options.targetId !== id) continue
    if (options.targetPosition && !onTargetTile) continue
    if (patch === null) {
      if (previous) lines.push(`${objectName(previous)} disappeared from ${position(previous)}.`)
      continue
    }

    const name = objectName(current)
    if (!previous) {
      lines.push(`${name} appeared at ${position(current)}.`)
      continue
    }
    lines.push(
      ...movementAndDamage(previous, current, patch, name, detailed),
      ...resourceAndProgress(previous, current, patch, name, detailed),
      ...lifecycleChanges(previous, current, patch, name),
      ...controlChanges(previous, current, patch, name, users)
    )
  }
  mergeRoomObjects(state, patches)
  return lines
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

export function roomsAcrossBorder(room, position) {
  const origin = roomNameToCoordinates(room)
  const horizontal = position?.x === 0 ? -1 : position?.x === 49 ? 1 : 0
  const vertical = position?.y === 0 ? -1 : position?.y === 49 ? 1 : 0
  const offsets = []
  if (horizontal && vertical) offsets.push([horizontal, vertical])
  if (horizontal) offsets.push([horizontal, 0])
  if (vertical) offsets.push([0, vertical])
  return offsets.map(([x, y]) => coordinatesToRoomName(origin.x + x, origin.y + y))
}

function mapGlyph(room) {
  if (room?.status && room.status !== 'normal') return '#'
  return room?.own ? String(room.own.level ?? 0) : '.'
}

export function renderWorldMap(center, radius, response) {
  const origin = roomNameToCoordinates(center)
  const stats = response?.stats || {}
  const users = response?.users || {}
  const names = new Map()
  const tick = formatNumber(response?.gameTime, '?')
  const lines = [`${center} · tick ${tick}`, '. neutral · 0 reserved · 1-8 RCL · # closed']
  for (let y = origin.y - radius; y <= origin.y + radius; y++) {
    const row = []
    for (let x = origin.x - radius; x <= origin.x + radius; x++) {
      const name = coordinatesToRoomName(x, y)
      const room = stats[name]
      let glyph = mapGlyph(room)
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
    else state.set(id, applyObjectPatch(state.get(id), patch, id))
  }
  return state
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function mergeNested(previous, patch) {
  if (Array.isArray(patch)) return patch.map(value => mergeNested(undefined, value))
  if (!isRecord(patch)) return patch
  const target = Array.isArray(previous) ? [...previous] : { ...(isRecord(previous) ? previous : {}) }
  for (const [key, value] of Object.entries(patch)) target[key] = mergeNested(target[key], value)
  return target
}

function applyObjectPatch(previous, patch, id) {
  return { _id: id, ...mergeNested(previous, patch) }
}

export function replaceRoomObjects(state, objects) {
  state.clear()
  if (Array.isArray(objects)) {
    for (const object of objects) {
      if (object?._id) state.set(object._id, mergeNested(undefined, object))
    }
    return state
  }
  return mergeRoomObjects(state, objects)
}
