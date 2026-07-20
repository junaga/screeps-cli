import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { compareModules, readModules, writeModules } from '../src/io.js'

test('round-trips nested JavaScript and WASM modules', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'screeps-modules-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const modules = {
    main: 'module.exports.loop = () => {}',
    '.hidden': 'module.exports = true',
    'roles/worker': 'module.exports = {}',
    '.roles/scout': 'module.exports = {}',
    engine: { binary: Buffer.from('wasm').toString('base64') }
  }

  await writeModules(directory, modules)
  assert.deepEqual(await readModules(directory), modules)
})

test('refuses module names that escape the destination', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'screeps-modules-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await assert.rejects(() => writeModules(directory, { '../outside': 'nope' }), /Invalid module name/)
  await assert.rejects(() => writeModules(directory, { 'nested/../outside': 'nope' }), /Invalid module name/)
  await assert.rejects(() => readFile(join(directory, '..', 'outside.js')), /ENOENT/)
})

test('compares local modules to deployed modules', () => {
  assert.deepEqual(compareModules(
    { main: 'new', added: 'yes', wasm: { binary: 'same' } },
    { main: 'old', removed: 'yes', wasm: { binary: 'same' } }
  ), {
    added: ['added'],
    changed: ['main'],
    removed: ['removed'],
    unchanged: ['wasm']
  })
})
