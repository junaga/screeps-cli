import { parseFragment } from 'parse5'

function inlineNode(node) {
  if (node.nodeName === '#text') return node.value
  if (!node.tagName) return ''
  const content = (node.childNodes || []).map(inlineNode).join('')
  const attribute = name => node.attrs.find(item => item.name === name)?.value
  if (node.tagName === 'br') return '; '
  if (node.tagName === 'img') {
    const source = attribute('src')
    return source ? `![${attribute('alt') || ''}](${source})` : ''
  }
  if (node.tagName === 'a') return attribute('href') ? `[${content}](${attribute('href')})` : content
  if (node.tagName === 'strong' || node.tagName === 'b') return `**${content}**`
  if (node.tagName === 'em') return `*${content}*`
  if (node.tagName === 'code') {
    const fence = content.includes('`') ? '``' : '`'
    return `${fence}${content}${fence}`
  }
  return content
}

function inlineNodes(nodes) {
  const value = nodes.map(inlineNode).join('')
    .replace(/(!\[[^\]]*\]\([^)]+\))(?=\S)/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim()
  return value.replaceAll('|', '\\|')
}

const inlineMarkdown = html => inlineNodes(parseFragment(html).childNodes)

function descendants(node, tagName) {
  return (node.childNodes || []).flatMap(child => [
    ...(child.tagName === tagName ? [child] : []),
    ...descendants(child, tagName)
  ])
}

function parseTable(html) {
  const closedRows = html.replace(/(<tr\b[^>]*>)([^]*?)(?=<tr\b|<\/table>)/gi,
    (_row, opening, content) => `${opening}${content}${/<\/tr>\s*$/i.test(content) ? '' : '</tr>'}`)
  return descendants(parseFragment(closedRows), 'tr').map(row => row.childNodes
    .filter(cell => cell.tagName === 'th' || cell.tagName === 'td')
    .map(cell => ({
      value: inlineNodes(cell.childNodes),
      header: cell.tagName === 'th',
      colspan: Math.max(1, Number.parseInt(cell.attrs.find(item => item.name === 'colspan')?.value || '1', 10))
    })))
}

function expandRows(rows) {
  return rows.map(row => row.flatMap(cell => [cell, ...Array.from({ length: cell.colspan - 1 }, () => ({ value: '', header: cell.header }))]))
}

function imageOnly(value) {
  return /^!\[[^\]]*\]\([^)]+\)$/.test(value)
}

function tableMarkdown(html) {
  let rows = expandRows(parseTable(html))
  if (!rows.length) return ''
  const width = Math.max(...rows.map(row => row.length))
  rows = rows.map(row => [...row, ...Array.from({ length: width - row.length }, () => ({ value: '', header: false }))])

  const columns = Array.from({ length: width }, (_value, index) => index)
    .filter(index => !rows.every(row => !row[index].value || imageOnly(row[index].value)))
  rows = rows.map(row => columns.map(index => row[index]))
  if (!columns.length) return ''

  const first = rows[0]
  const firstIsHeader = first.every(cell => cell.header) || (!first[0].value && first.slice(1).some(cell => cell.value))
  const header = firstIsHeader ? first : first.map(() => ({ value: '', header: true }))
  const body = firstIsHeader ? rows.slice(1) : rows
  const render = (row, headerRow = false) => `| ${row.map(cell => {
    if (!headerRow && cell.header && cell.value) return `**${cell.value}**`
    return cell.value
  }).join(' | ')} |`
  return [render(header, true), render(header.map(() => ({ value: '---' })), true), ...body.map(row => render(row))].join('\n')
}

