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
