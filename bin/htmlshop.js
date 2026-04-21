#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { startServer } from '../src/server.js'

const DEFAULT_ROOT = join(homedir(), 'htmlshop', 'projects')

const arg = process.argv[2]
let root

if (arg) {
  root = resolve(arg)
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`htmlshop: "${root}" is not a directory`)
    process.exit(1)
  }
} else {
  root = DEFAULT_ROOT
  await mkdir(root, { recursive: true })
}

const port = Number(process.env.PORT) || 5178
startServer({ root, port })
