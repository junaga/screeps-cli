import assert from 'node:assert/strict'
import test from 'node:test'
import { coordinatesToRoomName, decodeTerrain, mergeRoomObjects, renderRoom, roomNameToCoordinates, roomsAround } from '../src/room.js'

test('decodes the compact 2500-character terrain format', () => {
  const encoded = `${'0'.repeat(51)}1${'0'.repeat(2448)}`
  const terrain = decodeTerrain({ terrain: [{ terrain: encoded }] })
  assert.equal(terrain[1][1], 1)
  assert.equal(terrain[0][0], 0)
})

test('converts room names across world axes', () => {
  for (const name of ['W0N0', 'E0S0', 'W12S4', 'E9N20']) {
    const { x, y } = roomNameToCoordinates(name)
    assert.equal(coordinatesToRoomName(x, y), name)
  }
  assert.deepEqual(roomsAround('E0S0', 1), [
    'W0N0', 'E0N0', 'E1N0',
    'W0S0', 'E0S0', 'E1S0',
    'W0S1', 'E0S1', 'E1S1'
  ])
})

test('merges partial socket updates and removes vanished objects', () => {
  const state = new Map([['a', { _id: 'a', type: 'creep', x: 1, y: 1, hits: 100 }]])
  mergeRoomObjects(state, { a: { x: 2, hits: 90 }, b: { _id: 'b', type: 'source', x: 3, y: 4 } })
  assert.deepEqual(state.get('a'), { _id: 'a', type: 'creep', x: 2, y: 1, hits: 90 })
  mergeRoomObjects(state, { a: null })
  assert.equal(state.has('a'), false)
})

test('renders terrain and objects at their coordinates', () => {
  const terrain = Array.from({ length: 50 }, () => Array(50).fill(0))
  terrain[0][0] = 1
  const rendered = renderRoom({ name: 'W0N0', terrain, objects: [{ _id: 's', type: 'source', x: 1, y: 0 }], color: false })
  const mapRow = rendered.split('\n')[3]
  assert.equal(mapRow.slice(3, 5), '#S')
})
