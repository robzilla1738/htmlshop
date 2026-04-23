import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = join(process.cwd(), 'bin', 'htmlshop.js')
const root = await mkdtemp(join(tmpdir(), 'htmlshop-cli-smoke-'))
const codexHome = join(root, 'codex-home')
const claudeHome = join(root, 'claude-home')
const project = join(root, 'project')
const baseEnv = {
  ...process.env,
  CODEX_HOME: codexHome,
  CLAUDE_CONFIG_DIR: claudeHome
}

try {
  let res = await run(['help'])
  assert(res.ok && /htmlshop/.test(res.stdout), 'help succeeds')

  res = await run(['version'])
  assert(res.ok && /^\d+\.\d+\.\d+/.test(res.stdout.trim()), 'version succeeds')

  res = await run(['doctor'])
  assert(res.ok && /Codex skill:\s+missing/.test(res.stdout), 'doctor reports missing Codex skill')
  assert(res.ok && /Claude skill:\s+missing/.test(res.stdout), 'doctor reports missing Claude skill')

  await expectFail(['--no-open'], { PORT: 'abc' }, 'invalid port "abc"')
  await expectFail(['--no-open'], { PORT: '0' }, 'invalid port "0"')
  await expectFail(['--port=abc', '--no-open'], {}, 'invalid port "abc"')
  await expectFail(['--host=', '--no-open'], {}, '--host requires a value')
  await expectFail(['--no-open'], { HOST: '' }, 'HOST requires a value')

  res = await run(['install'])
  assert(res.ok, 'install all succeeds')
  assert(existsSync(join(codexHome, 'skills', 'htmlshop', 'SKILL.md')), 'installs Codex skill')
  assert(existsSync(join(claudeHome, 'skills', 'htmlshop', 'SKILL.md')), 'installs Claude skill')

  await rm(project, { recursive: true, force: true })
  await run(['init'], { cwd: project, mkdirCwd: true })
  const rule = join(project, '.cursor', 'rules', 'htmlshop.mdc')
  assert(existsSync(rule), 'init writes Cursor rule')
  assert((await readFile(rule, 'utf8')).includes('# htmlshop'), 'Cursor rule has skill content')

  res = await run(['doctor'], { cwd: project })
  assert(res.ok && /Codex skill:\s+installed/.test(res.stdout), 'doctor reports installed Codex skill')
  assert(res.ok && /Claude skill:\s+installed/.test(res.stdout), 'doctor reports installed Claude skill')
  assert(res.ok && /project rule:\s+present/.test(res.stdout), 'doctor reports project rule')

  res = await run(['uninstall'])
  assert(res.ok, 'uninstall all succeeds')
  assert(!existsSync(join(codexHome, 'skills', 'htmlshop')), 'removes Codex skill')
  assert(!existsSync(join(claudeHome, 'skills', 'htmlshop')), 'removes Claude skill')

  console.log('cli smoke ok')
} finally {
  await rm(root, { recursive: true, force: true })
}

async function expectFail(args, env, message) {
  const res = await run(args, { env })
  assert(!res.ok && res.stderr.includes(message), `${args.join(' ')} fails with ${message}`)
}

function run(args, opts = {}) {
  return new Promise(async (resolve) => {
    const cwd = opts.cwd || process.cwd()
    if (opts.mkdirCwd) {
      await mkdir(cwd, { recursive: true })
    }
    execFile(process.execPath, [CLI, ...args], {
      cwd,
      env: { ...baseEnv, ...(opts.env || {}) }
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code ?? 0,
        stdout,
        stderr
      })
    })
  })
}

function assert(condition, label) {
  if (!condition) throw new Error(`cli smoke failed: ${label}`)
}
