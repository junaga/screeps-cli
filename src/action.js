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
  let resolveResult
  const result = new Promise(resolve => { resolveResult = resolve })
  const receive = event => {
    if (shard && event.data.shard && event.data.shard !== shard) return
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
    const wrapped = `(()=>{try{const value=(${expression});console.log(${JSON.stringify(marker)}+JSON.stringify({value}))}catch(error){console.log(${JSON.stringify(marker)}+JSON.stringify({error:String(error?.stack||error)}))}})()`
    await api.userConsole(wrapped, shard)
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('The action was submitted, but its game result did not arrive. Check before retrying.')), resultTimeout)
    })
    const response = JSON.parse(await Promise.race([result, timeout]))
    if (response.error) throw new Error(`Game expression failed: ${response.error}`)
    return response.value
  } finally {
    clearTimeout(timer)
    api.socket.disconnect()
  }
}

export function assertGameAction(result) {
  if (result === 0) return
  const meanings = {
    '-1': 'you do not own the order',
    '-5': 'the order was not found',
    '-6': 'you do not have enough credits or resources',
    '-8': 'there is no capacity for this action',
    '-10': 'the game rejected an argument',
    '-11': 'the terminal is still on cooldown'
  }
  throw new Error(`The game rejected the action (${result}${meanings[result] ? `: ${meanings[result]}` : ''}).`)
}

export function powerCreepAction(name, method, argument = '') {
  return `Game.powerCreeps[${JSON.stringify(name)}].${method}(${argument})`
}
