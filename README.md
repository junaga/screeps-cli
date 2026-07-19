# Screeps CLI

```text
$ screeps --help

Screeps — program a world that never stops.

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
  docs [topic...]               search or read the game documentation

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

Views are interactive in a terminal and become one-shot snapshots when piped.
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
  screeps docs tower falloff
```
