import assert from 'node:assert/strict'
import test from 'node:test'
import { assertGameAction, runGameExpression } from '../src/action.js'

test('captures the result of a tick-based game action', async () => {
  let receive
  let expression
  const api = {
    socket: {
      async subscribeUserConsole(callback) { receive = callback },
      async connect() {},
      disconnect() {}
    },
    async userConsole(value) {
      expression = value
      const marker = value.match(/screeps-cli:[0-9a-f-]+:/)[0]
      receive({ data: { messages: { log: [`${marker}{&#x22;value&#x22;:0}`] } } })
    }
  }
  assert.equal(await runGameExpression(api, 'Game.market.cancelOrder("order")'), 0)
  assert.match(expression, /Game\.market\.cancelOrder\("order"\)/)
})

test('translates common game return codes', () => {
  assert.doesNotThrow(() => assertGameAction(0))
  assert.throws(() => assertGameAction(-5), /order was not found/)
  assert.throws(() => assertGameAction(-6), /enough credits or resources/)
})
