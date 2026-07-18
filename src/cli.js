import { stderr, stdin } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { createClient, output } from './client.js'
import { API_CLIENT, CLI_VERSION, assertServerCompatibility, formatServerSummary } from './compatibility.js'
import { normalizeUrl } from './config.js'
import { readDocsManifest, readDocsPage } from './docs.js'
import { formatMarketHistory, formatMarketOrders, formatMessages, formatMyOrders, formatRooms, formatStatus } from './format.js'
import { parseValue, readModules, writeModules } from './io.js'
import { decodeTerrain, describeRoomChanges, renderRoom, renderTile, renderWorldMap, roomsAround } from './room.js'
import { login } from './token.js'
import { coordinate, flagColor, integer, pageNumber } from './validation.js'
import { DOCS_REPOSITORY, DOCS_REVISION, GAME_PROTOCOL } from './version.js'

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

function printResult(response, sentence, options) {
  if (response?.error || response?.ok === 0) throw new Error(response.error || 'The game rejected the action.')
  if (options.json) output(response, { json: true })
  else output(sentence)
}

async function supportsLiveSocket(api) {
  try {
    await api.socket.connect()
    return true
  } catch {
    return false
  } finally {
    api.socket.disconnect()
  }
}

async function waitForInterrupt(socket) {
  await new Promise(resolve => {
    const stop = () => {
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
      socket.disconnect()
      resolve()
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
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
}

async function renderTileOnce(api, room, x, y, options, ownUserId) {
  const [terrainResponse, objectResponse] = await Promise.all([
    api.gameRoomTerrain(room, options.shard), api.gameRoomObjects(room, options.shard)
  ])
  const terrain = decodeTerrain(terrainResponse)
  if (options.json) return output({
    room, x, y, terrain: terrain[y][x],
    objects: objectResponse.objects.filter(object => object.x === x && object.y === y)
  }, { json: true })
  output(renderTile({
    name: room, x, y,
    terrain,
    objects: objectResponse.objects,
    users: objectResponse.users,
    ownUserId
  }))
}

async function watchRoom(api, room, options) {
  const [objectResponse, timeResponse] = await Promise.all([
    api.gameRoomObjects(room, options.shard), api.gameTime(options.shard)
  ])
  const state = new Map(objectResponse.objects.map(object => [object._id, object]))
  const users = { ...(objectResponse.users || {}) }
  let lastTick = timeResponse.time
  if (options.json) output({ room, fromTick: timeResponse.time }, { json: true })
  else output(`Watching ${room} from tick ${timeResponse.time}.`)
  const report = event => {
    if (options.json) return output(event.data, { json: true })
    Object.assign(users, event.data.users || {})
    lastTick = event.data.gameTime ?? lastTick
    const tick = lastTick
    for (const line of describeRoomChanges(state, event.data.objects, users)) output(`${tick}  ${line}`)
  }
  try {
    await api.socket.subscribeRoom(room, options.shard, report)
    await api.socket.connect()
  } catch {
    api.socket.disconnect()
    throw new Error('Live room updates are unavailable. Run screeps login to refresh the live session.')
  }
  await waitForInterrupt(api.socket)
}

export async function run(program, argv) {
  const docsManifest = await readDocsManifest()
  program
    .name('screeps')
    .description('Play Screeps World from the terminal')
    .version(CLI_VERSION)
    .option('-s, --shard <name>', 'world shard')
    .option('--json', 'print machine-readable JSON')
    .option('--no-color', 'disable ANSI color')
    .showSuggestionAfterError()
    .addHelpText('after', `
Examples:
  screeps status
  screeps room E4S1
  screeps watch E4S1`)

  program.command('login <server>')
    .description('connect this CLI to a Screeps server')
    .addHelpText('after', `
Login stores private credentials locally so HTTP and live commands keep working.

Example:
  screeps login example.com:21025`)
    .action(async (server, _options, command) => {
      const rootOptions = connectionOptions(command)
      const result = await login({
        server,
        shard: rootOptions.shard,
        onDesktopRequired: promptForDesktopLogin,
      })
      output(`Authenticated as ${result.username} on ${normalizeUrl(server)}. This server is now active.`)
      if (result.passwordCreated) output('Enabled durable live login for this account.')
    })

  program.command('server')
    .description('show server compatibility')
    .action(withClient(async ({ api, connection }, options) => {
      const [version, authmod, live] = await Promise.all([api.version(), api.authmod(), supportsLiveSocket(api)])
      assertServerCompatibility(version)
      const result = {
        cli: CLI_VERSION,
        game: { protocol: GAME_PROTOCOL },
        docs: { repository: DOCS_REPOSITORY, revision: DOCS_REVISION },
        client: API_CLIENT,
        url: connection.url,
        auth: authmod,
        live,
        version
      }
      if (options.json) output(result, { json: true })
      else output(formatServerSummary(result))
    }, { requireAuth: false }))

  const docs = program.command('docs').description('read the official game documentation')
  for (const page of docsManifest.pages) {
    docs.command(page.command)
      .description(page.title)
      .action(async () => process.stdout.write(await readDocsPage(page.file)))
  }
  docs.action((_options, command) => command.help())

  program.command('status')
    .description('show your player status')
    .action(withClient(async ({ api, connection, shard }, options) => {
      const me = await api.authMe()
      const [version, world, time, rooms] = await Promise.all([
        api.version(), api.userWorldStatus(), api.gameTime(shard), api.userRooms(me._id)
      ])
      const result = { url: connection.url, shard, tick: time.time, version, user: me, world, rooms }
      if (options.json) output(result, { json: true })
      else output(formatStatus(result))
    }))

  program.command('rooms')
    .description('show your claimed rooms')
    .action(withClient(async ({ api }, options) => {
      const me = await api.authMe()
      const response = await api.userRooms(me._id)
      if (options.json) output(response, { json: true })
      else output(formatRooms(response))
    }))

  program.command('room <name>')
    .description('draw the current room')
    .action(withClient(async ({ api }, room, options) => {
      const me = await api.authMe()
      await renderOnce(api, room, options, me._id)
    }))

  program.command('tile <room> <x> <y>')
    .description('show everything on one tile')
    .action(withClient(async ({ api }, room, x, y, options) => {
      const me = await api.authMe()
      await renderTileOnce(api, room, coordinate(x), coordinate(y), options, me._id)
    }))

  program.command('watch <room>')
    .description('stream room activity in English')
    .action(withClient(async ({ api }, room, options) => {
      await watchRoom(api, room, options)
    }))

  program.command('map <center> [radius]')
    .description('show the world around a room')
    .action(withClient(async ({ api }, center, radius = '5', options) => {
      const numericRadius = integer(radius, 'Radius', { min: 0, max: 20 })
      const rooms = roomsAround(center, numericRadius)
      const response = await api.gameMapStats(rooms, 'owner0', options.shard)
      if (options.json) output(response, { json: true })
      else output(renderWorldMap(center, numericRadius, response))
    }))

  const memory = program.command('memory').description('inspect game Memory')
  memory.command('get [path]')
    .description('show all Memory or one path')
    .action(withClient(async ({ api }, path, options) => output(await api.userMemoryGet(path, options.shard), { json: true })))
  memory.command('set <path> <value>')
    .description('set JSON or string data at a Memory path')
    .action(withClient(async ({ api }, path, value, options) => output(await api.userMemorySet(path, parseValue(value), options.shard), { json: true })))

  const code = program.command('code').description('manage game code')
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
    .description('run game JavaScript')
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
      await waitForInterrupt(api.socket)
    }))

  const flag = program.command('flag').description('manage flags')
  flag.command('place <name> <room> <x> <y>')
    .description('place a named flag in a room')
    .option('--primary <number>', 'primary color', flagColor, 1)
    .option('--secondary <number>', 'secondary color', flagColor, 1)
    .action(withClient(async ({ api }, name, room, x, y, options) => {
      const position = { x: coordinate(x), y: coordinate(y) }
      const response = await api.gameCreateFlag(room, position.x, position.y, name, options.primary, options.secondary, options.shard)
      printResult(response, `Placed flag ${name} at ${room} ${position.x},${position.y}.`, options)
    }))
  flag.command('remove <name> <room>')
    .description('remove a flag from a room')
    .action(withClient(async ({ api }, name, room, options) => {
      const response = await api.gameRemoveFlag(room, name, options.shard)
      printResult(response, `Removed flag ${name} from ${room}.`, options)
    }))

  program.command('build <type> <room> <x> <y>')
    .description('place a construction site')
    .option('--name <name>', 'optional structure name')
    .action(withClient(async ({ api }, type, room, x, y, options) => {
      const position = { x: coordinate(x), y: coordinate(y) }
      const response = await api.gameCreateConstruction(room, position.x, position.y, type, options.name, options.shard)
      printResult(response, `Placed ${type} construction at ${room} ${position.x},${position.y}.`, options)
    }))

  const spawn = program.command('spawn').description('manage spawns')
  spawn.command('place <room> <x> <y> [name]')
    .description('place your first spawn')
    .action(withClient(async ({ api }, room, x, y, name, options) => {
      const position = { x: coordinate(x), y: coordinate(y) }
      const response = await api.gamePlaceSpawn(room, position.x, position.y, name, options.shard)
      printResult(response, `Placed spawn${name ? ` ${name}` : ''} at ${room} ${position.x},${position.y}.`, options)
    }))

  const message = program.command('message').description('message other players')
  message.command('list [user]')
    .description('show conversations or messages with one player')
    .action(withClient(async ({ api }, user, options) => {
      const response = user ? await api.userMessagesList(user) : await api.userMessagesIndex()
      if (options.json) output(response, { json: true })
      else output(formatMessages(response))
    }))
  message.command('send <user> <text>')
    .description('send a message to a player')
    .action(withClient(async ({ api }, user, text, options) => {
      const response = await api.userMessagesSend(user, text)
      printResult(response, `Sent message to ${user}.`, options)
    }))

  const market = program.command('market').description('browse the market')
  market.command('orders <resource>')
    .description('show buy and sell orders for a resource')
    .action(withClient(async ({ api }, resource, options) => {
      const response = await api.gameMarketOrders(resource, options.shard)
      if (options.json) output(response, { json: true })
      else output(formatMarketOrders(response, resource))
    }))
  market.command('my-orders')
    .description('show your active market orders')
    .action(withClient(async ({ api }, options) => {
      const response = await api.gameMarketMyOrders()
      if (options.json) output(response, { json: true })
      else output(formatMyOrders(response))
    }))
  market.command('history [page]')
    .description('show your transaction history')
    .action(withClient(async ({ api }, page, options) => {
      const response = await api.userMoneyHistory(page == null ? 0 : pageNumber(page))
      if (options.json) output(response, { json: true })
      else output(formatMarketHistory(response))
    }))

  program.command('raw <method> <path> [params]', { hidden: true })
    .description('call any Screeps endpoint; params is a JSON object')
    .action(withClient(async ({ api }, method, path, params, options) => {
      const endpoint = path.startsWith('/api/') ? path : `/api/${path.replace(/^\//, '')}`
      output(await api.req(method.toUpperCase(), endpoint, parseValue(params) || {}), options)
    }))

  await program.parseAsync(argv)
}
