import assert from 'node:assert/strict'
import test from 'node:test'
import { coordinate, flagColor, pageNumber, positiveNumber, selectedRoom } from '../src/validation.js'

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

test('selects an explicit room before SCREEPS_ROOM', () => {
  assert.equal(selectedRoom('E4S1', { SCREEPS_ROOM: 'W1N1' }), 'E4S1')
  assert.equal(selectedRoom(undefined, { SCREEPS_ROOM: 'W1N1' }), 'W1N1')
  assert.throws(() => selectedRoom(undefined, {}), /--room <name> or SCREEPS_ROOM/)
})
