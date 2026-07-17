import { createClient, output } from './client.js'
import { API_CLIENT, CLI_VERSION, assertServerCompatibility, formatServerSummary } from './compatibility.js'
import { normalizeUrl } from './config.js'
import { parseValue, readModules, writeModules } from './io.js'
import { decodeTerrain, mergeRoomObjects, renderRoom, renderWorldMap, roomsAround, summarizeObjects } from './room.js'
import { login } from './token.js'
import { createInterface } from 'node:readline/promises'
import { stdin, stderr } from 'node:process'

async function promptForDesktopLogin(url) {
  if (!stdin.isTTY) {
    throw new Error(`Login needs an interactive terminal. Open Screeps, connect to ${url}, then run this command again.`)
  }
  stderr.write(`\nOpen Screeps and connect to ${url}.\nLog in, keep the game open, then return here.\n`)
  const prompt = createInterface({ input: stdin, output: stderr })
  try {
    await prompt.question('Press Enter when the game is connected... ')
  } finally {
    prompt.close()
  }
}

function connectionOptions(command) {
  let current = command
  while (current.parent) current = current.parent
  return current.opts()
}

function withClient(action, clientOptions = {}) {
  return async (...args) => {
    const command = args.at(-1)
    const options = { ...connectionOptions(command), ...command.opts() }
    const context = await createClient({ ...options, ...clientOptions })
    const operands = args.slice(0, command.registeredArguments.length)
    return action(context, ...operands, options, command)
  }
}

async function renderOnce(api, room, options, ownUserId) {
  const [terrainResponse, objectResponse, timeResponse] = await Promise.all([
    api.gameRoomTerrain(room, options.shard),
    api.gameRoomObjects(room, options.shard),
    api.gameTime(options.shard)
  ])
  if (options.json) return output(objectResponse, { json: true })
  output(renderRoom({
    name: room,
    terrain: decodeTerrain(terrainResponse),
    objects: objectResponse.objects,
    ownUserId,
    gameTime: timeResponse.time,
    color: options.color
  }))
  if (options.details) output(summarizeObjects(objectResponse.objects, objectResponse.users), { json: true })
}

