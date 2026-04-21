#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs'
import { access, cp, mkdir, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from '../src/server.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(__dirname, '..')
const DEFAULT_ROOT = join(homedir(), 'htmlshop', 'projects')
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 5178
const PORT_RETRIES = 20

const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex')
const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
const SKILL_SOURCE = join(PKG_ROOT, 'skills', 'htmlshop', 'SKILL.md')
const WELCOME_SOURCE = join(PKG_ROOT, 'src', 'templates', 'welcome.html')

const args = process.argv.slice(2)
const cmd = args[0]

try {
  if (cmd === 'install') {
    await installSkill(args[1] || 'all')
  } else if (cmd === 'uninstall') {
    await uninstallSkill(args[1] || 'all')
  } else if (cmd === 'init') {
    await initProjectRule()
  } else if (cmd === 'doctor') {
    await doctor()
  } else if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp()
  } else if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
    const pkg = await readPackage()
    console.log(pkg.version)
  } else {
    await runEditor(args)
  }
} catch (err) {
  console.error(`htmlshop: ${err.message}`)
  process.exit(1)
}

async function runEditor(rawArgs) {
  const opts = parseRunArgs(rawArgs)
  let root
  if (opts.path) {
    root = resolve(opts.path)
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      throw new Error(`"${root}" is not a directory`)
    }
  } else {
    root = DEFAULT_ROOT
    await mkdir(root, { recursive: true })
    await ensureWelcomeDesign(root)
  }

  const explicitPort = opts.portExplicit || Boolean(process.env.PORT)
  const port = await choosePort({
    host: opts.host,
    requestedPort: opts.port,
    canRetry: !explicitPort
  })

  await startServer({ root, host: opts.host, port, open: !opts.noOpen })
}

function parseRunArgs(rawArgs) {
  const opts = {
    host: process.env.HOST || DEFAULT_HOST,
    port: Number(process.env.PORT) || DEFAULT_PORT,
    portExplicit: false,
    noOpen: false,
    path: ''
  }

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i]
    if (arg === '--no-open') {
      opts.noOpen = true
    } else if (arg === '--host') {
      const value = rawArgs[++i]
      if (!value) throw new Error('--host requires a value')
      opts.host = value
    } else if (arg.startsWith('--host=')) {
      opts.host = arg.slice('--host='.length)
    } else if (arg === '--port') {
      const value = rawArgs[++i]
      if (!value) throw new Error('--port requires a value')
      opts.port = parsePort(value)
      opts.portExplicit = true
    } else if (arg.startsWith('--port=')) {
      opts.port = parsePort(arg.slice('--port='.length))
      opts.portExplicit = true
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option "${arg}"`)
    } else if (!opts.path) {
      opts.path = arg
    } else {
      throw new Error(`unexpected argument "${arg}"`)
    }
  }
  return opts
}

function parsePort(value) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid port "${value}"`)
  }
  return port
}

async function choosePort({ host, requestedPort, canRetry }) {
  const first = parsePort(String(requestedPort))
  const attempts = canRetry ? PORT_RETRIES : 1
  for (let offset = 0; offset < attempts; offset++) {
    const port = first + offset
    if (port > 65535) break
    if (await isPortFree(host, port)) return port
  }
  if (canRetry) {
    throw new Error(`no free port found from ${first} to ${first + attempts - 1}`)
  }
  throw new Error(`port ${first} is already in use on ${host}`)
}

function isPortFree(host, port) {
  return new Promise((resolveFree) => {
    const tester = createServer()
    tester.once('error', () => resolveFree(false))
    tester.once('listening', () => {
      tester.close(() => resolveFree(true))
    })
    tester.listen(port, host)
  })
}

async function ensureWelcomeDesign(root) {
  if (!existsSync(WELCOME_SOURCE)) return
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const hasVisibleContent = entries.some((entry) => {
    if (entry.name.startsWith('.')) return false
    if (entry.name === 'assets') return false
    return true
  })
  if (hasVisibleContent) return
  await cp(WELCOME_SOURCE, join(root, 'welcome.html'), { force: false })
}

async function installSkill(target) {
  const targets = normalizeTargets(target)
  for (const t of targets) {
    const dir = skillDirFor(t)
    await cleanupLegacyInstalls(t)
    await mkdir(dir, { recursive: true })
    await cp(SKILL_SOURCE, join(dir, 'SKILL.md'), { force: true })
    console.log(`  Installed ${labelFor(t)} skill → ${join(dir, 'SKILL.md')}`)
  }

  console.log('')
  console.log('  Next:')
  console.log('    - Restart the AI tool so it reloads skills.')
  console.log('    - Try: /htmlshop make a 1080x1080 Instagram post about X')
  console.log('')
  console.log('  Cursor/project users: run `npx htmlshop init` in a project.')
  console.log('  Other IDEs can point their project rules/context at skills/htmlshop/SKILL.md.')
}

