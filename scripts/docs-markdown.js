import { dirname, join, normalize } from 'node:path/posix'

function attribute(attributes, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attributes)
  return match?.[1] ?? match?.[2] ?? match?.[3]
}

function decodeEntities(value) {
  const named = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', ndash: '–', mdash: '—',
    quot: '"', times: '×', ge: '≥', le: '≤'
  }
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? entity
    const point = code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10)
    return Number.isFinite(point) ? String.fromCodePoint(point) : entity
  })
}

function inlineMarkdown(html) {
  let value = html
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '; ')
    .replace(/<img\b([^>]*)>/gi, (_tag, attributes) => {
      const source = attribute(attributes, 'src')
      if (!source) return ''
      return `![${attribute(attributes, 'alt') || ''}](${source})`
    })
    .replace(/<a\b([^>]*)>([^]*?)<\/a>/gi, (_tag, attributes, text) => {
      const target = attribute(attributes, 'href')
      return target ? `[${text}](${target})` : text
    })
    .replace(/<(strong|b)\b[^>]*>([^]*?)<\/\1>/gi, '**$2**')
    .replace(/<em\b[^>]*>([^]*?)<\/em>/gi, '*$1*')
    .replace(/<[^>]+>/g, '')
  value = decodeEntities(value)
    .replace(/(!\[[^\]]*\]\([^)]+\))(?=\S)/g, '$1 ')
    .replace(/\s*;\s*/g, '; ')
    .replace(/\s+/g, ' ')
    .trim()
  return value.replaceAll('|', '\\|')
}

function parseTable(html) {
  const rows = []
  let row
  let cell
  let cursor = 0
  const structuralTag = /<(\/?)\s*(tr|th|td)\b([^>]*)>/gi

  const closeCell = () => {
    if (!cell) return
    row ||= []
    row.push({
      value: inlineMarkdown(cell.html),
      header: cell.tag === 'th',
      colspan: Math.max(1, Number.parseInt(attribute(cell.attributes, 'colspan') || '1', 10))
    })
    cell = undefined
  }
  const closeRow = () => {
    closeCell()
    if (row?.length) rows.push(row)
    row = undefined
  }

  for (const match of html.matchAll(structuralTag)) {
    if (cell) cell.html += html.slice(cursor, match.index)
    const closing = Boolean(match[1])
    const tag = match[2].toLowerCase()
    if (tag === 'tr') {
      if (closing) closeRow()
      else {
        closeRow()
        row = []
      }
    } else if (closing) closeCell()
    else {
      closeCell()
      row ||= []
      cell = { tag, attributes: match[3], html: '' }
    }
    cursor = match.index + match[0].length
  }
  if (cell) cell.html += html.slice(cursor)
  closeRow()
  return rows
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

function immutableTarget(target, options, media = false) {
  if (/^[a-z][a-z\d+.-]*:/i.test(target)) return target
  if (target.startsWith('//')) return `https:${target}`
  if (target.startsWith('/api')) return `${options.site.replace(/\/$/, '')}${target}`

  const suffixAt = target.search(/[?#]/)
  const path = suffixAt < 0 ? target : target.slice(0, suffixAt)
  const suffix = suffixAt < 0 ? '' : target.slice(suffixAt)
  const sourcePath = path
    ? normalize(path.startsWith('/') ? path.slice(1) : join(dirname(options.source), path))
    : options.source
  const repositoryPath = sourcePath.replace(/\.html$/i, '.md')
  const repositorySuffix = repositoryPath.endsWith('.md') && suffix.startsWith('#') ? suffix.toLowerCase() : suffix
  const repository = options.repository.replace(/\.git$/, '').replace(/\/$/, '')
  const githubPath = repository.replace(/^https:\/\/github\.com\//, '')
  const base = media
    ? `https://raw.githubusercontent.com/${githubPath}/${options.revision}/source/`
    : `${repository}/blob/${options.revision}/source/`
  return `${base}${repositoryPath}${repositorySuffix}`
}

export function absolutizeDocsLinks(markdown, options) {
  const linked = markdown.replace(/(!?\[[^\]]*\]\()([^)]+)(\))/g, (match, opening, target, closing) => {
    const media = opening.startsWith('!')
    return `${opening}${immutableTarget(target, options, media)}${closing}`
  })
  return linked.replace(/<(?:a|img|source)\b[^>]*>/gi, tag => tag.replace(
    /(\b(?:href|src)\s*=\s*["'])([^"']+)(["'])/gi,
    (attribute, opening, target, closing) => `${opening}${immutableTarget(target, options, /\bsrc\s*=/i.test(opening))}${closing}`
  ))
}
