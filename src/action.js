import { randomUUID } from 'node:crypto'

const resultTimeout = 15_000

function decodeConsoleText(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' }
  return value.replace(/&#x([\da-f]+);|&#(\d+);|&(amp|apos|gt|lt|quot);/gi, (entity, hex, decimal, name) => {
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16))
    if (decimal) return String.fromCodePoint(Number(decimal))
    return named[name.toLowerCase()]
  })
}

export async function runGameExpression(api, expression, shard) {
  const marker = `screeps-cli:${randomUUID()}:`
  const { promise: result, resolve: resolveResult, reject: rejectResult } = Promise.withResolvers()
  const receive = event => {
    if (shard && event.data.shard && event.data.shard !== shard) return
    if (event.data.error) {
      rejectResult(new Error(`Game console failed: ${event.data.error}`))
      return
    }
    for (const line of event.data.messages?.log || []) {
      const text = String(line)
      const offset = text.indexOf(marker)
      if (offset >= 0) resolveResult(decodeConsoleText(text.slice(offset + marker.length)))
    }
  }

  await api.socket.subscribeUserConsole(receive)
  let timer
  try {
    await api.socket.connect()
    const wrapped = wrapGameExpression(expression, marker)
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('The action was submitted, but its game result did not arrive. Check before retrying.')), resultTimeout)
    })
    await api.userConsole(wrapped, shard)
    const response = JSON.parse(await Promise.race([result, timeout]))
    if (response.error) throw new Error(`Game expression failed: ${response.error}`)
    return response.value
  } finally {
    clearTimeout(timer)
    try { await api.socket.unsubscribeUserConsole?.(receive) } catch {}
    api.socket.disconnect()
  }
}

export function wrapGameExpression(expression, marker) {
  return `(()=>{try{let s=new Set,v=(0,eval)(${JSON.stringify(expression)}),j=JSON.stringify({value:v},(_,x)=>typeof x=='bigint'?x+'n':typeof x=='function'||typeof x=='symbol'?String(x):typeof x=='number'&&!isFinite(x)?String(x):typeof x=='undefined'?'undefined':x&&typeof x=='object'?(s.has(x)?'[Circular]':s.add(x)&&x):x);console.log(${JSON.stringify(marker)}+j)}catch(e){console.log(${JSON.stringify(marker)}+JSON.stringify({error:String(e.stack||e)}))}})()`
}

export function assertGameAction(result) {
  if (result === 0) return
  const meanings = {
    '-1': 'you do not own the target',
    '-3': 'the name is already in use',
    '-4': 'the target is busy or unavailable',
    '-5': 'the target was not found',
    '-6': 'you do not have enough credits or resources',
    '-8': 'the action limit or capacity was reached',
    '-10': 'the game rejected an argument',
    '-11': 'the action is still on cooldown'
  }
  throw new Error(`The game rejected the action (${result}${meanings[result] ? `: ${meanings[result]}` : ''}).`)
}

export function powerCreepAction(name, method, argument = '') {
  return `Game.powerCreeps[${JSON.stringify(name)}].${method}(${argument})`
}
