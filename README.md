# Screeps CLI

```text
$ screeps --help

Screeps — program a world that never stops.

Usage:
  screeps [target]
  screeps <room> <x,y>
  screeps <command> [arguments]

Targets:
  (none)                        your empire
  W8N3                          a room
  W8N3 24,18                    a tile
  <object-id>                   a game object
  @player                       a player

Commands:
  map [room]                    explore the world around a room
  watch [target]                follow meaningful changes
  code [dir]                    manage game code
  console [javascript]          run JavaScript
  memory [path]                 inspect or edit Memory
  market [resource]             trade and manage orders
  power [creep]                 manage power creeps
  messages [@player]            read or send messages
  docs [topic]                  read the game documentation
  login [server]                connect to a server
  logout [server]               forget a server

Options:
      --server <name>           choose a server
      --shard <name>            choose a shard
  -j, --json                    output JSON
      --no-color                disable terminal color
  -h, --help                    show help
  -V, --version                 show version information

Run screeps <command> --help for actions and examples.
```
