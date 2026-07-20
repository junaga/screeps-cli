import assert from 'node:assert/strict'
import test from 'node:test'
import { formatBody, formatMarketOrders, formatMessages, formatMyOrders, formatStatus } from '../src/format.js'

test('formats status as a short player summary', () => {
  const text = formatStatus({
    server: 'http://example.test:21025',
    shard: 'shard0',
    tick: 1234,
    player: { username: 'Ada', cpu: 100, gclProgress: 2, powerProcessed: 3, credits: 42 },
    worldStatus: 'normal',
    rooms: ['E1S1'],
    attention: ['1 unread message.']
  })
  assert.equal(text, 'Ada at example.test:21025 · shard0 · tick 1,234\nRoom: E1S1\nCPU 100 · GCL progress 2 · Power 3 · 42 credits\nNeeds attention: 1 unread message.')
})

test('formats market empty states plainly', () => {
  assert.equal(formatMarketOrders({ list: [] }, 'energy'), 'No energy orders.')
  assert.equal(formatMyOrders([]), 'No active orders.')
})

test('includes actionable IDs in market order listings', () => {
  assert.equal(
    formatMarketOrders({ list: [{ _id: 'order-1', type: 'sell', remainingAmount: 50, price: 2, roomName: 'E4S1' }] }, 'energy'),
    'order-1  sell 50 energy at 2 in E4S1'
  )
  assert.equal(
    formatMyOrders([{ _id: 'order-2', type: 'buy', remainingAmount: 10, resourceType: 'power', price: 3 }]),
    'order-2  buy 10 power at 3'
  )
})

test('formats messages without exposing server records', () => {
  assert.equal(
    formatMessages({
      messages: [{ message: { user: 'me', respondent: '42', type: 'in', text: 'hello' } }],
      users: { 42: { username: 'Ada' } }
    }),
    'Ada: hello'
  )
  assert.equal(
    formatMessages({ messages: [{ message: { respondent: '42', type: 'out', text: 'hi' } }], users: { 42: { username: 'Ada' } } }),
    'you: hi'
  )
})

test('compresses consecutive body parts without losing their order', () => {
  const body = ['tough', 'tough', 'move', 'move', 'tough'].map(type => ({ type }))
  assert.equal(formatBody(body), '2 TOUGH · 2 MOVE · TOUGH')
})
