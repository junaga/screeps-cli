import { execFile } from 'node:child_process'
import { cp, glob, mkdir, mkdtempDisposable, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join, sep } from 'node:path'
import { promisify } from 'node:util'
import { DOCS_REPOSITORY, DOCS_SITE, GAME_PROTOCOL } from '../src/version.js'
import { absolutizeDocsLinks, transcodeDocsMarkdown } from './markdown.js'

const run = promisify(execFile)
const pagesDestination = new URL('./pages/', import.meta.url)
const manifestDestination = new URL('./manifest.json', import.meta.url)

async function renderPowers(repository, temporary) {
  const packageInfo = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'))
  const commonVersion = packageInfo.dependencies?.['@screeps/common']
  if (!commonVersion) throw new Error('The docs repository does not declare @screeps/common.')
  const runtime = join(temporary, 'powers-runtime')
  await run('npm', [
    'install', '--prefix', runtime, '--ignore-scripts', '--no-package-lock', '--no-save',
    `@screeps/common@${commonVersion}`
  ])

  const constants = join(runtime, 'node_modules/@screeps/common/lib/constants')
  const officialRenderer = (await readFile(join(repository, 'scripts/tag-powers.js'), 'utf8'))
    .replace("var util = require('hexo-util');", '')
    .replace("require('@screeps/common/lib/constants')", `require(${JSON.stringify(constants)})`)
  const helper = join(temporary, 'render-powers.cjs')
  await writeFile(helper, `
let render
global.hexo = { extend: { tag: { register(_name, callback) { render = callback } } } }
${officialRenderer}
process.stdout.write(render(['operator']))
`)
  return (await run(process.execPath, [helper], { maxBuffer: 10 * 1024 * 1024 })).stdout
}

function readPage(contents, powers, source) {
  const lines = contents.replaceAll('\r\n', '\n').split('\n')
  const startsWithFence = lines[0].trim() === '---'
  const metadataStart = startsWithFence ? 1 : 0
  const metadataEnd = lines.findIndex((line, index) => index >= metadataStart && line.trim() === '---')
  if (metadataEnd < 0) throw new Error('Page has no metadata separator.')
  const metadata = lines.slice(metadataStart, metadataEnd)
  const title = metadata.find(line => line.startsWith('title:'))?.slice('title:'.length).trim()
  if (!title) throw new Error('Page has no title.')

  let body = lines.slice(metadataEnd + 1).join('\n').trim()
  body = body
    .replace(/{% resource\s+(['"])(.*?)\1\s*%}/g, '$2')
    .replace(/{% note\s+\S+(?:\s+([^%]+?))?\s*%}/g, (_tag, heading) => heading ? `**${heading.trim()}**\n\n` : '')
    .replace(/{% endnote %}/g, '')
    .replace(/{% index_block\s+(['"])(.*?)\1\s+(['"])(.*?)\3\s*%}/g, '## [$2]($4)\n')
    .replace(/{% endindex_block %}/g, '')
    .replace(/{% powers\s+operator\s*%}/g, powers)
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  body = transcodeDocsMarkdown(body)
  body = absolutizeDocsLinks(body, {
    site: DOCS_SITE,
    source
  })
  return { title, markdown: `# ${title}\n\n${body}\n` }
}

async function main() {
  await using temporaryDirectory = await mkdtempDisposable(join(tmpdir(), 'screeps-docs-'))
  const temporary = temporaryDirectory.path
  const repository = join(temporary, 'repository')
  const generated = join(temporary, 'generated')
  await run('git', ['clone', '--quiet', '--depth=1', DOCS_REPOSITORY, repository])
  const revision = (await run('git', ['-C', repository, 'rev-parse', 'HEAD'])).stdout.trim()

  const sourceDirectory = join(repository, 'source')
  const powers = await renderPowers(repository, temporary)
  const pages = []
  await mkdir(join(generated, 'pages'), { recursive: true })
  for await (const sourcePath of glob('**/*.md', { cwd: sourceDirectory })) {
    if (sourcePath.split(sep).some(part => part.startsWith('_'))) continue
    const file = join(sourceDirectory, sourcePath)
    const source = sourcePath.split(sep).join('/')
    const sourceName = basename(file, extname(file))
    const command = sourceName === 'index' ? 'overview' : sourceName.replaceAll('_', '-')
    const page = readPage(await readFile(file, 'utf8'), powers, source)
    const outputFile = `pages/${command}.md`
    await writeFile(join(generated, outputFile), page.markdown)
    pages.push({ command, file: outputFile, source, title: page.title })
    process.stdout.write(`Generated ${command}\n`)
  }
  pages.sort((left, right) => left.command.localeCompare(right.command))

  const manifest = {
    gameProtocol: GAME_PROTOCOL,
    site: DOCS_SITE,
    repository: DOCS_REPOSITORY,
    revision,
    builtAt: new Date().toISOString().slice(0, 10),
    pages
  }
  await writeFile(join(generated, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await rm(pagesDestination, { recursive: true, force: true })
  await cp(join(generated, 'pages'), pagesDestination, { recursive: true })
  await cp(join(generated, 'manifest.json'), manifestDestination)
}

await main()
