import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import packageInfo from '../package.json' with { type: 'json' }
import docsManifest from '../docs/manifest.json' with { type: 'json' }
import { assertServerCompatibility, CLI_VERSION, DOCS_BUILT_AT, DOCS_REVISION, DOCS_SITE, GAME_PROTOCOL } from '../src/version.js'

const readDocsPage = file => readFile(new URL(`../docs/${file}`, import.meta.url), 'utf8')

function proseOnly(markdown) {
  const lines = markdown.split('\n')
  let fence
  return lines.map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (!fence && marker) {
      fence = marker[0]
      return ''
    }
    if (fence) {
      if (new RegExp(`^ {0,3}${fence}{3,}`).test(line)) fence = undefined
      return ''
    }
    return line.replace(/(`+)[^`]*\1/g, '')
  }).join('\n')
}

test('pins distinct CLI, game protocol, and official docs versions', async () => {
  assert.equal(CLI_VERSION, packageInfo.version)
  assert.equal(GAME_PROTOCOL, 14)
  assert.equal(docsManifest.gameProtocol, GAME_PROTOCOL)
  assert.equal(docsManifest.site, DOCS_SITE)
  assert.equal(docsManifest.revision, DOCS_REVISION)
  assert.equal(docsManifest.builtAt, DOCS_BUILT_AT)
  assert.match(docsManifest.builtAt, /^\d{4}-\d{2}-\d{2}$/)
  for (const range of Object.values(packageInfo.dependencies)) assert.match(range, /^\^/)
})

test('accepts only the supported Screeps protocol', () => {
  assert.equal(assertServerCompatibility({ protocol: 14 }).protocol, 14)
  assert.throws(() => assertServerCompatibility({ protocol: 15 }), /Unsupported Screeps protocol 15/)
  assert.throws(() => assertServerCompatibility({}), /did not report/)
})

test('bundles clean authored guide pages without the generated API reference', async () => {
  assert.ok(docsManifest.pages.length > 25)
  assert.ok(docsManifest.pages.some(page => page.command === 'cpu-limit'))
  assert.ok(!docsManifest.pages.some(page => page.command === 'api'))
  for (const page of docsManifest.pages) {
    const markdown = await readDocsPage(page.file)
    assert.ok(markdown.startsWith(`# ${page.title}\n\n`), page.command)
    assert.doesNotMatch(markdown, /\{%|^title:/m, page.command)
    assert.doesNotMatch(markdown, /<\/?(?:table|thead|tbody|tfoot|tr|th|td)\b/i, page.command)
    assert.doesNotMatch(proseOnly(markdown), /<\/?(?:video|source|img|div|p|code|strong|nobr|br|style)\b/i, page.command)
    for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      assert.match(match[1], /^[a-z][a-z\d+.-]*:/i, `${page.command}: ${match[1]}`)
    }
    for (const match of markdown.matchAll(/<(?:a|img|source)\b[^>]*\b(?:href|src)=["']([^"']+)/gi)) {
      assert.match(match[1], /^[a-z][a-z\d+.-]*:/i, `${page.command}: ${match[1]}`)
    }
  }
})

test('docs command prints its bundled Markdown page exactly', async () => {
  const expected = await readFile(new URL('../docs/pages/cpu-limit.md', import.meta.url), 'utf8')
  const result = spawnSync(process.execPath, ['bin.js', 'docs', 'cpu-limit'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, expected)
})

test('version reports CLI, game protocol, and dated docs revision', () => {
  const result = spawnSync(process.execPath, ['bin.js', '--version'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, [
    `CLI:      screeps ${packageInfo.version}`,
    `Game:     Screeps protocol ${GAME_PROTOCOL}`,
    `Docs:     screeps/docs ${DOCS_REVISION.slice(0, 7)} (built ${DOCS_BUILT_AT})`,
    ''
  ].join('\n'))
})
