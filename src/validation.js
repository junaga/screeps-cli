export function integer(value, label, { min, max } = {}) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || (min != null && parsed < min) || (max != null && parsed > max)) {
    const range = min != null && max != null ? ` from ${min} to ${max}` : min != null ? ` of at least ${min}` : ''
    throw new Error(`${label} must be an integer${range}.`)
  }
  return parsed
}

export const coordinate = value => integer(value, 'Coordinate', { min: 0, max: 49 })
export const flagColor = value => integer(value, 'Flag color', { min: 1, max: 10 })
export const pageNumber = value => integer(value, 'Page', { min: 0 })

const roomPattern = /^[WE]\d+[NS]\d+$/i
const objectPattern = /^[a-f\d]{24}$/i

export function roomName(value) {
  if (!roomPattern.test(value || '')) throw new Error(`Invalid room name "${value}".`)
  return value.toUpperCase()
}

export function roomPosition(value) {
  const match = /^(\d+),(\d+)$/.exec(value || '')
  if (!match) throw new Error('Position must look like 24,18.')
  return { x: coordinate(match[1]), y: coordinate(match[2]) }
}

export function playerName(value) {
  if (!value?.startsWith('@') || value.length < 2) throw new Error('Player names must start with @.')
  return value.slice(1)
}

export function parseTarget(target, position) {
  if (!target) {
    if (position) throw new Error('A position needs a room name.')
    return { kind: 'empire' }
  }
  if (roomPattern.test(target)) {
    return position
      ? { kind: 'tile', room: roomName(target), ...roomPosition(position) }
      : { kind: 'room', room: roomName(target) }
  }
  if (position) throw new Error('Only a room can be followed by a position.')
  if (target.startsWith('@')) return { kind: 'player', player: playerName(target) }
  if (objectPattern.test(target)) return { kind: 'object', id: target.toLowerCase() }
  throw new Error(`Unknown target "${target}". Use a room, object ID, or @player.`)
}

export function positiveNumber(value, label) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be a positive number.`)
  return parsed
}
