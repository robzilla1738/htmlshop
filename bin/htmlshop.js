#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs'
import { cp, mkdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from '../src/server.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(__dirname, '..')
const DEFAULT_ROOT = join(homedir(), 'htmlshop', 'projects')
const SKILL_DIR = join(homedir(), '.claude', 'skills', 'htmlshop')
const LEGACY_PLUGIN_DIR = join(homedir(), '.claude', 'plugins', 'htmlshop')

const args = process.argv.slice(2)
const cmd = args[0]

if (cmd === 'install') {
  await installSkill()
  process.exit(0)
} else if (cmd === 'uninstall') {
  await uninstallSkill()
  process.exit(0)
} else if (cmd === 'init') {
  await initProjectRule()
  process.exit(0)
} else if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
  printHelp()
  process.exit(0)
} else if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
  const pkg = await import('../package.json', { with: { type: 'json' } })
  console.log(pkg.default.version)
  process.exit(0)
} else {
  await runEditor(cmd)
}

async function runEditor(pathArg) {
  let root
  if (pathArg) {
    root = resolve(pathArg)
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
}

async function installSkill() {
  // Clean up any old plugin-style install from earlier versions.
  if (existsSync(LEGACY_PLUGIN_DIR)) {
    await rm(LEGACY_PLUGIN_DIR, { recursive: true, force: true })
  }

  await mkdir(SKILL_DIR, { recursive: true })
  await cp(
    join(PKG_ROOT, 'skills', 'htmlshop', 'SKILL.md'),
    join(SKILL_DIR, 'SKILL.md'),
    { force: true }
  )

  console.log('')
  console.log('  htmlshop skill installed')
  console.log(`  → ${join(SKILL_DIR, 'SKILL.md')}`)
  console.log('')
  console.log('  Next:')
  console.log('    1. Restart Claude Code (or run /reload-plugins).')
  console.log('    2. Try: /htmlshop make a 1080x1080 Instagram post about X')
  console.log('')
  console.log('  Cursor users: run `npx htmlshop init` in a project,')
  console.log('  or paste SKILL.md contents into Settings → Rules → User Rules.')
  console.log('')
}

async function initProjectRule() {
  const cwd = process.cwd()
  const cursorRulesDir = join(cwd, '.cursor', 'rules')
  await mkdir(cursorRulesDir, { recursive: true })
  await cp(
    join(PKG_ROOT, 'skills', 'htmlshop', 'SKILL.md'),
    join(cursorRulesDir, 'htmlshop.mdc'),
    { force: true }
  )
  console.log('')
  console.log(`  htmlshop rule added to ${cursorRulesDir}/htmlshop.mdc`)
  console.log('')
  console.log('  Cursor will pick it up automatically on next chat in this project.')
  console.log('  Try: "make a 1080x1080 Instagram post about X using htmlshop"')
  console.log('')
}

async function uninstallSkill() {
  let removed = false
  for (const dir of [SKILL_DIR, LEGACY_PLUGIN_DIR]) {
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true })
      console.log(`  Removed ${dir}`)
      removed = true
    }
  }
  if (!removed) console.log('  Nothing to remove.')
}

function printHelp() {
  console.log(`
  htmlshop — visual editor for HTML design files

  Usage:
    htmlshop                  Open the editor on ~/htmlshop/projects/
    htmlshop <folder>         Open the editor on a specific folder
    htmlshop install          Install as a Claude Code skill (global)
    htmlshop init             Add Cursor rule to the current project
    htmlshop uninstall        Remove the Claude Code skill
    htmlshop version          Print version
    htmlshop help             This message

  Environment:
    PORT                      Override the local server port (default 5178)
`)
}
