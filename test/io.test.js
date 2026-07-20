import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { compareModules, readModules, writeModules } from '../src/io.js'

test('round-trips nested JavaScript and WASM modules', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'screeps-modules-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const modules = {
    main: 'module.exports.loop = () => {}',
    'roles/worker': 'module.exports = {}',
    engine: { binary: Buffer.from('wasm').toString('base64') }
  }

  await writeModules(directory, modules)
  assert.deepEqual(await readModules(directory), modules)
})

test('rejects module names that stock servers silently discard', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'screeps-modules-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await writeModules(directory, { main: 'safe' })
  await assert.rejects(() => writeModules(directory, { '.hidden': 'nope' }), /cannot begin with \./)
  await assert.rejects(() => writeModules(directory, { '$hidden': 'nope' }), /cannot begin with \./)
  assert.equal(await readFile(join(directory, 'main.js'), 'utf8'), 'safe')

  await writeFile(join(directory, '.hidden.js'), 'nope')
  await assert.rejects(() => readModules(directory), /cannot begin with \./)
})

test('rejects JavaScript and WASM files with the same module name', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'screeps-modules-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(join(directory, 'engine.js'), 'module.exports = {}')
  await writeFile(join(directory, 'engine.wasm'), Buffer.from('wasm'))
  await assert.rejects(() => readModules(directory), /exists in both .*engine\.js and .*engine\.wasm/)
})

test('pull synchronization removes stale and opposite-format modules', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'screeps-modules-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await writeModules(directory, { main: 'old', stale: 'remove me', engine: 'old js' })
  await writeFile(join(directory, 'notes.txt'), 'keep me')

  const deployed = {
    main: 'new',
    engine: { binary: Buffer.from('wasm').toString('base64') },
    'roles/worker': 'module.exports = {}'
  }
  await writeModules(directory, deployed)
  assert.deepEqual(await readModules(directory), deployed)
  await assert.rejects(readFile(join(directory, 'stale.js')), /ENOENT/)
  await assert.rejects(readFile(join(directory, 'engine.js')), /ENOENT/)
  assert.equal(await readFile(join(directory, 'notes.txt'), 'utf8'), 'keep me')
})

test('refuses module symlinks instead of reading or overwriting their targets', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'screeps-modules-test-'))
  const outside = `${directory}-outside.js`
  t.after(async () => {
    await rm(directory, { recursive: true, force: true })
    await rm(outside, { force: true })
  })
  await writeFile(outside, 'outside')
  try {
    await symlink(outside, join(directory, 'main.js'))
  } catch (error) {
    if (error.code === 'EPERM') return t.skip('symbolic links are unavailable')
    throw error
  }

  await assert.rejects(() => readModules(directory), /symbolic link/)
  await assert.rejects(() => writeModules(directory, { main: 'changed' }), /symbolic link/)
  assert.equal(await readFile(outside, 'utf8'), 'outside')
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
