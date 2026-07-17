# Screeps Terminal

A terminal-first client for Screeps World. It talks to the same structured HTTP and WebSocket APIs as the graphical client and renders rooms as 50×50 text maps.

## Install

Requires Node.js 20 or newer.

```bash
npm install
npm link
screeps --help
```

## Authentication

Screeps does not provide OAuth for terminal applications. Authentication uses a persistent player token.

For normal use, one command is enough:

```bash
screeps login arma.npcs.games:21025
```

You only need to log in once per server. Normal commands use the active saved server. When no token exists, `login` can import an active Steam-authenticated Screeps desktop session and exchange it for a dedicated persistent API token. For that one-time bootstrap, open Screeps, connect to the private server, and leave it running while invoking `login`.

For an official-server token or a token copied from another machine:

```bash
export SCREEPS_TOKEN='…'
screeps --shard shard3 login screeps.com --name main
unset SCREEPS_TOKEN
```

Credentials are stored outside the project in `~/.config/screeps-cli/config.json` with mode `0600`. Logging into another URL switches the active server; logging into a known URL reuses its saved token. Use `SCREEPS_CLI_CONFIG` to choose another credential file or `SCREEPS_CLIENT_DATA` for a nonstandard Screeps client location.

## Play

```bash
screeps server
screeps status
screeps rooms
screeps map W1N1 6
screeps room W1N1
screeps room W1N1 --watch
screeps console --follow
screeps console 'Game.creeps.Worker1.move(TOP)'
screeps memory get rooms.W1N1
screeps code pull bot
screeps code push bot
screeps construct W1N1 20 21 extension
screeps flag create W1N1 20 21 rally
```

Use `--json` for scripting. Global options may be set before subcommands:

```bash
screeps --shard shard0 --json status
```

The normal way to play Screeps remains deploying a `module.exports.loop` program. The console command is useful for inspection and one-tick manual intents. `screeps raw` exposes endpoints that do not yet have a friendly command.

## World data

Terrain arrives as 2,500 cells per room (`0` plain, `1` wall, `2` swamp). Room objects are records with IDs, types, coordinates, ownership, stores, health, creep bodies, controller state, and other type-specific properties. WebSocket room subscriptions send a complete initial object set followed by per-tick patches. The CLI merges those patches before redrawing.

The server intentionally does not send every object in every room at once. World-map summaries and visible room data preserve the game’s normal visibility and information rules.
