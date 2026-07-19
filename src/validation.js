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

export function selectedRoom(option, environment = process.env) {
  const room = option || environment.SCREEPS_ROOM
  if (!room) throw new Error('Choose a room with --room <name> or SCREEPS_ROOM.')
  return room
}

export function positiveNumber(value, label) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be a positive number.`)
  return parsed
}
