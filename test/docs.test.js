import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import packageInfo from '../package.json' with { type: 'json' }
import { readDocsManifest, readDocsPage } from '../src/docs.js'
import { CLI_VERSION, DOCS_REVISION, GAME_PROTOCOL } from '../src/version.js'

test('pins distinct CLI, game protocol, and official docs versions', async () => {
  const manifest = await readDocsManifest()
  assert.equal(CLI_VERSION, packageInfo.version)
  assert.equal(GAME_PROTOCOL, 14)
  assert.equal(manifest.gameProtocol, GAME_PROTOCOL)
  assert.equal(manifest.revision, DOCS_REVISION)
  for (const range of Object.values(packageInfo.dependencies)) assert.match(range, /^\^/)
})

test('bundles clean authored guide pages without the generated API reference', async () => {
  const manifest = await readDocsManifest()
  assert.ok(manifest.pages.length > 25)
  assert.ok(manifest.pages.some(page => page.command === 'cpu-limit'))
  assert.ok(!manifest.pages.some(page => page.command === 'api'))
  for (const page of manifest.pages) {
    const markdown = await readDocsPage(page.file)
    assert.ok(markdown.startsWith(`# ${page.title}\n\n`), page.command)
    assert.doesNotMatch(markdown, /\{%|^title:/m, page.command)
  }
})

test('docs command prints its bundled Markdown page exactly', async () => {
  const expected = await readFile(new URL('../docs/pages/cpu-limit.md', import.meta.url), 'utf8')
  const result = spawnSync(process.execPath, ['bin/screeps.js', 'docs', 'cpu-limit'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, expected)
})
