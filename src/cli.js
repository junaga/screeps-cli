import { createClient, output } from './client.js'
import { normalizeUrl } from './config.js'
import { parseValue, readModules, writeModules } from './io.js'
import { decodeTerrain, mergeRoomObjects, renderRoom, renderWorldMap, roomsAround, summarizeObjects } from './room.js'
import { login } from './token.js'

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
    return action(context, ...args.slice(0, -1), options, command)
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
  await api.socket.subscribeRoom(room, options.shard, draw)
  await api.socket.connect()
  await new Promise(resolve => {
    const stop = () => { api.socket.disconnect(); resolve() }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
}

export async function run(program, argv) {
  program
    .name('screeps')
    .description('Play Screeps World from the terminal')
    .version('0.1.0')
    .option('-s, --shard <name>', 'world shard')
    .option('--json', 'print machine-readable JSON')
    .option('--no-color', 'disable ANSI color')
    .showSuggestionAfterError()

  program.command('login <server>')
    .description('log in and make a Screeps server active')
    .addHelpText('after', `
First login to a Steam-authenticated private server:
  1. Open Screeps and connect to the server.
  2. Leave the game running.
  3. Run: screeps login host:port

You only need to log in once per server. Normal commands use the active
saved server. Logging in again switches servers or revalidates the token.

To use an existing API token:
  SCREEPS_TOKEN=... screeps login host:port

Credentials are stored in ~/.config/screeps-cli/config.json (mode 0600).`)
    .action(async (server, _options, command) => {
      const rootOptions = connectionOptions(command)
      const result = await login({
        server,
        shard: rootOptions.shard,
      })
      output(`Authenticated as ${result.username} on ${normalizeUrl(server)}. This server is now active.`)
    })

  program.command('server')
    .description('show server version, features, and authentication method')
    .action(withClient(async ({ api, connection }, options) => {
      const [version, authmod] = await Promise.all([api.version(), api.authmod()])
      output({ url: connection.url, auth: authmod, version }, options)
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
    .action(withClient(async ({ api }, path, options) => output(await api.userMemoryGet(path, options.shard), { json: true })))
  memory.command('set <path> <value>')
    .description('set JSON or string data at a Memory path')
    .action(withClient(async ({ api }, path, value, options) => output(await api.userMemorySet(path, parseValue(value), options.shard), { json: true })))

  const code = program.command('code').description('download and deploy game code')
  code.command('pull [directory]')
    .option('-b, --branch <name>', 'code branch', 'default')
    .action(withClient(async ({ api }, directory = 'src', options) => {
      const response = await api.userCodeGet(options.branch)
      const paths = await writeModules(directory, response.modules)
      output(`Wrote ${paths.length} modules to ${directory}.`)
    }))
  code.command('push [directory]')
    .option('-b, --branch <name>', 'code branch', 'default')
    .action(withClient(async ({ api }, directory = 'src', options) => {
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
      await api.socket.connect()
      await new Promise(resolve => process.once('SIGINT', () => { api.socket.disconnect(); resolve() }))
    }))

  const flag = program.command('flag').description('manage flags')
  flag.command('create <room> <x> <y> <name>')
    .option('--primary <number>', 'primary color', Number, 1)
    .option('--secondary <number>', 'secondary color', Number, 1)
    .action(withClient(async ({ api }, room, x, y, name, options) => output(await api.gameCreateFlag(room, Number(x), Number(y), name, options.primary, options.secondary, options.shard), { json: true })))
  flag.command('remove <room> <name>')
    .action(withClient(async ({ api }, room, name, options) => output(await api.gameRemoveFlag(room, name, options.shard), { json: true })))

  program.command('construct <room> <x> <y> <type>')
    .description('place a construction site')
    .option('--name <name>', 'optional structure name')
    .action(withClient(async ({ api }, room, x, y, type, options) => output(await api.gameCreateConstruction(room, Number(x), Number(y), type, options.name, options.shard), { json: true })))

  program.command('place-spawn <room> <x> <y> [name]')
    .description('place the initial spawn')
    .action(withClient(async ({ api }, room, x, y, name, options) => output(await api.gamePlaceSpawn(room, Number(x), Number(y), name, options.shard), { json: true })))

  const messages = program.command('messages').description('read and send player messages')
  messages.command('list [user]').action(withClient(async ({ api }, user, options) => output(user ? await api.userMessagesList(user) : await api.userMessagesIndex(), options)))
  messages.command('send <user> <text>').action(withClient(async ({ api }, user, text) => output(await api.userMessagesSend(user, text), { json: true })))

  const market = program.command('market').description('inspect the market')
  market.command('orders <resource>').action(withClient(async ({ api }, resource, options) => output(await api.gameMarketOrders(resource, options.shard), options)))
  market.command('mine').action(withClient(async ({ api }, options) => output(await api.gameMarketMyOrders(), options)))
  market.command('history [page]').action(withClient(async ({ api }, page, options) => output(await api.userMoneyHistory(page == null ? 0 : Number(page)), options)))

  program.command('raw <method> <path> [params]')
    .description('call any Screeps endpoint; params is a JSON object')
    .action(withClient(async ({ api }, method, path, params, options) => {
      const endpoint = path.startsWith('/api/') ? path : `/api/${path.replace(/^\//, '')}`
      output(await api.req(method.toUpperCase(), endpoint, parseValue(params) || {}), options)
    }))

  await program.parseAsync(argv)
}
