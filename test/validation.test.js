import assert from 'node:assert/strict'
import test from 'node:test'
import { coordinate, flagColor, pageNumber } from '../src/validation.js'

test('validates game coordinates, colors, and pages', () => {
  assert.equal(coordinate('49'), 49)
  assert.equal(flagColor('10'), 10)
  assert.equal(pageNumber('0'), 0)
  assert.throws(() => coordinate('50'), /0 to 49/)
  assert.throws(() => coordinate('north'), /integer/)
  assert.throws(() => flagColor('0'), /1 to 10/)
  assert.throws(() => pageNumber('-1'), /at least 0/)
})
