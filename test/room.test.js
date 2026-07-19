import assert from 'node:assert/strict'
import test from 'node:test'
import { coordinatesToRoomName, decodeTerrain, describeRoomChanges, mergeRoomObjects, renderLiveRoomFrame, renderRoom, renderTile, roomNameToCoordinates, roomsAround } from '../src/room.js'

test('decodes the compact 2500-character terrain format', () => {
  const encoded = `${'0'.repeat(51)}1${'0'.repeat(2448)}`
  const terrain = decodeTerrain({ terrain: { 0: { terrain: encoded } } })
  assert.equal(terrain[1][1], 1)
  assert.equal(terrain[0][0], 0)
})

test('decodes sparse terrain safely and ignores invalid tiles', () => {
  const terrain = decodeTerrain({ terrain: [
    { x: 2, y: 3, type: 'swamp' },
    { x: 4, y: 5, type: 'wall' },
    { x: 500, y: 500, type: 'wall' }
  ] })
  assert.equal(terrain[3][2], 2)
  assert.equal(terrain[5][4], 1)
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

test('renders a fixed live frame for a human terminal', () => {
  const terrain = Array.from({ length: 50 }, () => Array(50).fill(0))
  const rendered = renderLiveRoomFrame({ name: 'W0N0', terrain, objects: [], gameTime: 42, color: false })
  assert.equal(rendered.split('\n').length, 55)
  assert.match(rendered, /^W0N0  tick 42  live · Ctrl-C to close/)
  assert.match(rendered, /@ yours  ! hostile/)
})

test('describes everything on a tile', () => {
  const terrain = Array.from({ length: 50 }, () => Array(50).fill(0))
  terrain[3][2] = 2
  const rendered = renderTile({
    name: 'W0N0', x: 2, y: 3, terrain, ownUserId: 'me',
    objects: [
      { type: 'road', x: 2, y: 3, hits: 100, hitsMax: 500 },
      { type: 'creep', name: 'Worker1', user: 'me', x: 2, y: 3, hits: 300, hitsMax: 300, store: { energy: 12 }, storeCapacity: 50 }
    ]
  })
  assert.match(rendered, /Terrain: swamp/)
  assert.match(rendered, /road · 100\/500 hits/)
  assert.match(rendered, /creep Worker1 · yours · 12\/50 energy · 300\/300 hits/)
})

test('reports room state changes without narrating redundant action logs', () => {
  const state = new Map([['worker', {
    _id: 'worker', type: 'creep', name: 'Worker1', x: 1, y: 2,
    hits: 300, hitsMax: 300, store: { energy: 10 }
  }], ['source', {
    _id: 'source', type: 'source', x: 3, y: 4, energy: 3000
  }]])
  const lines = describeRoomChanges(state, {
    worker: {
      x: 2,
      store: { energy: 12 },
      actionLog: { harvest: { x: 3, y: 4 }, say: { message: 'work' } }
    },
    source: { energy: 2998 },
    site: { type: 'constructionSite', x: 5, y: 6, progress: 1, progressTotal: 100 }
  })
  assert.deepEqual(lines, [
    'construction site appeared at 5,6.'
  ])
  assert.equal(state.get('worker').x, 2)
})

test('reports routine deltas only for a verbose or explicitly watched object', () => {
  const initial = () => new Map([['worker', {
    _id: 'worker', type: 'creep', name: 'Worker1', x: 1, y: 2,
    hits: 300, hitsMax: 300, store: { energy: 10 }
  }]])
  const patches = { worker: { x: 2, store: { energy: 12 }, progress: 2 } }
  assert.deepEqual(describeRoomChanges(initial(), patches, {}, { verbose: true }), [
    'creep Worker1 moved 1,2 -> 2,2.',
    'creep Worker1 energy changed 10 -> 12.'
  ])
  assert.deepEqual(describeRoomChanges(initial(), patches, {}, { targetId: 'worker' }), [
    'creep Worker1 moved 1,2 -> 2,2.',
    'creep Worker1 energy changed 10 -> 12.'
  ])
})

test('limits a tile watch to objects interacting with that position', () => {
  const state = new Map([
    ['near', { _id: 'near', type: 'creep', name: 'Near', x: 1, y: 1 }],
    ['far', { _id: 'far', type: 'creep', name: 'Far', x: 10, y: 10 }]
  ])
  assert.deepEqual(describeRoomChanges(state, {
    near: { x: 2 },
    far: { x: 11 }
  }, {}, { targetPosition: { x: 1, y: 1 } }), [
    'creep Near moved 1,1 -> 2,1.'
  ])
  assert.equal(state.get('far').x, 11)
})