function transcodeCollapsibleTables(markdown) {
  const wrapper = /^[ \t]*<div\s+class=["']collapsible-table["']\s*>\s*<div\s+class=["']collapsible-table__header["']\s*>([^]*?)<\/div>\s*<div\s+class=["']collapsible-table__content["']\s*>([^]*?)<\/div>\s*<\/div>/gim
  return markdown.replace(wrapper, (whole, header, content, offset, source) => {
    const title = /<span\b[^>]*>([^]*?)<\/span>/i.exec(header)?.[1]
    const previousHeadings = [...source.slice(0, offset).matchAll(/^(#{1,6})\s+/gm)]
    const level = Math.min(6, (previousHeadings.at(-1)?.[1].length || 1) + 1)
    const extras = inlineMarkdown(header
      .replace(/<span\b[^>]*>[^]*?<\/span>/gi, '')
      .replace(/<i\b[^>]*>[^]*?<\/i>/gi, '')
      .replace(/<em\b[^>]*>\s*\(click to expand\)\s*<\/em>/gi, ''))
    return [`${'#'.repeat(level)} ${inlineMarkdown(title || 'Table')}`, extras, content.trim()].filter(Boolean).join('\n\n')
  })
}

function protectCode(markdown) {
  const values = []
  const token = value => {
    const placeholder = `\uE000SCREEPS_DOCS_CODE_${values.length}\uE001`
    values.push(value)
    return placeholder
  }
  const lines = markdown.match(/.*(?:\n|$)/g).filter(Boolean)
  const outsideFences = []
  for (let index = 0; index < lines.length;) {
    const opening = /^(?: {0,3})(`{3,}|~{3,})/.exec(lines[index])
    if (!opening) {
      outsideFences.push(lines[index++])
      continue
    }
    const marker = opening[1][0]
    const minimum = opening[1].length
    let end = index + 1
    while (end < lines.length && !new RegExp(`^ {0,3}${marker}{${minimum},}[ \\t]*(?:\\n)?$`).test(lines[end])) end++
    if (end < lines.length) end++
    outsideFences.push(token(lines.slice(index, end).join('')))
    index = end
  }
  const protectedMarkdown = protectInlineCode(outsideFences.join(''), token)
  return {
    markdown: protectedMarkdown,
    restore(value) {
      return value.replace(/\uE000SCREEPS_DOCS_CODE_(\d+)\uE001/g, (_match, index) => values[Number(index)])
    }
  }
}

function protectInlineCode(markdown, token) {
  let protectedMarkdown = ''
  let index = 0
  while (index < markdown.length) {
    if (markdown[index] !== '`') {
      protectedMarkdown += markdown[index++]
      continue
    }
    let openingEnd = index
    while (markdown[openingEnd] === '`') openingEnd++
    const width = openingEnd - index
    let closingStart = openingEnd
    while (closingStart < markdown.length) {
      closingStart = markdown.indexOf('`', closingStart)
      if (closingStart < 0) break
      let closingEnd = closingStart
      while (markdown[closingEnd] === '`') closingEnd++
      if (closingEnd - closingStart === width) break
      closingStart = closingEnd
    }
    if (closingStart < 0) {
      protectedMarkdown += markdown.slice(index, openingEnd)
      index = openingEnd
      continue
    }
    const closingEnd = closingStart + width
    protectedMarkdown += token(markdown.slice(index, closingEnd))
    index = closingEnd
  }
  return protectedMarkdown
}

function attribute(tag, name) {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag)?.[1]
}

function decodeEntities(markdown) {
  const cache = new Map()
  return markdown.replace(/&(?:#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, entity => {
    if (!cache.has(entity)) {
      const node = parseFragment(entity).childNodes[0]
      cache.set(entity, node?.nodeName === '#text' ? node.value : entity)
    }
    return cache.get(entity)
  })
}

function transcodeRemainingHtml(markdown) {
  return markdown
    .replace(/<video\b[^>]*>[^]*?<source\b[^>]*\bsrc=["']([^"']+)["'][^>]*>[^]*?<\/video>/gi,
      (_html, source) => `[Video](${source})`)
    .replace(/<img\b[^>]*>/gi, tag => {
      const source = attribute(tag, 'src')
      return source ? `![${attribute(tag, 'alt') || ''}](${source})\n\n` : ''
    })
    .replace(/<source\b[^>]*>/gi, tag => {
      const source = attribute(tag, 'src')
      return source ? `[Media](${source})` : ''
    })
    .replace(/<code\b[^>]*>[^]*?<\/code>/gi,
      html => parseFragment(html).childNodes.map(inlineNode).join(''))
    .replace(/<(strong|b|em)\b[^>]*>[^]*?<\/\1>/gi, html => inlineMarkdown(html))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?nobr\b[^>]*>/gi, '')
    .replace(/<\/?(?:div|p)\b[^>]*>/gi, '\n\n')
    .replace(/<\/?video\b[^>]*>/gi, '')
    .replace(/&(?:#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, entity => decodeEntities(entity))
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
}

export function transcodeDocsMarkdown(markdown) {
  const protectedCode = protectCode(markdown)
  const transcoded = transcodeRemainingHtml(transcodeCollapsibleTables(protectedCode.markdown)
    .replace(/<style\b[^>]*>[^]*?<\/style>/gi, '')
    .replace(/<table\b[^>]*>[^]*?<\/table>/gi, tableMarkdown))
  return protectedCode.restore(transcoded).replace(/\n{3,}/g, '\n\n')
}

export const transcodeHtmlTables = transcodeDocsMarkdown

function productionTarget(target, options) {
  if (/^[a-z][a-z\d+.-]*:/i.test(target)) return target
  if (target.startsWith('//')) return `https:${target}`
  const url = new URL(target, new URL(options.source, options.site))
  url.pathname = url.pathname.replace(/\.md$/i, '.html')
  return url.href
}

export function absolutizeDocsLinks(markdown, options) {
  const linked = markdown.replace(/(!?\[[^\]]*\]\()([^)]+)(\))/g,
    (match, opening, target, closing) => `${opening}${productionTarget(target, options)}${closing}`)
  return linked.replace(/<(?:a|img|source)\b[^>]*>/gi, tag => tag.replace(
    /(\b(?:href|src)\s*=\s*["'])([^"']+)(["'])/gi,
    (attribute, opening, target, closing) => `${opening}${productionTarget(target, options)}${closing}`
  ))
}
