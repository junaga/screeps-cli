# Screeps

A calm, complete terminal client for programming and playing Screeps.

```text
$ screeps --help

Usage: screeps [options] [command]

Play and program a persistent Screeps world.

Commands:
  play [room]                 open the interactive game client
  status                      see what needs your attention
  map [room]                  explore the world around a room
  room [room]                 inspect a room, tile, or game object
  watch [room]                follow meaningful room activity
  code [pull|push|diff] [dir] sync your local game code
  console [expression]        run JavaScript or open a live console
  memory [path] [value]       inspect or change persistent Memory
  market [resource]           browse, trade, and manage orders
  mail [player] [message]     read or send player messages
  docs [topic]                search or read the game guide
  login [server]              connect to a world
  logout                      forget the current credentials
  use [server|shard|room]     show or change the current context

Options:
  -r, --room <name>           use this room
  -s, --shard <name>          use this shard
  -S, --server <name>         use this server
      --json                  print stable machine-readable output
      --no-color              disable terminal color
  -h, --help                  show help for any command
  -V, --version               show client and game versions

Run a command without arguments for its natural default view.
Run `screeps <command> --help` for its actions and examples.

Examples:
  screeps play
  screeps status
  screeps map W8N3
  screeps code push
  screeps console 'Game.cpu.bucket'
  screeps memory colonies.W8N3
  screeps market energy
  screeps docs defending
```
