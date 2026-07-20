import assert from 'node:assert/strict'
import test from 'node:test'
import { coordinate, flagColor, pageNumber, parseTarget, playerName, positiveNumber, roomName, roomPosition } from '../src/validation.js'

test('validates game coordinates, colors, and pages', () => {
  assert.equal(coordinate('49'), 49)
  assert.equal(flagColor('10'), 10)
  assert.equal(pageNumber('0'), 0)
  assert.equal(positiveNumber('0.25', 'Price'), 0.25)
  assert.throws(() => coordinate('50'), /0 to 49/)
  assert.throws(() => coordinate('north'), /integer/)
  assert.throws(() => flagColor('0'), /1 to 10/)
  assert.throws(() => pageNumber('-1'), /at least 0/)
  assert.throws(() => positiveNumber('0', 'Price'), /positive number/)
  assert.throws(() => positiveNumber('many', 'Price'), /positive number/)
})

test('parses rooms, positions, players, objects, and the empire target distinctly', () => {
  assert.equal(roomName('w8n3'), 'W8N3')
  assert.deepEqual(roomPosition('24,18'), { x: 24, y: 18 })
  assert.equal(playerName('@Ada'), 'Ada')
  assert.deepEqual(parseTarget(), { kind: 'empire' })
  assert.deepEqual(parseTarget('W8N3'), { kind: 'room', room: 'W8N3' })
  assert.deepEqual(parseTarget('W8N3', '24,18'), { kind: 'tile', room: 'W8N3', x: 24, y: 18 })
  assert.deepEqual(parseTarget('@Ada'), { kind: 'player', player: 'Ada' })
  assert.deepEqual(parseTarget('5bbcac2d9099fc012e635db5'), { kind: 'object', id: '5bbcac2d9099fc012e635db5' })
  assert.throws(() => parseTarget('market'), /Unknown target/)
  assert.throws(() => roomPosition('50,0'), /0 to 49/)
})
