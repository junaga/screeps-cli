import { stderr, stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { assertGameAction, runGameExpression } from './action.js'
import { createClient, output } from './client.js'
import { forgetServer, normalizeUrl, readConfig } from './config.js'
import { compileDocsPattern, readDocsManifest, readDocsPage, searchMarkdown } from './docs.js'
import { formatBody, formatMarketHistory, formatMarketOrders, formatMessages, formatMyOrders, formatStatus } from './format.js'
import { compareModules, parseValue, readModules, writeModules } from './io.js'
import { decodeTerrain, describeRoomChanges, mergeRoomObjects, renderLiveRoomFrame, renderRoom, renderTile, renderWorldMap, roomsAround } from './room.js'
import { login } from './token.js'
import { integer, pageNumber, parseTarget, playerName, positiveNumber, roomName } from './validation.js'
import { formatVersion } from './version.js'

const TOP_HELP = `Screeps — program a world that never stops.

Usage:
  screeps [options] [target]
  screeps [options] <room> <x,y>
  screeps [options] <command> [arguments]

Inspect a target:
  screeps                       your empire and what needs attention
  screeps W8N3                  a live room
  screeps W8N3 24,18            a tile and everything on it
  screeps <object-id>            a visible game object
  screeps @player               another player

World:
  map [room]                    explore the world around a room
  watch [target]                stream meaningful events as plain text

Programming:
  code [dir]                    inspect and synchronize game code
  console [javascript]          evaluate JavaScript or open a live console
  memory [path]                 inspect or edit persistent Memory

Game:
  market [resource]             browse prices, trade, and manage orders
  power [creep]                 inspect and develop power creeps
  messages [@player]            read conversations or message a player

Reference:
  docs [topic]                  read or search the game documentation

Connection:
  login [server]                connect and remember a Screeps server
  logout [server]               remove a remembered login

Options:
      --server <name>           use a remembered server
      --shard <name>            use a world shard
  -j, --json                    emit stable JSON; streams use NDJSON
      --no-color                disable terminal color
  -h, --help                    show help for any command
  -V, --version                 show version and compatibility information

Live views stay open in a terminal; piped views print one-shot snapshots.
--json changes their format, never their meaning. Default views are read-only.
Actions and examples live one level down: screeps <command> --help

Examples:
  screeps
  screeps W8N3
  screeps W8N3 24,18
  screeps watch W8N3
  screeps code push ./dist
  screeps console 'Game.cpu.bucket'
  screeps market energy
  screeps docs --search 'tower|rampart'`

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

async function submitGameAction(api, expression, shard, sentence, options) {
  const result = await runGameExpression(api, expression, shard)
  assertGameAction(result)
  if (options.json) output({ ok: true, result }, { json: true })
  else output(sentence)
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

function inheritedOptions(command) {
  const commands = []
  for (let current = command; current; current = current.parent) commands.unshift(current)
  return Object.assign({}, ...commands.map(current => current.opts()))
}

function withClient(action, clientOptions = {}) {
  return async (...args) => {
    const command = args.at(-1)
    const options = inheritedOptions(command)
    const context = await createClient({ ...options, ...clientOptions })
    const operands = args.slice(0, command.registeredArguments.length)
    return action(context, ...operands, options, command)
  }
}

async function empireOverview({ api, connection, shard }, options) {
  const me = await api.authMe()
  const [world, time, rooms, unread] = await Promise.all([
    api.userWorldStatus(), api.gameTime(shard), api.userRooms(me._id),
    api.userMessagesUnreadCount().catch(() => ({ count: 0 }))
  ])
  const attention = []
  if (world.status === 'empty') attention.push('Place your first spawn.')
  if (world.status === 'lost') attention.push('Your empire has no active spawn and can respawn.')
  if (unread.count) attention.push(`${unread.count} unread message${unread.count === 1 ? '' : 's'}.`)
  const result = {
    server: connection.url,
    shard: shard ?? null,
    tick: time.time,
    player: {
      id: me._id,
      username: me.username,
      cpu: me.cpu ?? null,
      gclProgress: me.gcl ?? 0,
      powerProcessed: me.power ?? 0,
      credits: me.money ?? 0
    },
    worldStatus: world.status,
    rooms: rooms.rooms || [],
    unreadMessages: unread.count || 0,
    attention
  }
  if (options.json) output(result, { json: true })
  else output(formatStatus(result))
}

async function roomSnapshot(api, room, options, ownUserId) {
  const [terrainResponse, objectResponse, timeResponse] = await Promise.all([
    api.gameRoomTerrain(room, options.shard),
    api.gameRoomObjects(room, options.shard),
    api.gameTime(options.shard)
  ])
  const terrain = decodeTerrain(terrainResponse)
  if (options.json) {
    return output({ room, tick: timeResponse.time, terrain, objects: objectResponse.objects, users: objectResponse.users || {} }, { json: true })
  }
  output(renderRoom({
    name: room,
    terrain,
    objects: objectResponse.objects,
    ownUserId,
    gameTime: timeResponse.time,
    color: Boolean(options.color && stdout.isTTY)
  }))
}

async function tileSnapshot(api, target, options, ownUserId) {
  const [terrainResponse, objectResponse, timeResponse] = await Promise.all([
    api.gameRoomTerrain(target.room, options.shard),
    api.gameRoomObjects(target.room, options.shard),
    api.gameTime(options.shard)
  ])
  const terrain = decodeTerrain(terrainResponse)
  const objects = objectResponse.objects.filter(object => object.x === target.x && object.y === target.y)
  if (options.json) {
    return output({ room: target.room, x: target.x, y: target.y, tick: timeResponse.time, terrain: terrain[target.y][target.x], objects }, { json: true })
  }
  output(renderTile({
    name: target.room,
    x: target.x,
    y: target.y,
    terrain,
    objects: objectResponse.objects,
    users: objectResponse.users,
    ownUserId
  }))
}

async function liveRoom(api, room, options, ownUserId) {
  const [terrainResponse, objectResponse, timeResponse] = await Promise.all([
    api.gameRoomTerrain(room, options.shard),
    api.gameRoomObjects(room, options.shard),
    api.gameTime(options.shard)
  ])
  const terrain = decodeTerrain(terrainResponse)
  const state = new Map(objectResponse.objects.map(object => [object._id, object]))
  let gameTime = timeResponse.time
  let visible = false
  const draw = () => {
    if (!visible) return
    const clear = '\x1b[H\x1b[2J'
    if ((stdout.columns && stdout.columns < 53) || (stdout.rows && stdout.rows < 55)) {
      stdout.write(`${clear}Resize this terminal to at least 53 columns by 55 rows.\nCurrent size: ${stdout.columns} by ${stdout.rows}.`)
      return
    }
    stdout.write(`${clear}${renderLiveRoomFrame({
      name: room,
      terrain,
      objects: [...state.values()],
      ownUserId,
      gameTime,
      color: options.color
    })}`)
  }
  const update = event => {
    gameTime = event.data.gameTime ?? gameTime
    mergeRoomObjects(state, event.data.objects)
    draw()
  }

  try {
    await api.socket.subscribeRoom(room, options.shard, update)
    await api.socket.connect()
  } catch {
    api.socket.disconnect()
    throw new Error('Live room view is unavailable. Run screeps login to refresh the live session.')
  }

  visible = true
  stdout.write('\x1b[?1049h\x1b[?25l')
  stdout.on('resize', draw)
  draw()
  try {
    await waitForInterrupt(api.socket)
  } finally {
    visible = false
    stdout.removeListener('resize', draw)
    stdout.write('\x1b[?25h\x1b[?1049l')
  }
}

function objectExpression(id) {
  return `(()=>{const o=Game.getObjectById(${JSON.stringify(id)});if(!o)return null;const type=o.structureType||(o.className?'power creep':o.body?'creep':o.mineralType?'mineral':o.depositType?'deposit':o.resourceType?'resource':o.level!=null&&o.progressTotal!=null?'controller':'object');return {id:o.id,type,name:o.name,pos:o.pos&&{room:o.pos.roomName,x:o.pos.x,y:o.pos.y},owner:o.owner?.username,hits:o.hits,hitsMax:o.hitsMax,level:o.level,progress:o.progress,progressTotal:o.progressTotal,ticksToLive:o.ticksToLive,fatigue:o.fatigue,store:o.store&&Object.fromEntries(Object.entries(o.store)),body:o.body?.map(p=>({type:p.type,hits:p.hits,boost:p.boost}))}})()`
}

const displayNumber = value => new Intl.NumberFormat('en').format(value)

async function objectSnapshot(api, id, options) {
  const object = await runGameExpression(api, objectExpression(id), options.shard)
  if (!object) throw new Error(`Object ${id} is not visible.`)
  if (options.silent) return object
  if (options.json) return output(object, { json: true })
  const lines = [`${object.type}${object.name ? ` ${object.name}` : ''}`]
  const identity = []
  if (object.pos) identity.push(`${object.pos.room} ${object.pos.x},${object.pos.y}`)
  if (object.owner) identity.push(object.owner)
  if (identity.length) lines.push(identity.join(' · '))
  const condition = []
  if (object.hits != null) condition.push(`${displayNumber(object.hits)}/${displayNumber(object.hitsMax)} hits`)
  if (object.store) condition.push(...Object.entries(object.store).map(([resource, amount]) => `${displayNumber(amount)} ${resource}`))
  if (object.level != null) condition.push(`level ${object.level}`)
  if (object.progress != null) condition.push(`${displayNumber(object.progress)}/${displayNumber(object.progressTotal)} progress`)
  if (object.ticksToLive != null) condition.push(`${displayNumber(object.ticksToLive)} ticks left`)
  if (condition.length) lines.push(condition.join(' · '))
  if (object.body?.length) lines.push(formatBody(object.body))
  output(lines.join('\n'))
  return object
}

async function playerSnapshot(api, player, options) {
  const [profileResult, controlResult, powerResult] = await Promise.allSettled([
    api.userFind(player), api.leaderboardFind(player, 'world'), api.leaderboardFind(player, 'power')
  ])
  if (profileResult.status === 'rejected' || !profileResult.value?.user) throw new Error(`Player @${player} was not found.`)
  const result = {
    player: profileResult.value.user,
    control: controlResult.status === 'fulfilled' ? controlResult.value : null,
    power: powerResult.status === 'fulfilled' ? powerResult.value : null
  }
  if (options.json) return output(result, { json: true })
  const user = result.player
  const details = []
  if (user.gcl != null) details.push(`GCL progress ${displayNumber(user.gcl)}`)
  if (result.control?.rank != null) details.push(`world rank ${displayNumber(result.control.rank)}`)
  if (user.power != null) details.push(`power ${displayNumber(user.power)}`)
  if (result.power?.rank != null) details.push(`power rank ${displayNumber(result.power.rank)}`)
  const lines = [`@${user.username}${details.length ? ` · ${details.join(' · ')}` : ''}`]
  output(lines.join('\n'))
}

async function inspectTarget(context, target, options) {
  if (target.kind === 'empire') return empireOverview(context, options)
  if (target.kind === 'player') return playerSnapshot(context.api, target.player, options)
  if (target.kind === 'object') return objectSnapshot(context.api, target.id, options)
  const me = await context.api.authMe()
  if (target.kind === 'tile') return tileSnapshot(context.api, target, options, me._id)
  if (stdout.isTTY && !options.json) return liveRoom(context.api, target.room, options, me._id)
  return roomSnapshot(context.api, target.room, options, me._id)
}

async function defaultRoom(api, explicit) {
  if (explicit) return roomName(explicit)
  const me = await api.authMe()
  const response = await api.userRooms(me._id)
  const room = response.rooms?.[0]
  if (!room) throw new Error('You have no room to use as a default.')
  return room
}

async function mapView(api, center, options) {
  const room = await defaultRoom(api, center)
  const radius = integer(options.radius, 'Radius', { min: 0, max: 20 })
  const rooms = roomsAround(room, radius)
  const response = await api.gameMapStats(rooms, 'owner0', options.shard)
  if (options.json) output({ center: room, radius, tick: response.gameTime ?? null, rooms: response.stats || {}, users: response.users || {} }, { json: true })
  else output(renderWorldMap(room, radius, response))
}

async function watchRooms(api, targets, options) {
  const rooms = []
  let targetId
  let targetPosition
  let targetLabel = 'your empire'
  let targetInfo = { kind: 'empire' }
  if (!targets.target) {
    const me = await api.authMe()
    rooms.push(...((await api.userRooms(me._id)).rooms || []))
  } else {
    const parsed = parseTarget(targets.target, targets.position)
    if (parsed.kind === 'room' || parsed.kind === 'tile') {
      rooms.push(parsed.room)
      targetLabel = parsed.room
      targetInfo = parsed
      if (parsed.kind === 'tile') {
        targetPosition = { x: parsed.x, y: parsed.y }
        targetLabel += ` ${parsed.x},${parsed.y}`
      }
    }
    else if (parsed.kind === 'object') {
      const object = await objectSnapshot(api, parsed.id, { ...options, silent: true })
      if (!object?.pos?.room) throw new Error(`Object ${parsed.id} has no room position.`)
      rooms.push(object.pos.room)
      targetId = parsed.id
      targetLabel = `${object.type}${object.name ? ` ${object.name}` : ''} in ${object.pos.room}`
      targetInfo = { kind: 'object', id: parsed.id, room: object.pos.room, type: object.type, name: object.name ?? null }
    } else throw new Error('Watch accepts an empire, room, tile, or object target.')
  }
  if (!rooms.length) throw new Error('There are no rooms to watch.')

  const states = new Map()
  const users = new Map()
  const ticks = new Map()
  for (const room of rooms) {
    const [objects, time] = await Promise.all([api.gameRoomObjects(room, options.shard), api.gameTime(options.shard)])
    states.set(room, new Map(objects.objects.map(object => [object._id, object])))
    users.set(room, { ...(objects.users || {}) })
    ticks.set(room, time.time)
  }

  const announce = event => {
    if (options.json) output({ type: 'event', ...event }, { ndjson: true })
    else output(`${displayNumber(event.tick)}  ${rooms.length > 1 ? `${event.room}  ` : ''}${event.message}`)
  }
  if (options.json) {
    for (const room of rooms) output({ type: 'start', tick: ticks.get(room), room, target: targetInfo }, { ndjson: true })
  } else if (rooms.length === 1) {
    const label = targets.target ? targetLabel : `${targetLabel} in ${rooms[0]}`
    output(`Watching ${label} from tick ${displayNumber(ticks.get(rooms[0]))}.`)
  } else {
    output(`Watching ${targetLabel} across ${rooms.length} rooms. Press Ctrl-C to stop.`)
  }

  try {
    for (const room of rooms) {
      await api.socket.subscribeRoom(room, options.shard, event => {
        const tick = event.data.gameTime ?? ticks.get(room)
        ticks.set(room, tick)
        if (options.raw) {
          if (options.json) output({ type: 'patch', tick, room, data: event.data }, { ndjson: true })
          else output(`${tick}  ${room}  ${JSON.stringify(event.data)}`)
          mergeRoomObjects(states.get(room), event.data.objects)
          return
        }
        Object.assign(users.get(room), event.data.users || {})
        const lines = describeRoomChanges(states.get(room), event.data.objects, users.get(room), { verbose: options.verbose, targetId, targetPosition })
        for (const message of lines) announce({ tick, room, message })
      })
    }
    await api.socket.connect()
  } catch {
    api.socket.disconnect()
    throw new Error('Live room updates are unavailable. Run screeps login to refresh the live session.')
  }
  await waitForInterrupt(api.socket)
}

function formatCodeDiff(diff) {
  const lines = []
  for (const name of diff.added) lines.push(`+ ${name}`)
  for (const name of diff.changed) lines.push(`~ ${name}`)
  for (const name of diff.removed) lines.push(`- ${name}`)
  return lines.length ? lines.join('\n') : 'Local and deployed code match.'
}

async function codeDiff(api, directory, options) {
  const [local, remote] = await Promise.all([readModules(directory), api.userCodeGet(options.branch)])
  const diff = compareModules(local, remote.modules)
  if (options.json) output({ directory, branch: options.branch, ...diff }, { json: true })
  else output(formatCodeDiff(diff))
}

async function liveConsole(api, expression, options) {
  await api.socket.subscribeUserConsole(event => {
    if (options.json) return output(event.data, { ndjson: true })
    const shard = event.data.shard ? `[${event.data.shard}] ` : ''
    if (event.data.error) stderr.write(`${shard}${event.data.error}\n`)
    for (const line of event.data.messages?.log || []) output(`${shard}${line}`)
    for (const result of event.data.messages?.results || []) output(`${shard}< ${result}`)
  })
  try {
    await api.socket.connect()
    if (expression) await api.userConsole(expression, options.shard)
  } catch {
    api.socket.disconnect()
    throw new Error('Live console authentication failed. Run screeps login to refresh the session.')
  }
  await waitForInterrupt(api.socket)
}

async function docsView(manifest, topic, options) {
  if (options.search !== undefined) {
    if (topic) throw new Error('Choose a topic or --search, not both.')
    if (!options.search) throw new Error('Documentation search pattern cannot be empty.')
    const pattern = compileDocsPattern(options.search)
    const pages = await Promise.all(manifest.pages.map(async page => {
      const markdown = searchMarkdown(await readDocsPage(page.file), pattern)
      return { topic: page.command, title: page.title, markdown }
    }))
    const matches = pages.filter(page => page.markdown)
    if (options.json) output({ pattern: options.search, matches }, { json: true })
    else if (matches.length) output(matches.map(page => page.markdown.trimEnd()).join('\n\n---\n\n'))
    else output(`No documentation matched ${JSON.stringify(options.search)}.`)
    return
  }

  if (!topic) {
    const landing = {
      read: 'screeps docs creeps',
      search: "screeps docs --search 'tower|rampart'",
      topics: 'screeps docs --help'
    }
    const metadata = {
      offline: true,
      builtAt: manifest.builtAt,
      revision: manifest.revision,
      officialDocs: manifest.site
    }
    if (options.json) output({ ...metadata, ...landing }, { json: true })
    else output([
      `Offline docs built ${manifest.builtAt} · screeps/docs ${manifest.revision.slice(0, 7)}`,
      `Official docs: ${manifest.site}`,
      '',
      `Read a guide:    ${landing.read}`,
      `Search the docs: ${landing.search}`,
      `List all topics: ${landing.topics}`
    ].join('\n'))
    return
  }
  const exact = manifest.pages.find(page => page.command === topic.toLowerCase())
  if (!exact) throw new Error(`Unknown documentation topic ${JSON.stringify(topic)}. Run screeps docs --help or use --search <pattern>.`)
  const markdown = await readDocsPage(exact.file)
  if (options.json) return output({ topic: exact.command, title: exact.title, markdown }, { json: true })
  stdout.write(markdown)
}

function powerExpression(name) {
  const selected = name ? `[[${JSON.stringify(name)},Game.powerCreeps[${JSON.stringify(name)}]]]` : 'Object.entries(Game.powerCreeps)'
  return `Object.fromEntries(${selected}.filter(([,c])=>c).map(([name,c])=>[name,{name,className:c.className,level:c.level,hits:c.hits,hitsMax:c.hitsMax,ticksToLive:c.ticksToLive,shard:c.shard,pos:c.pos&&{room:c.pos.roomName,x:c.pos.x,y:c.pos.y},powers:c.powers,deleteTime:c.deleteTime,spawnCooldownTime:c.spawnCooldownTime}]))`
}

async function powerView(api, name, options) {
  const result = await runGameExpression(api, powerExpression(name), options.shard)
  if (name && !result?.[name]) throw new Error(`Power creep "${name}" was not found.`)
  if (options.json) return output(result, { json: true })
  const entries = Object.values(result || {})
  if (!entries.length) return output('You have no power creeps.')
  output(entries.map(creep => {
    const location = creep.pos ? `${creep.pos.room} ${creep.pos.x},${creep.pos.y}` : 'not spawned'
    const powers = Object.entries(creep.powers || {}).map(([power, value]) => `${power} ${value.level}`).join(', ') || 'none'
    return `${creep.name} · ${creep.className} level ${creep.level} · ${location}\n  Powers: ${powers}`
  }).join('\n'))
}

export async function run(program, argv) {
  const docsManifest = await readDocsManifest()
  program
    .name('screeps')
    .description('Screeps — program a world that never stops.')
    .version(formatVersion(), '-V, --version', 'show version and compatibility information')
    .argument('[target]')
    .argument('[position]')
    .option('--server <name>', 'use a remembered server')
    .option('--shard <name>', 'use a world shard')
    .option('-j, --json', 'emit stable JSON; streams use NDJSON')
    .option('--no-color', 'disable terminal color')
    .showSuggestionAfterError()
    .action(async (target, position, options) => {
      const parsed = parseTarget(target, position)
      const context = await createClient(options)
      await inspectTarget(context, parsed, options)
    })
  program.helpInformation = () => `${TOP_HELP}\n`

  program.command('map [room]')
    .description('explore the world around a room')
    .option('--radius <rooms>', 'number of rooms in each direction', '5')
    .action(withClient(async ({ api }, room, options) => mapView(api, room, options)))

  program.command('watch [target] [position]')
    .description('stream meaningful events as plain text')
    .usage('[options] [target] [x,y]')
    .option('-v, --verbose', 'include movement, stores, repairs, and progress')
    .option('--raw', 'emit every received room patch')
    .action(withClient(async ({ api }, target, position, options) => watchRooms(api, { target, position }, options)))

  const code = program.command('code [directory]')
    .description('inspect and synchronize game code')
    .usage('[options] [directory]')
    .option('-b, --branch <name>', 'game code branch', 'default')
    .action(withClient(async ({ api }, directory = 'bot', options) => codeDiff(api, directory, options)))
  code.command('pull [directory]')
    .description('download deployed modules')
    .action(withClient(async ({ api }, directory = 'bot', options) => {
      const response = await api.userCodeGet(options.branch)
      const paths = await writeModules(directory, response.modules)
      if (options.json) output({ directory, branch: options.branch, modules: paths.length }, { json: true })
      else output(`Wrote ${paths.length} modules from ${options.branch} to ${directory}.`)
    }))
  code.command('push [directory]')
    .description('deploy local modules')
    .action(withClient(async ({ api }, directory = 'bot', options) => {
      const modules = await readModules(directory)
      await api.userCodeSet({ branch: options.branch, modules })
      if (options.json) output({ directory, branch: options.branch, modules: Object.keys(modules).length }, { json: true })
      else output(`Deployed ${Object.keys(modules).length} modules from ${directory} to ${options.branch}.`)
    }))
  code.command('branches')
    .description('list code branches and their active state')
    .action(withClient(async ({ api }, options) => {
      const response = await api.userBranches()
      const branches = (response.list || []).map(branch => ({
        name: branch.branch,
        activeWorld: Boolean(branch.activeWorld),
        activeSimulation: Boolean(branch.activeSim)
      }))
      if (options.json) output(branches, { json: true })
      else output(branches.map(branch => `${branch.activeWorld ? '*' : ' '} ${branch.name}${branch.activeSimulation ? ' · simulation' : ''}`).join('\n') || 'No code branches.')
    }))
  code.command('use <branch>')
    .description('activate a branch in the persistent world')
    .action(withClient(async ({ api }, branch, options) => {
      await api.userSetActiveBranch(branch, 'activeWorld')
      if (options.json) output({ branch, activeWorld: true }, { json: true })
      else output(`Activated code branch ${branch}.`)
    }))

  program.command('console [javascript]')
    .description('evaluate JavaScript or open a live console')
    .option('-f, --follow', 'keep streaming after evaluating JavaScript')
    .action(withClient(async ({ api }, expression, options) => {
      if (expression && !options.follow) {
        const result = await runGameExpression(api, expression, options.shard)
        return output(result === undefined ? null : result, options)
      }
      await liveConsole(api, expression, options)
    }))

  const memory = program.command('memory [path]')
    .description('inspect or edit persistent Memory')
    .usage('[path]')
    .action(withClient(async ({ api }, path, options) => {
      const response = await api.userMemoryGet(path, options.shard)
      output(response.data ?? null, options)
    }))
  memory.command('set <path> <value>')
    .description('set JSON or string data at a Memory path')
    .action(withClient(async ({ api }, path, value, options) => {
      const parsed = parseValue(value)
      await api.userMemorySet(path, parsed, options.shard)
      if (options.json) output({ path, value: parsed }, { json: true })
      else output(`Set Memory.${path}.`)
    }))

  const market = program.command('market [resource]')
    .description('browse prices, trade, and manage orders')
    .usage('[resource]')
    .action(withClient(async ({ api }, resource, options) => {
      if (resource) {
        const response = await api.gameMarketOrders(resource, options.shard)
        if (options.json) output({ resource, orders: response.list || [], users: response.users || {} }, { json: true })
        else output(formatMarketOrders(response, resource))
        return
      }
      const [me, orders] = await Promise.all([api.authMe(), api.gameMarketMyOrders()])
      const result = { credits: me.money || 0, orders: orders.list || [] }
      if (options.json) output(result, { json: true })
      else output(`${displayNumber(result.credits)} credits\n${formatMyOrders(orders)}`)
    }))
  market.command('history [page]')
    .description('show your transaction history')
    .action(withClient(async ({ api }, page, options) => {
      const response = await api.userMoneyHistory(page == null ? 0 : pageNumber(page))
      if (options.json) output({ page: page == null ? 0 : pageNumber(page), transactions: response.list || [] }, { json: true })
      else output(formatMarketHistory(response))
    }))
  for (const type of ['buy', 'sell']) {
    market.command(`${type} <resource> <amount>`)
      .description(`create a ${type} order`)
      .requiredOption('--price <credits>', 'credits per unit')
      .requiredOption('--from <room>', 'terminal room')
      .action(withClient(async ({ api }, resource, amount, options) => {
        const totalAmount = integer(amount, 'Amount', { min: 1 })
        const price = positiveNumber(options.price, 'Price')
        const room = roomName(options.from)
        const order = { type, resourceType: resource, price, totalAmount, roomName: room }
        await submitGameAction(api, `Game.market.createOrder(${JSON.stringify(order)})`, options.shard,
          `Created a ${type} order for ${totalAmount} ${resource} at ${price} credits in ${room}.`, options)
      }))
  }
  market.command('deal <order> <amount>')
    .description('accept an existing order')
    .requiredOption('--from <room>', 'terminal room paying the transaction cost')
    .action(withClient(async ({ api }, order, amount, options) => {
      const quantity = integer(amount, 'Amount', { min: 1 })
      const room = roomName(options.from)
      const args = [order, quantity, room].map(JSON.stringify).join(',')
      await submitGameAction(api, `Game.market.deal(${args})`, options.shard,
        `Completed ${quantity} units of order ${order} through ${room}.`, options)
    }))
  market.command('price <order> <credits>')
    .description('change an order price')
    .action(withClient(async ({ api }, order, credits, options) => {
      const price = positiveNumber(credits, 'Price')
      await submitGameAction(api, `Game.market.changeOrderPrice(${JSON.stringify(order)},${price})`, options.shard,
        `Changed order ${order} to ${price} credits per unit.`, options)
    }))
  market.command('extend <order> <amount>')
    .description('add volume to an order')
    .action(withClient(async ({ api }, order, amount, options) => {
      const quantity = integer(amount, 'Amount', { min: 1 })
      await submitGameAction(api, `Game.market.extendOrder(${JSON.stringify(order)},${quantity})`, options.shard,
        `Added ${quantity} units to order ${order}.`, options)
    }))
  market.command('cancel <order>')
    .description('cancel an order')
    .action(withClient(async ({ api }, order, options) => submitGameAction(api,
      `Game.market.cancelOrder(${JSON.stringify(order)})`, options.shard, `Cancelled order ${order}.`, options)))

  const power = program.command('power [creep]')
    .description('inspect and develop power creeps')
    .usage('[creep]')
    .action(withClient(async ({ api }, name, options) => powerView(api, name, options)))
  power.command('create <name>')
    .description('create an operator')
    .action(withClient(async ({ api }, name, options) => submitGameAction(api,
      `PowerCreep.create(${JSON.stringify(name)},'operator')`, options.shard, `Created power creep ${name}.`, options)))
  power.command('upgrade <name> <power>')
    .description('upgrade a power such as PWR_GENERATE_OPS')
    .action(withClient(async ({ api }, name, powerName, options) => {
      if (!/^PWR_[A-Z_]+$/.test(powerName)) throw new Error('Power must look like PWR_GENERATE_OPS.')
      await submitGameAction(api, `Game.powerCreeps[${JSON.stringify(name)}].upgrade(${powerName})`, options.shard,
        `Upgraded ${powerName} on ${name}.`, options)
    }))
  power.command('delete <name>')
    .description('schedule a power creep for deletion')
    .action(withClient(async ({ api }, name, options) => submitGameAction(api,
      `PowerCreep.delete(${JSON.stringify(name)})`, options.shard, `Scheduled ${name} for deletion.`, options)))
  power.command('cancel-delete <name>')
    .description('cancel scheduled deletion')
    .action(withClient(async ({ api }, name, options) => submitGameAction(api,
      `PowerCreep.cancelDelete(${JSON.stringify(name)})`, options.shard, `Cancelled deletion of ${name}.`, options)))

  const messages = program.command('messages [player]')
    .description('read conversations or message a player')
    .usage('[@player]')
    .action(withClient(async ({ api }, player, options) => {
      const response = player ? await api.userMessagesList(playerName(player)) : await api.userMessagesIndex()
      if (options.json) output({ player: player ? playerName(player) : null, messages: response.messages || [], users: response.users || {} }, { json: true })
      else output(formatMessages(response, player ? playerName(player) : undefined))
    }))
  messages.command('send <@player> <text>')
    .description('send a message to @player')
    .action(withClient(async ({ api }, player, text, options) => {
      const username = playerName(player)
      const response = await api.userMessagesSend(username, text)
      if (response?.error || response?.ok === 0) throw new Error(response.error || 'The game rejected the message.')
      if (options.json) output({ player: username, sent: true }, { json: true })
      else output(`Sent message to @${username}.`)
    }))

  program.command('docs [topic]')
    .description('read or search the game documentation')
    .option('-s, --search <pattern>', 'search every guide with a case-insensitive regular expression')
    .addHelpText('after', `\nTopics:\n${docsManifest.pages.map(page => `  ${page.command.padEnd(22)} ${page.title}`).join('\n')}`)
    .action(async (topic, _options, command) => docsView(docsManifest, topic, inheritedOptions(command)))

  program.command('login [server]')
    .description('connect and remember a Screeps server')
    .action(async (server, _options, command) => {
      const options = connectionOptions(command)
      const config = await readConfig()
      const selected = server || options.server || config.current || 'https://screeps.com'
      const result = await login({ server: selected, shard: options.shard, onDesktopRequired: promptForDesktopLogin })
      if (options.json) output({ username: result.username, server: normalizeUrl(selected) }, { json: true })
      else {
        output(`Authenticated as ${result.username} on ${normalizeUrl(selected)}. This server is now active.`)
        if (result.passwordCreated) output('Enabled durable live login for this account.')
      }
    })

  program.command('logout [server]')
    .description('remove a remembered login')
    .action(async (server, _options, command) => {
      const options = connectionOptions(command)
      const url = await forgetServer(server || options.server)
      if (options.json) output({ server: url, forgotten: true }, { json: true })
      else output(`Forgot the login for ${url}.`)
    })

  program.command('raw <method> <path> [params]', { hidden: true })
    .description('call a Screeps endpoint')
    .action(withClient(async ({ api }, method, path, params, options) => {
      const endpoint = path.startsWith('/api/') ? path : `/api/${path.replace(/^\//, '')}`
      output(await api.req(method.toUpperCase(), endpoint, parseValue(params) || {}), options)
    }))

  await program.parseAsync(argv)
}