async function watchRoom(api, room, options, ownUserId) {
  const [terrainResponse, objectResponse] = await Promise.all([
    api.gameRoomTerrain(room, options.shard),
    api.gameRoomObjects(room, options.shard)
  ])
  const terrain = decodeTerrain(terrainResponse)
  const state = new Map(objectResponse.objects.map(object => [object._id, object]))
  let lastTick
  const draw = event => {
    if (event) {
      mergeRoomObjects(state, event.data.objects)
      lastTick = event.data.gameTime ?? lastTick
    }
    if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H')
    output(renderRoom({ name: room, terrain, objects: [...state.values()], ownUserId, gameTime: lastTick, color: options.color }))
  }
  draw()
  try {
    await api.socket.subscribeRoom(room, options.shard, draw)
    await api.socket.connect()
    await new Promise(resolve => {
      const stop = () => { api.socket.disconnect(); resolve() }
      process.once('SIGINT', stop)
      process.once('SIGTERM', stop)
    })
  } catch {
    api.socket.disconnect()
    process.stderr.write('Live socket unavailable; watching room ticks over HTTP.\n')
    let stopped = false
    const stop = () => { stopped = true }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    try {
      while (!stopped) {
        const [objects, time] = await Promise.all([
          api.gameRoomObjects(room, options.shard),
          api.gameTime(options.shard)
        ])
        if (time.time !== lastTick) {
          state.clear()
          for (const object of objects.objects) state.set(object._id, object)
          lastTick = time.time
          draw()
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } finally {
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
    }
  }
}

export async function run(program, argv) {
  program
    .name('screeps')
    .description('Play Screeps World from the terminal')
    .version(CLI_VERSION)
    .option('-s, --shard <name>', 'world shard')
    .option('--json', 'print machine-readable JSON')
    .option('--no-color', 'disable ANSI color')
    .showSuggestionAfterError()

  program.command('login <server>')
    .description('connect this CLI to a Screeps server')
    .addHelpText('after', `
On first login, this command waits while you open Screeps and connect to the
server. It then imports that session and saves a dedicated CLI token.

To skip the desktop flow with an existing token:
  SCREEPS_TOKEN=... screeps login host:port

The token is saved in ~/.config/screeps-cli/config.json with mode 0600.
Your Steam and account passwords are not stored.`)
    .action(async (server, _options, command) => {
      const rootOptions = connectionOptions(command)
      const result = await login({
        server,
        shard: rootOptions.shard,
        onDesktopRequired: promptForDesktopLogin,
      })
      output(`Authenticated as ${result.username} on ${normalizeUrl(server)}. This server is now active.`)
    })

  program.command('server')
    .description('show server version, features, and authentication method')
    .action(withClient(async ({ api, connection }, options) => {
      const [version, authmod] = await Promise.all([api.version(), api.authmod()])
      assertServerCompatibility(version)
      const result = { cli: CLI_VERSION, client: API_CLIENT, url: connection.url, auth: authmod, version }
      if (options.json) output(result, { json: true })
      else output(formatServerSummary(result))
    }, { requireAuth: false }))

  program.command('status')
    .description('show account and world status')
    .action(withClient(async ({ api, connection, shard }, options) => {
      const me = await api.authMe()
      const [version, world, time, rooms] = await Promise.all([
        api.version(), api.userWorldStatus(), api.gameTime(shard), api.userRooms(me._id)
      ])
      output({ url: connection.url, shard, tick: time.time, version, user: me, world, rooms }, options)
    }))

  program.command('rooms')
    .description('list your rooms')
    .action(withClient(async ({ api }, options) => {
      const me = await api.authMe()
      output(await api.userRooms(me._id), options)
    }))

  program.command('room <name>')
    .description('render a room as a 50×50 terminal map')
    .option('-w, --watch', 'redraw on every live room update')
    .option('-d, --details', 'also print object details')
    .action(withClient(async ({ api }, room, options) => {
      const me = await api.authMe()
      if (options.watch) await watchRoom(api, room, options, me._id)
      else await renderOnce(api, room, options, me._id)
    }))

  program.command('map <center> [radius]')
    .description('render world ownership around a room')
    .action(withClient(async ({ api }, center, radius = '5', options) => {
      const numericRadius = Number(radius)
      if (!Number.isInteger(numericRadius) || numericRadius < 0 || numericRadius > 20) throw new Error('Radius must be an integer from 0 to 20')
      const rooms = roomsAround(center, numericRadius)
      const response = await api.gameMapStats(rooms, 'owner0', options.shard)
      if (options.json) output(response, { json: true })
      else output(renderWorldMap(center, numericRadius, response))
    }))

  const memory = program.command('memory').description('read and write game Memory')
  memory.command('get [path]')
    .description('show all Memory or one path')
    .action(withClient(async ({ api }, path, options) => output(await api.userMemoryGet(path, options.shard), { json: true })))
  memory.command('set <path> <value>')
    .description('set JSON or string data at a Memory path')
    .action(withClient(async ({ api }, path, value, options) => output(await api.userMemorySet(path, parseValue(value), options.shard), { json: true })))

  const code = program.command('code').description('download and deploy game code')
  code.command('pull [directory]')
    .description('download a code branch into a directory')
    .option('-b, --branch <name>', 'code branch', 'default')
    .action(withClient(async ({ api }, directory = 'bot', options) => {
      const response = await api.userCodeGet(options.branch)
      const paths = await writeModules(directory, response.modules)
      output(`Wrote ${paths.length} modules to ${directory}.`)
    }))
  code.command('push [directory]')
    .description('deploy JavaScript and WASM modules from a directory')
    .option('-b, --branch <name>', 'code branch', 'default')
    .action(withClient(async ({ api }, directory = 'bot', options) => {
      const modules = await readModules(directory)
      await api.userCodeSet({ branch: options.branch, modules })
      output(`Deployed ${Object.keys(modules).length} modules to branch "${options.branch}".`)
    }))

  program.command('console [expression]')
    .description('evaluate an expression and/or follow the game console')
    .option('-f, --follow', 'stream console messages')
    .action(withClient(async ({ api }, expression, options) => {
      if (expression) output(await api.userConsole(expression, options.shard), { json: true })
      if (!options.follow) return
      await api.socket.subscribeUserConsole(event => {
        const shard = event.data.shard ? `[${event.data.shard}] ` : ''
        if (event.data.error) process.stderr.write(`${shard}${event.data.error}\n`)
        for (const line of event.data.messages?.log || []) output(`${shard}${line}`)
        for (const result of event.data.messages?.results || []) output(`${shard}< ${result}`)
      })
      try {
        await api.socket.connect()
      } catch {
        api.socket.disconnect()
        throw new Error('This server rejected live console authentication. Console streaming is unavailable; one-time expressions still work.')
      }
      await new Promise(resolve => process.once('SIGINT', () => { api.socket.disconnect(); resolve() }))
    }))

  const flag = program.command('flag').description('manage flags')
  flag.command('create <room> <x> <y> <name>')
    .description('place a named flag in a room')
    .option('--primary <number>', 'primary color', Number, 1)
    .option('--secondary <number>', 'secondary color', Number, 1)
    .action(withClient(async ({ api }, room, x, y, name, options) => output(await api.gameCreateFlag(room, Number(x), Number(y), name, options.primary, options.secondary, options.shard), { json: true })))
  flag.command('remove <room> <name>')
    .description('remove a flag from a room')
    .action(withClient(async ({ api }, room, name, options) => output(await api.gameRemoveFlag(room, name, options.shard), { json: true })))

  program.command('construct <room> <x> <y> <type>')
    .description('place a construction site')
    .option('--name <name>', 'optional structure name')
    .action(withClient(async ({ api }, room, x, y, type, options) => output(await api.gameCreateConstruction(room, Number(x), Number(y), type, options.name, options.shard), { json: true })))

  program.command('place-spawn <room> <x> <y> [name]')
    .description('place the initial spawn')
    .action(withClient(async ({ api }, room, x, y, name, options) => output(await api.gamePlaceSpawn(room, Number(x), Number(y), name, options.shard), { json: true })))

  const messages = program.command('messages').description('read and send player messages')
  messages.command('list [user]')
    .description('show conversations or messages with one player')
    .action(withClient(async ({ api }, user, options) => output(user ? await api.userMessagesList(user) : await api.userMessagesIndex(), options)))
  messages.command('send <user> <text>')
    .description('send a message to a player')
    .action(withClient(async ({ api }, user, text) => output(await api.userMessagesSend(user, text), { json: true })))

  const market = program.command('market').description('inspect the market')
  market.command('orders <resource>')
    .description('show buy and sell orders for a resource')
    .action(withClient(async ({ api }, resource, options) => output(await api.gameMarketOrders(resource, options.shard), options)))
  market.command('mine')
    .description('show your active market orders')
    .action(withClient(async ({ api }, options) => output(await api.gameMarketMyOrders(), options)))
  market.command('history [page]')
    .description('show your transaction history')
    .action(withClient(async ({ api }, page, options) => output(await api.userMoneyHistory(page == null ? 0 : Number(page)), options)))

  program.command('raw <method> <path> [params]', { hidden: true })
    .description('call any Screeps endpoint; params is a JSON object')
    .action(withClient(async ({ api }, method, path, params, options) => {
      const endpoint = path.startsWith('/api/') ? path : `/api/${path.replace(/^\//, '')}`
      output(await api.req(method.toUpperCase(), endpoint, parseValue(params) || {}), options)
    }))

  await program.parseAsync(argv)
}
