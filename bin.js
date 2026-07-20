#!/usr/bin/env node

import { Command } from 'commander'
import { run } from './src/cli.js'

const program = new Command()

try {
  await run(program, process.argv)
} catch (error) {
  const message = error?.response?.data?.error ?? error?.message ?? String(error)
  process.stderr.write(`Error: ${message}\n`)
  if (process.env.SCREEPS_DEBUG) console.error(error)
  process.exitCode = 1
}
