import { dirname, join, normalize } from 'node:path/posix'
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
  return content
}

function inlineNodes(nodes) {
  const value = nodes.map(inlineNode).join('')
    .replace(/(!\[[^\]]*\]\([^)]+\))(?=\S)/g, '$1 ')
    .replace(/\s*;\s*/g, '; ')
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

export function transcodeHtmlTables(markdown) {
  return transcodeCollapsibleTables(markdown)
    .replace(/<style\b[^>]*>[^]*?<\/style>/gi, '')
    .replace(/<table\b[^>]*>[^]*?<\/table>/gi, tableMarkdown)
    .replace(/\n{3,}/g, '\n\n')
}

function productionTarget(target, options) {
  if (/^[a-z][a-z\d+.-]*:/i.test(target)) return target
  if (target.startsWith('//')) return `https:${target}`

  const suffixAt = target.search(/[?#]/)
  const path = suffixAt < 0 ? target : target.slice(0, suffixAt)
  const suffix = suffixAt < 0 ? '' : target.slice(suffixAt)
  const sourcePath = path
    ? normalize(path.startsWith('/') ? path.slice(1) : join(dirname(options.source), path))
    : options.source
  const publicPath = sourcePath.replace(/\.md$/i, '.html')
  return new URL(`${publicPath}${suffix}`, options.site).href
}

export function absolutizeDocsLinks(markdown, options) {
  const linked = markdown.replace(/(!?\[[^\]]*\]\()([^)]+)(\))/g,
    (match, opening, target, closing) => `${opening}${productionTarget(target, options)}${closing}`)
  return linked.replace(/<(?:a|img|source)\b[^>]*>/gi, tag => tag.replace(
    /(\b(?:href|src)\s*=\s*["'])([^"']+)(["'])/gi,
    (attribute, opening, target, closing) => `${opening}${productionTarget(target, options)}${closing}`
  ))
}
