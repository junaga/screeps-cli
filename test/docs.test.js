import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import packageInfo from '../package.json' with { type: 'json' }
import { compileDocsPattern, readDocsManifest, readDocsPage, searchMarkdown } from '../src/docs.js'
import { CLI_VERSION, DOCS_BUILT_AT, DOCS_REVISION, DOCS_SITE, GAME_PROTOCOL } from '../src/version.js'

test('pins distinct CLI, game protocol, and official docs versions', async () => {
  const manifest = await readDocsManifest()
  assert.equal(CLI_VERSION, packageInfo.version)
  assert.equal(GAME_PROTOCOL, 14)
  assert.equal(manifest.gameProtocol, GAME_PROTOCOL)
  assert.equal(manifest.site, DOCS_SITE)
  assert.equal(manifest.revision, DOCS_REVISION)
  assert.equal(manifest.builtAt, DOCS_BUILT_AT)
  assert.match(manifest.builtAt, /^\d{4}-\d{2}-\d{2}$/)
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
    assert.doesNotMatch(markdown, /<\/?(?:table|thead|tbody|tfoot|tr|th|td)\b/i, page.command)
  }
})

test('docs command prints its bundled Markdown page exactly', async () => {
  const expected = await readFile(new URL('../docs/pages/cpu-limit.md', import.meta.url), 'utf8')
  const result = spawnSync(process.execPath, ['bin/screeps.js', 'docs', 'cpu-limit'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, expected)
})

test('documentation search keeps heading context and only matching paragraphs', () => {
  const markdown = [
    '# Guide',
    '',
    'Unrelated introduction.',
    '',
    '## Alpha',
    '',
    'A matching needle.',
    '',
    'An unrelated paragraph.',
    '',
    '## Beta',
    '',
    'Another needle.'
  ].join('\n')
  assert.equal(searchMarkdown(markdown, compileDocsPattern('needle')), [
    '# Guide',
    '',
    '## Alpha',
    '',
    'A matching needle.',
    '',
    '## Beta',
    '',
    'Another needle.',
    ''
  ].join('\n'))
  assert.equal(searchMarkdown(markdown, compileDocsPattern('^## alpha$')), [
    '# Guide',
    '',
    '## Alpha',
    '',
    'A matching needle.',
    '',
    'An unrelated paragraph.',
    ''
  ].join('\n'))
})

test('version reports CLI, game protocol, and dated docs revision', () => {
  const result = spawnSync(process.execPath, ['bin/screeps.js', '--version'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, [
    `CLI:      screeps ${packageInfo.version}`,
    `Game:     Screeps protocol ${GAME_PROTOCOL}`,
    `Docs:     screeps/docs ${DOCS_REVISION.slice(0, 7)} (built ${DOCS_BUILT_AT})`,
    ''
  ].join('\n'))
})
