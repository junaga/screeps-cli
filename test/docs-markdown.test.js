import assert from 'node:assert/strict'
import test from 'node:test'
import { absolutizeDocsLinks, transcodeDocsMarkdown, transcodeHtmlTables } from '../docs/markdown.js'

test('transcodes headers, category rows, inline HTML, and colspans', () => {
  const html = `<table>
<tr><th>Name</th><th>Effect</th></tr>
<tr><th colspan="2">Tier 1</th></tr>
<tr><td><strong>Utrium</strong></td><td>Attack<br>Heal&nbsp;&times;&nbsp;<em>2</em></td></tr>
</table>`
  assert.equal(transcodeHtmlTables(html), [
    '| Name | Effect |',
    '| --- | --- |',
    '| **Tier 1** |  |',
    '| **Utrium** | Attack; Heal × *2* |'
  ].join('\n'))
})

test('drops decorative image columns and tolerates an unclosed row', () => {
  const html = `<table>
<tr><td><img src="power.svg"></td><th>GENERATE_OPS</th><td>Generate ops.</td>
<tr><td><img src="spawn.svg"></td><th>OPERATE_SPAWN</th><td>Speed up spawning.</td></tr>
</table>`
  assert.equal(transcodeHtmlTables(html), [
    '|  |  |',
    '| --- | --- |',
    '| **GENERATE_OPS** | Generate ops. |',
    '| **OPERATE_SPAWN** | Speed up spawning. |'
  ].join('\n'))
})

test('turns collapsible table controls into contextual Markdown headings', () => {
  const html = `## Commodities

<style>.table { color: red; }</style>

 <div class="collapsible-table">
<div class="collapsible-table__header"><i class="icon"></i><span>Mechanical chain</span><em>(click to expand)</em></div>
<div class="collapsible-table__content"><table><tr><th>Product</th></tr><tr><td>Tube</td></tr></table></div>
</div>`
  assert.equal(transcodeHtmlTables(html), [
    '## Commodities',
    '',
    '### Mechanical chain',
    '',
    '| Product |',
    '| --- |',
    '| Tube |'
  ].join('\n'))
})

test('resolves relative docs links and media to the production site', () => {
  const options = {
    site: 'https://docs.screeps.com/',
    source: 'guides/example.md'
  }
  const markdown = [
    '![map](../img/map.png)',
    '[guide](../control.html#Raising-GCL)',
    '[API](/api/#Game)',
    '![](//static.screeps.com/icon.png)',
    '<video><source src="../img/demo.mp4"></video>'
  ].join('\n')
  assert.equal(absolutizeDocsLinks(markdown, options), [
    '![map](https://docs.screeps.com/img/map.png)',
    '[guide](https://docs.screeps.com/control.html#Raising-GCL)',
    '[API](https://docs.screeps.com/api/#Game)',
    '![](https://static.screeps.com/icon.png)',
    '<video><source src="https://docs.screeps.com/img/demo.mp4"></video>'
  ].join('\n'))
})

test('transcodes presentation HTML without touching literal code examples', () => {
  const markdown = [
    '<video autoplay><source src="demo.mp4" type="video/mp4"></video>',
    '<div style="text-align:center"><p><strong style="color:red">[ENTER](play.html)</strong></p></div>',
    'Set <code style="white-space:nowrap">ptr: true</code>.<br>Then continue &mdash; carefully.',
    '<img src="map.png" alt="Map" align="right">Description.',
    'Use an `<iframe>` element.',
    '```html',
    '<table><tr><td>This is example code, not a table.</td></tr></table>',
    '```'
  ].join('\n')
  assert.equal(transcodeDocsMarkdown(markdown), [
    '[Video](demo.mp4)',
    '',
    '**[ENTER](play.html)**',
    '',
    'Set `ptr: true`.',
    'Then continue — carefully.',
    '![Map](map.png)',
    '',
    'Description.',
    'Use an `<iframe>` element.',
    '```html',
    '<table><tr><td>This is example code, not a table.</td></tr></table>',
    '```'
  ].join('\n'))
})

test('keeps inline code formatting inside transcoded tables', () => {
  assert.equal(transcodeDocsMarkdown('<table><tr><th>Header</th></tr><tr><td><code>a;b</code> and `<tag>`</td></tr></table>'), [
    '| Header |',
    '| --- |',
    '| `a;b` and `<tag>` |'
  ].join('\n'))
})
