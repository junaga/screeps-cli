import assert from 'node:assert/strict'
import test from 'node:test'
import { formatMarketOrders, formatMessages, formatObjects, formatRooms, formatStatus } from '../src/format.js'

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

test('formats objects and messages without exposing server records', () => {
  assert.equal(
    formatObjects([{ type: 'spawn', name: 'Home', x: 10, y: 20, store: { energy: 300 }, hits: 5000, hitsMax: 5000 }]),
    'spawn Home at 10,20 · 300 energy · 5,000/5,000 hits'
  )
  assert.equal(
    formatMessages({ messages: [{ user: '42', text: 'hello' }], users: { 42: { username: 'Ada' } } }),
    'Ada: hello'
  )
})
