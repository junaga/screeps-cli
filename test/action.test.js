import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { assertGameAction, powerCreepAction, runGameExpression, wrapGameExpression } from '../src/action.js'
import { objectExpression } from '../src/cli.js'

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
  assert.match(expression, /Game\.market\.cancelOrder/)
})

test('evaluates console statements and safely serializes unusual values', async () => {
  let receive
  const api = {
    socket: {
      async subscribeUserConsole(callback) { receive = callback },
      async connect() {},
      async unsubscribeUserConsole() {},
      disconnect() {}
    },
    async userConsole(expression) {
      runInNewContext(expression, { console: { log(line) {
        receive({ data: { messages: { log: [line] } } })
      } } })
    }
  }
  assert.equal(await runGameExpression(api, 'const value = 3; value * 2'), 6)
  assert.deepEqual(
    await runGameExpression(api, 'const value={missing:undefined,nan:NaN,big:2n};value.self=value;value'),
    { missing: 'undefined', nan: 'NaN', big: '2n', self: '[Circular]' }
  )
})

test('fails immediately when the game console reports an error', async () => {
  let receive
  const api = {
    socket: {
      async subscribeUserConsole(callback) { receive = callback },
      async connect() {},
      disconnect() {}
    },
    async userConsole() { receive({ data: { error: 'CPU bucket exhausted' } }) }
  }
  await assert.rejects(runGameExpression(api, 'Game.time'), /CPU bucket exhausted/)
})

test('keeps object inspection within the private-server console limit', () => {
  const wrapped = wrapGameExpression(objectExpression('a'.repeat(24)), 'screeps-cli:00000000-0000-0000-0000-000000000000:')
  assert.ok(Buffer.byteLength(wrapped) <= 1024, `${Buffer.byteLength(wrapped)} bytes`)
})

test('classifies game objects by their runtime class and preserves mechanic fields', () => {
  const classes = {
    ConstructionSite: class ConstructionSite {},
    Ruin: class Ruin {},
    Tombstone: class Tombstone {},
    Nuke: class Nuke {},
    Source: class Source {},
    Mineral: class Mineral {},
    Deposit: class Deposit {},
    Resource: class Resource {},
    PowerCreep: class PowerCreep {},
    Creep: class Creep {}
  }
  const labels = {
    ConstructionSite: 'construction site', Ruin: 'ruin', Tombstone: 'tombstone',
    Nuke: 'nuke', Source: 'source', Mineral: 'mineral', Deposit: 'deposit',
    Resource: 'resource', PowerCreep: 'power creep', Creep: 'creep'
  }
  for (const [name, Type] of Object.entries(classes)) {
    const object = new Type()
    object.pos = { roomName: 'W1N1', x: 4, y: 5 }
    object.toJSON = () => ({ id: 'id', room: 'large room object', mechanic: name })
    const result = runInNewContext(objectExpression('id'), {
      ...classes,
      Game: { getObjectById() { return object } }
    })
    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      id: 'id', mechanic: name, type: labels[name], pos: { room: 'W1N1', x: 4, y: 5 }
    })
  }
})

test('translates common game return codes', () => {
  assert.doesNotThrow(() => assertGameAction(0))
  assert.throws(() => assertGameAction(-3), /name is already in use/)
  assert.throws(() => assertGameAction(-5), /target was not found/)
  assert.throws(() => assertGameAction(-6), /enough credits or resources/)
})

test('uses instance methods for power creep actions', () => {
  assert.equal(powerCreepAction('Operator One', 'upgrade', 'PWR_GENERATE_OPS'),
    'Game.powerCreeps["Operator One"].upgrade(PWR_GENERATE_OPS)')
  assert.equal(powerCreepAction('Operator One', 'delete'), 'Game.powerCreeps["Operator One"].delete()')
  assert.equal(powerCreepAction('Operator One', 'delete', 'true'), 'Game.powerCreeps["Operator One"].delete(true)')
})
