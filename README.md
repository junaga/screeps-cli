# Screeps CLI

```text
$ screeps --help

Screeps — program a world that never stops.

Usage:
  screeps [target] [options]
  screeps <command> [arguments]

Inspect a target:
  screeps                       your interactive empire overview
  screeps W8N3                  an interactive live room
  screeps W8N3:24,18            a tile and everything on it
  screeps <object-id>            a visible game object
  screeps @player               another player

World:
  map [room]                    explore the world around a room
  watch [target]                stream changes as plain text
  notifications                read notices sent by your code

Programming:
  code [diff|pull|push] [dir]   compare or synchronize game code
  console [javascript]          evaluate JavaScript or open a live console
  memory [path]                 inspect or edit persistent Memory

Game:
  market [resource]             browse prices, trade, and manage orders
  power                         manage power creeps and their powers
  messages [player]             read conversations or message a player

Reference:
  docs [topic...]               search or read the game documentation

Connection:
  login [server]                connect and remember a Screeps server
  logout [server]               remove a remembered login

Options:
  -S, --server <name>           use a remembered server
  -s, --shard <name>            use a world shard
  -r, --room <name>             use a room when a command needs one
  -j, --json                    emit stable machine-readable output
      --no-color                disable terminal color
  -h, --help                    show help for any command
  -V, --version                 show version and compatibility information

Commands without arguments open their useful default view. Detailed help lives
one level down: `screeps <command> --help`.

Examples:
  screeps
  screeps W8N3
  screeps watch W8N3
  screeps code push ./dist
  screeps console 'Game.cpu.bucket'
  screeps market energy
  screeps docs tower falloff
```
