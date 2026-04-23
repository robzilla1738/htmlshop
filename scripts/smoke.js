import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { startServer } from '../src/server.js'

const host = '127.0.0.1'
const port = await freePort(host)
const root = await mkdtemp(join(tmpdir(), 'htmlshop-smoke-'))
const server = startServer({ root, host, port, open: false })
const base = `http://${host}:${port}`

try {
  await waitForServer(base)

  await expectOk(fetch(`${base}/`), 'GET /')
  await expectOk(fetch(`${base}/editor`), 'GET /editor')
  await expectOk(fetch(`${base}/styles.css`), 'GET /styles.css')
  await expectOk(fetch(`${base}/vendor/html-to-image.js`), 'GET /vendor/html-to-image.js')

  let res = await jsonFetch(`${base}/api/folders`, {
    method: 'POST',
    body: JSON.stringify({ path: 'deck' })
  })
  assert(res.ok && res.data.path === 'deck', 'creates folder')

  res = await jsonFetch(`${base}/api/new-design`, {
    method: 'POST',
    body: JSON.stringify({ folder: 'deck' })
  })
  assert(res.ok && res.data.path === 'deck/slide-1.html', 'creates first design')
  const first = res.data.path

  res = await jsonFetch(`${base}/api/file?path=${encodeURIComponent(first)}`)
  assert(res.ok && /<html/i.test(res.data.content), 'reads design file')

  const updated = '<!doctype html><html><head><title>x</title></head><body style="width:1080px;height:1080px">ok</body></html>'
  res = await jsonFetch(`${base}/api/file?path=${encodeURIComponent(first)}`, {
    method: 'PUT',
    body: JSON.stringify({ content: updated })
  })
  assert(res.ok, 'writes design file')

  const htmPath = 'deck/legacy.htm'
  res = await jsonFetch(`${base}/api/file?path=${encodeURIComponent(htmPath)}`, {
    method: 'PUT',
    body: JSON.stringify({ content: updated })
  })
  assert(res.ok, 'writes .htm design file')

  res = await jsonFetch(`${base}/api/file?path=${encodeURIComponent(htmPath)}`)
  assert(res.ok && /<html/i.test(res.data.content), 'reads .htm design file')

  res = await jsonFetch(`${base}/api/files`)
  assert(res.ok && res.data.some((f) => f.path === first), 'lists .html design file')
  assert(res.ok && res.data.some((f) => f.path === htmPath), 'lists .htm design file')

  res = await jsonFetch(`${base}/api/new-design`, {
    method: 'POST',
    body: JSON.stringify({ folder: 'deck' })
  })
  assert(res.ok && res.data.path === 'deck/slide-2.html', 'creates second design')
  const second = res.data.path

  res = await jsonFetch(`${base}/api/move`, {
    method: 'POST',
    body: JSON.stringify({ from: first, to: second })
  })
  assert(!res.ok && /destination already exists/.test(res.error), 'rejects move overwrite')

  res = await jsonFetch(`${base}/api/folders`, {
    method: 'POST',
    body: JSON.stringify({ path: 'archive' })
  })
  assert(res.ok && res.data.path === 'archive', 'creates second folder')

  res = await jsonFetch(`${base}/api/move`, {
    method: 'POST',
    body: JSON.stringify({ from: 'deck', to: 'archive' })
  })
  assert(!res.ok && /destination already exists/.test(res.error), 'rejects folder move overwrite')

  res = await jsonFetch(`${base}/api/file?path=${encodeURIComponent('../package.json')}`)
  assert(!res.ok, 'rejects path traversal')

  res = await jsonFetch(`${base}/api/file?path=${encodeURIComponent('deck/../package.json')}`)
  assert(!res.ok, 'rejects encoded path traversal')

  res = await jsonFetch(`${base}/api/file?path=${encodeURIComponent('/tmp/design.html')}`)
  assert(!res.ok, 'rejects absolute paths')

  res = await jsonFetch(`${base}/api/file?path=${encodeURIComponent('bad\0name.html')}`)
  assert(!res.ok, 'rejects null bytes')

  res = await jsonFetch(`${base}/api/folders`, {
    method: 'POST',
    body: JSON.stringify({ path: 'bad:name' })
  })
  assert(!res.ok, 'rejects unsafe folder name')

  res = await jsonFetch(`${base}/api/file?path=${encodeURIComponent('deck')}`, { method: 'DELETE' })
  assert(!res.ok && /folder is not empty/.test(res.error), 'rejects non-empty folder delete')

  res = await jsonFetch(`${base}/api/folders`, {
    method: 'POST',
    body: JSON.stringify({ path: 'empty-folder' })
  })
  assert(res.ok, 'creates empty folder')

  res = await jsonFetch(`${base}/api/file?path=${encodeURIComponent('empty-folder')}`, { method: 'DELETE' })
  assert(res.ok, 'deletes empty folder')

  res = await jsonFetch(`${base}/api/assets`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'tiny.png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo='
    })
  })
  assert(res.ok && /^assets\//.test(res.data.path), 'uploads allowed image asset')

  res = await jsonFetch(`${base}/api/assets`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'bad name!.png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo='
    })
  })
  assert(res.ok && /^assets\/\d+-bad_name_\.png$/.test(res.data.path), 'sanitizes asset filename')

  res = await jsonFetch(`${base}/api/assets`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'note.txt',
      dataUrl: 'data:text/plain;base64,aGVsbG8='
    })
  })
  assert(!res.ok && /unsupported image type/.test(res.error), 'rejects unsupported asset type')

  const tooLarge = Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64')
  res = await jsonFetch(`${base}/api/assets`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'large.png',
      dataUrl: `data:image/png;base64,${tooLarge}`
    })
  })
  assert(!res.ok && /too large/.test(res.error), 'rejects oversized asset')

  res = await jsonFetch(`${base}/api/file?path=${encodeURIComponent(second)}`, {
    method: 'DELETE'
  })
  assert(res.ok, 'deletes design file')

  console.log('smoke ok')
} finally {
  await new Promise((resolve) => server.close(resolve))
  await rm(root, { recursive: true, force: true })
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  })
  const data = await res.json().catch(() => ({}))
  return res.ok ? { ok: true, data } : { ok: false, error: data.error || res.statusText }
}

async function expectOk(promise, label) {
  const res = await promise
  assert(res.ok, label)
}

async function waitForServer(url) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('server did not start')
}

function freePort(host) {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, host, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function assert(condition, label) {
  if (!condition) throw new Error(`smoke failed: ${label}`)
}
