import assert from 'node:assert/strict'
import test from 'node:test'
import { transcodeHtmlTables } from '../scripts/docs-markdown.js'

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