async function uninstallSkill(target) {
  const targets = normalizeTargets(target)
  let removed = false
  for (const t of targets) {
    const candidates = [skillDirFor(t), ...legacyDirsFor(t)]
    for (const dir of candidates) {
      if (existsSync(dir)) {
        await rm(dir, { recursive: true, force: true })
        console.log(`  Removed ${dir}`)
        removed = true
      }
    }
  }
  if (!removed) console.log('  Nothing to remove.')
}

function normalizeTargets(target) {
  const t = String(target || 'all').toLowerCase()
  if (t === 'all') return ['codex', 'claude']
  if (t === 'codex' || t === 'claude') return [t]
  throw new Error('install target must be one of: all, codex, claude')
}

function skillDirFor(target) {
  if (target === 'codex') return join(CODEX_HOME, 'skills', 'htmlshop')
  if (target === 'claude') return join(CLAUDE_HOME, 'skills', 'htmlshop')
  throw new Error(`unknown target "${target}"`)
}

function legacyDirsFor(target) {
  if (target === 'codex') {
    return [
      join(CODEX_HOME, 'plugins', 'htmlshop'),
      join(homedir(), '.Codex', 'plugins', 'htmlshop'),
      join(homedir(), '.codex', 'plugins', 'htmlshop')
    ]
  }
  return [join(CLAUDE_HOME, 'plugins', 'htmlshop')]
}

async function cleanupLegacyInstalls(target) {
  for (const dir of legacyDirsFor(target)) {
    if (existsSync(dir)) await rm(dir, { recursive: true, force: true })
  }
}

function labelFor(target) {
  return target === 'codex' ? 'Codex' : 'Claude Code'
}

async function initProjectRule() {
  const cwd = process.cwd()
  const cursorRulesDir = join(cwd, '.cursor', 'rules')
  await mkdir(cursorRulesDir, { recursive: true })
  await cp(SKILL_SOURCE, join(cursorRulesDir, 'htmlshop.mdc'), { force: true })
  console.log('')
  console.log(`  htmlshop Cursor/project rule added → ${join(cursorRulesDir, 'htmlshop.mdc')}`)
  console.log('')
  console.log('  Cursor will pick it up automatically on next chat in this project.')
  console.log('  Windsurf, Aider, Continue, and similar tools can reuse this same file as project context.')
}

async function doctor() {
  const pkg = await readPackage()
  const vendor = join(PKG_ROOT, 'node_modules', 'html-to-image', 'dist', 'html-to-image.js')
  const defaultPortFree = await isPortFree(DEFAULT_HOST, DEFAULT_PORT)

  console.log('')
  console.log('  htmlshop doctor')
  console.log(`  package:       ${pkg.name}@${pkg.version}`)
  console.log(`  node:          ${process.version}`)
  console.log(`  project root:  ${PKG_ROOT}`)
  console.log(`  default files: ${DEFAULT_ROOT}`)
  console.log(`  default URL:   http://${DEFAULT_HOST}:${DEFAULT_PORT}`)
  console.log(`  port ${DEFAULT_PORT}:     ${defaultPortFree ? 'available' : 'in use'}`)
  console.log(`  vendor file:   ${(await fileExists(vendor)) ? 'present' : 'missing'} (${vendor})`)
  console.log(`  Codex skill:   ${skillDirFor('codex')}`)
  console.log(`  Claude skill:  ${skillDirFor('claude')}`)
  console.log('')
}

async function fileExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readPackage() {
  const pkg = await import('../package.json', { with: { type: 'json' } })
  return pkg.default
}

function printHelp() {
  console.log(`
  htmlshop — visual editor for HTML design files

  Usage:
    htmlshop [folder]             Open the editor
    htmlshop [folder] --port 5200 Open on a specific port
    htmlshop [folder] --host 127.0.0.1
    htmlshop [folder] --no-open   Print URL without opening the browser

    htmlshop install [all|codex|claude]
    htmlshop uninstall [all|codex|claude]
    htmlshop init                 Add Cursor/project rule to current project
    htmlshop doctor               Print support/prepublish diagnostics
    htmlshop version              Print version
    htmlshop help                 This message

  Environment:
    PORT                          Override the local server port
    HOST                          Override the local server host
    CODEX_HOME                    Override Codex home (default ~/.codex)
    CLAUDE_CONFIG_DIR             Override Claude Code config dir (default ~/.claude)
`)
}
