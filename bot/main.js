const ROLE_TARGETS = {
  1: { harvester: 2, upgrader: 2 },
  2: { harvester: 2, builder: 2, upgrader: 2 }
}

const EXTENSION_OFFSETS = [
  [-2, -1], [-2, 0], [-2, 1], [-1, -2], [0, -2]
]

function targetCounts(room) {
  return ROLE_TARGETS[Math.min(room.controller.level, 2)]
}

function creepsForRoom(room) {
  return Object.values(Game.creeps).filter(creep => creep.memory.home === room.name)
}

function spawnNext(room, creeps) {
  const spawn = room.find(FIND_MY_SPAWNS)[0]
  if (!spawn || spawn.spawning) return

  const counts = _.countBy(creeps, creep => creep.memory.role)
  const role = Object.entries(targetCounts(room))
    .find(([name, wanted]) => (counts[name] || 0) < wanted)?.[0]
  if (!role) return

  // This body can bootstrap from the 300 energy available in a new spawn and
  // recovers cheaply if the whole colony ever dies.
  const body = [WORK, CARRY, MOVE]
  if (room.energyAvailable < 200) return

  const serial = Memory.colony.serial = (Memory.colony.serial || 0) + 1
  spawn.spawnCreep(body, `${role}-${Game.time}-${serial}`, {
    memory: { role, home: room.name, working: false }
  })
}

function updateWorkingState(creep) {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
    creep.memory.working = false
  } else if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
    creep.memory.working = true
  }
}

function moveTo(creep, target) {
  creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 10 })
}

function harvest(creep) {
  const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE)
  if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) moveTo(creep, source)
}

function fillEnergy(creep) {
  const target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
    filter: structure =>
      (structure.structureType === STRUCTURE_SPAWN ||
       structure.structureType === STRUCTURE_EXTENSION ||
       structure.structureType === STRUCTURE_TOWER) &&
      structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
  })
  if (!target) return false
  if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) moveTo(creep, target)
  return true
}

function build(creep) {
  const site = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES)
  if (!site) return false
  if (creep.build(site) === ERR_NOT_IN_RANGE) moveTo(creep, site)
  return true
}

function upgrade(creep) {
  const controller = creep.room.controller
  if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) moveTo(creep, controller)
}

function runCreep(creep) {
  updateWorkingState(creep)
  if (!creep.memory.working) return harvest(creep)

  if (creep.memory.role === 'harvester' && fillEnergy(creep)) return
  if (creep.memory.role === 'builder' && build(creep)) return
  upgrade(creep)
}

function planExtensions(room) {
  if (room.controller.level < 2) return
  const spawn = room.find(FIND_MY_SPAWNS)[0]
  if (!spawn) return

  const existing = room.find(FIND_MY_STRUCTURES, {
    filter: structure => structure.structureType === STRUCTURE_EXTENSION
  }).length
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: site => site.structureType === STRUCTURE_EXTENSION
  }).length
  let remaining = Math.max(0, 5 - existing - sites)

  for (const [dx, dy] of EXTENSION_OFFSETS) {
    if (!remaining) break
    const result = room.createConstructionSite(spawn.pos.x + dx, spawn.pos.y + dy, STRUCTURE_EXTENSION)
    if (result === OK) remaining--
  }
}

function recordTelemetry(room, creeps) {
  Memory.colony.status = {
    tick: Game.time,
    room: room.name,
    level: room.controller.level,
    progress: room.controller.progress,
    progressTotal: room.controller.progressTotal,
    energy: room.energyAvailable,
    capacity: room.energyCapacityAvailable,
    creeps: _.countBy(creeps, creep => creep.memory.role)
  }
}

module.exports.loop = function () {
  Memory.colony ||= { serial: 0 }
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) delete Memory.creeps[name]
  }

  const room = Object.values(Game.rooms).find(candidate => candidate.controller?.my)
  if (!room) return

  const creeps = creepsForRoom(room)
  planExtensions(room)
  spawnNext(room, creeps)
  for (const creep of creeps) runCreep(creep)
  recordTelemetry(room, creeps)
}
