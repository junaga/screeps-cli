import assert from 'node:assert/strict'
import test from 'node:test'
import { formatMarketOrders, formatMessages, formatMyOrders, formatRooms, formatStatus } from '../src/format.js'

test('formats status as a short player summary', () => {
  const text = formatStatus({
    url: 'http://example.test:21025',
    tick: 1234,
    user: { username: 'Ada', cpu: 100, gcl: 2, money: 42 },
    world: { status: 'normal' },
    rooms: { rooms: ['E1S1'] }
  })
  assert.equal(text, 'Ada on http://example.test:21025\nTick 1,234 · normal\nRooms: E1S1\nCPU 100 · GCL progress 2 · Credits 42')
})

test('formats room and market empty states plainly', () => {
  assert.equal(formatRooms({ rooms: [] }), 'You have no rooms.')
  assert.equal(formatMarketOrders({ list: [] }, 'energy'), 'No energy orders.')
})

test('includes actionable IDs in market order listings', () => {
  assert.equal(
    formatMarketOrders({ list: [{ _id: 'order-1', type: 'sell', remainingAmount: 50, price: 2, roomName: 'E4S1' }] }, 'energy'),
    'order-1  sell 50 energy at 2 in E4S1'
  )
  assert.equal(
    formatMyOrders({ list: [{ _id: 'order-2', type: 'buy', remainingAmount: 10, resourceType: 'power', price: 3 }] }),
    'order-2  buy 10 power at 3'
  )
})

test('formats messages without exposing server records', () => {
  assert.equal(
    formatMessages({ messages: [{ user: '42', text: 'hello' }], users: { 42: { username: 'Ada' } } }),
    'Ada: hello'
  )
})
