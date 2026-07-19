import { readFile } from 'node:fs/promises'

const docsDirectory = new URL('../docs/', import.meta.url)

export async function readDocsManifest() {
  return JSON.parse(await readFile(new URL('manifest.json', docsDirectory), 'utf8'))
}

export async function readDocsPage(file) {
  return readFile(new URL(file, docsDirectory), 'utf8')
}

export function compileDocsPattern(pattern) {
  try {
    return new RegExp(pattern, 'i')
  } catch (error) {
    throw new Error(`Invalid documentation search pattern ${JSON.stringify(pattern)}: ${error.message}`)
  }
}

function markdownBlocks(markdown) {
  const blocks = []
  let lines = []
  let fence
  const push = () => {
    if (!lines.length) return
    blocks.push({ text: lines.join('\n') })
    lines = []
  }

  for (const line of markdown.replaceAll('\r\n', '\n').split('\n')) {
    if (fence) {
      lines.push(line)
      const closing = line.trim()
      if (closing.length >= fence.length && [...closing].every(character => character === fence[0])) {
        fence = undefined
        push()
      }
      continue
    }

    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fenceMatch) {
      push()
      fence = fenceMatch[1]
      lines.push(line)
      continue
    }

    const heading = /^(#{1,6})\s+/.exec(line)
    if (heading) {
      push()
      blocks.push({ text: line, headingLevel: heading[1].length })
      continue
    }

    if (!line.trim()) push()
    else lines.push(line)
  }
  push()
  return blocks
}

function matches(pattern, text) {
  pattern.lastIndex = 0
  return pattern.test(text)
}

export function searchMarkdown(markdown, pattern) {
  const blocks = markdownBlocks(markdown)
  const selected = new Set()
  const headings = []

  for (const [index, block] of blocks.entries()) {
    if (block.headingLevel) {
      while (headings.at(-1)?.level >= block.headingLevel) headings.pop()
      headings.push({ index, level: block.headingLevel })
    }
    if (!matches(pattern, block.text)) continue

    for (const heading of headings) selected.add(heading.index)
    selected.add(index)
    if (!block.headingLevel) continue

    for (let next = index + 1; next < blocks.length; next++) {
      if (blocks[next].headingLevel && blocks[next].headingLevel <= block.headingLevel) break
      selected.add(next)
    }
  }

  if (!selected.size) return ''
  return blocks.filter((_block, index) => selected.has(index)).map(block => block.text).join('\n\n') + '\n'
}
