function number(value, fallback = '—') {
  return Number.isFinite(value) ? new Intl.NumberFormat('en').format(value) : fallback
}

export function formatStatus({ server, shard, tick, player, rooms, attention = [] }) {
  const host = (() => {
    try { return new URL(server).host } catch { return server }
  })()
  const economy = [`CPU ${number(player.cpu)}`, `GCL progress ${number(player.gclProgress)}`]
  if (player.powerProcessed) economy.push(`Power ${number(player.powerProcessed)}`)
  economy.push(`${number(player.credits, '0')} credits`)
  return [
    `${player.username} at ${host}${shard ? ` · ${shard}` : ''} · tick ${number(tick)}`,
    `${rooms.length === 1 ? 'Room' : 'Rooms'}: ${rooms.length ? rooms.join(', ') : 'none'}`,
    economy.join(' · '),
    attention.length ? `Needs attention: ${attention.join(' ')}` : 'All quiet.'
  ].join('\n')
}

export function formatMessages(response, player) {
  const messages = response?.messages || []
  if (!messages.length) return 'No messages.'
  return messages.map(entry => {
    const message = entry.message || entry
    const userId = message.user || message.respondent
    const user = message.type === 'out' ? 'you' : player || message.username || response.users?.[userId]?.username || userId || 'unknown'
    const text = message.text || message.message || ''
    return `${user}: ${text}`.trim()
  }).join('\n')
}

export function formatBody(body = []) {
  const runs = []
  for (const part of body) {
    if (!part?.type) continue
    const type = String(part.type).toUpperCase()
    const previous = runs.at(-1)
    if (previous?.type === type) previous.count++
    else runs.push({ type, count: 1 })
  }
  return runs.map(run => `${run.count > 1 ? `${run.count} ` : ''}${run.type}`).join(' · ')
}

function formatOrders(response, resource, empty) {
  const orders = response?.list || []
  if (!orders.length) return empty
  return orders.map(order => {
    const amount = order.remainingAmount ?? order.amount
    const room = order.roomName ? ` in ${order.roomName}` : ''
    const id = order._id || order.id
    return `${id ? `${id}  ` : ''}${order.type} ${number(amount)} ${resource || order.resourceType} at ${order.price}${room}`
  }).join('\n')
}

export const formatMarketOrders = (response, resource) => formatOrders(response, resource, `No ${resource} orders.`)
export const formatMyOrders = response => formatOrders(response, undefined, 'No active orders.')

export function formatMarketHistory(response) {
  const entries = response?.list || []
  if (!entries.length) return 'No transactions.'
  return entries.map(entry => {
    const change = entry.change == null ? '' : `${entry.change > 0 ? '+' : ''}${entry.change}`
    const description = entry.market?.resourceType || entry.description || entry.type || 'transaction'
    return `${change} ${description}`.trim()
  }).join('\n')
}
