function number(value, fallback = '—') {
  return Number.isFinite(value) ? new Intl.NumberFormat('en').format(value) : fallback
}

export function formatStatus({ server, shard, tick, player, worldStatus, rooms, attention = [] }) {
  return [
    `${player.username} · ${worldStatus || 'unknown'}`,
    `${server}${shard ? ` · ${shard}` : ''} · tick ${number(tick)}`,
    `Rooms: ${rooms.length ? rooms.join(', ') : 'none'}`,
    `CPU ${number(player.cpu)} · GCL progress ${number(player.gclProgress)} · Power ${number(player.powerProcessed, '0')} · Credits ${number(player.credits, '0')}`,
    `Attention: ${attention.length ? attention.join(' ') : 'nothing right now'}`
  ].join('\n')
}

export function formatRooms(response) {
  const rooms = response?.rooms || []
  if (!rooms.length) return 'You have no rooms.'
  return rooms.join('\n')
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

export function formatMarketOrders(response, resource) {
  const orders = response?.list || []
  if (!orders.length) return `No ${resource} orders.`
  return orders.map(order => {
    const amount = order.remainingAmount ?? order.amount
    const room = order.roomName ? ` in ${order.roomName}` : ''
    const id = order._id || order.id
    return `${id ? `${id}  ` : ''}${order.type} ${number(amount)} ${resource} at ${order.price}${room}`
  }).join('\n')
}

export function formatMyOrders(response) {
  const orders = response?.list || []
  if (!orders.length) return 'You have no market orders.'
  return orders.map(order => {
    const amount = order.remainingAmount ?? order.amount
    const room = order.roomName ? ` in ${order.roomName}` : ''
    const id = order._id || order.id
    return `${id ? `${id}  ` : ''}${order.type} ${number(amount)} ${order.resourceType} at ${order.price}${room}`
  }).join('\n')
}

export function formatMarketHistory(response) {
  const entries = response?.list || []
  if (!entries.length) return 'No transactions.'
  return entries.map(entry => {
    const change = entry.change == null ? '' : `${entry.change > 0 ? '+' : ''}${entry.change}`
    const description = entry.market?.resourceType || entry.description || entry.type || 'transaction'
    return `${change} ${description}`.trim()
  }).join('\n')
}
