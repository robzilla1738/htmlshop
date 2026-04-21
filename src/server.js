import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(__dirname, 'web')
const PKG_ROOT = resolve(__dirname, '..')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf'
}

const EXT_FROM_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg'
}

export function startServer({ root, port }) {
  const app = new Hono()

  const safeAbs = (p) => {
    if (!p) throw new Error('path required')
    const abs = resolve(root, p)
    const rel = relative(root, abs)
    if (rel.startsWith('..') || rel.includes('\0')) throw new Error('unsafe path')
    return abs
  }

  app.get('/api/files', async (c) => {
    const files = await walkHtml(root)
    return c.json(
      files
        .map((f) => ({ path: relative(root, f), name: basename(f) }))
        .sort((a, b) => a.path.localeCompare(b.path))
    )
  })

  app.get('/api/file', async (c) => {
    try {
      const abs = safeAbs(c.req.query('path'))
      const content = await readFile(abs, 'utf8')
      return c.json({ content })
    } catch (e) {
      return c.json({ error: e.message }, 400)
    }
  })

  app.put('/api/file', async (c) => {
    try {
      const abs = safeAbs(c.req.query('path'))
      const { content } = await c.req.json()
      if (typeof content !== 'string') throw new Error('content must be a string')
      await writeFile(abs, content, 'utf8')
      return c.json({ ok: true })
    } catch (e) {
      return c.json({ error: e.message }, 400)
    }
  })

  app.delete('/api/file', async (c) => {
    try {
      const abs = safeAbs(c.req.query('path'))
      if (abs === root) throw new Error('cannot delete root')
      await rm(abs)
      return c.json({ ok: true })
    } catch (e) {
      return c.json({ error: e.message }, 400)
    }
  })

  app.get('/api/folders', async (c) => {
    const folders = await walkFolders(root)
    return c.json(folders.sort((a, b) => a.localeCompare(b)))
  })

  app.post('/api/folders', async (c) => {
    try {
      const { path: p } = await c.req.json()
      if (typeof p !== 'string' || !p.trim()) throw new Error('path required')
      const cleaned = p.trim().replace(/^\/+|\/+$/g, '')
      // Disallow dangerous characters in segment names
      for (const seg of cleaned.split('/')) {
        if (!seg || seg === '.' || seg === '..' || /[\\:*?"<>|]/.test(seg)) {
          throw new Error('invalid folder name')
        }
      }
      const abs = safeAbs(cleaned)
      await mkdir(abs, { recursive: true })
      return c.json({ ok: true, path: cleaned })
    } catch (e) {
      return c.json({ error: e.message }, 400)
    }
  })

  app.post('/api/new-design', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}))
      const folder = typeof body.folder === 'string' ? body.folder : ''
      const requestedName = typeof body.name === 'string' ? body.name.trim() : ''

      const folderAbs = folder ? safeAbs(folder) : root
      await mkdir(folderAbs, { recursive: true })

      const existing = await listHtmlNames(folderAbs)
      const fileName = requestedName
        ? sanitizeHtmlName(requestedName)
        : pickNextSlideName(existing)
      const abs = safeAbs(folder ? `${folder}/${fileName}` : fileName)
      const relPath = relative(root, abs)
      const template = blankDesignTemplate(fileName.replace(/\.html?$/i, ''))

      await writeFile(abs, template, { flag: 'wx' }).catch(async (err) => {
        if (err.code === 'EEXIST') throw new Error('file already exists')
        throw err
      })

      return c.json({ ok: true, path: relPath })
    } catch (e) {
      return c.json({ error: e.message }, 400)
    }
  })

  app.post('/api/move', async (c) => {
    try {
      const { from, to } = await c.req.json()
      if (typeof from !== 'string' || typeof to !== 'string') {
        throw new Error('from and to required')
      }
      const fromAbs = safeAbs(from)
      const toAbs = safeAbs(to)
      await mkdir(dirname(toAbs), { recursive: true })
      await rename(fromAbs, toAbs)
      return c.json({ ok: true, path: relative(root, toAbs) })
    } catch (e) {
      return c.json({ error: e.message }, 400)
    }
  })

  app.post('/api/assets', async (c) => {
    try {
      const { name, dataUrl } = await c.req.json()
      if (typeof name !== 'string' || typeof dataUrl !== 'string') {
        throw new Error('name and dataUrl required')
      }
      const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
      if (!m) throw new Error('invalid dataUrl')
      const [, mime, b64] = m
      const buf = Buffer.from(b64, 'base64')

      const nameExt = extname(name).toLowerCase()
      const mimeExt = EXT_FROM_MIME[mime] ?? ''
      const ext = mimeExt || nameExt || '.bin'
      const base = basename(name).replace(/\.[^.]+$/, '').replace(/[^a-z0-9._-]/gi, '_') || 'asset'
      const finalName = `${Date.now()}-${base}${ext}`

      const assetsDir = join(root, 'assets')
      await mkdir(assetsDir, { recursive: true })
      const abs = join(assetsDir, finalName)
      await writeFile(abs, buf)

      return c.json({ path: `assets/${finalName}` })
    } catch (e) {
      return c.json({ error: e.message }, 400)
    }
  })

  // Serve any file under the user's design root.
  // Relative paths inside designs (e.g. <img src="assets/logo.png">) resolve correctly
  // because the design HTML is served at /files/<its-path>.
  app.get('/files/*', async (c) => {
    try {
      const url = new URL(c.req.url)
      const rel = decodeURIComponent(url.pathname.slice('/files/'.length))
      const abs = safeAbs(rel)
      const buf = await readFile(abs)
      c.header('Content-Type', MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream')
      c.header('Cache-Control', 'no-store')
      return c.body(buf)
    } catch {
      return c.notFound()
    }
  })

  // Serve bundled vendor files from node_modules (currently just html-to-image).
  app.get('/vendor/html-to-image.js', async (c) => {
    try {
      const abs = join(PKG_ROOT, 'node_modules', 'html-to-image', 'dist', 'html-to-image.js')
      const buf = await readFile(abs)
      c.header('Content-Type', 'application/javascript; charset=utf-8')
      c.header('Cache-Control', 'public, max-age=86400')
      return c.body(buf)
    } catch {
      return c.notFound()
    }
  })

  app.get('*', async (c) => {
    const url = new URL(c.req.url)
    let path = url.pathname
    if (path === '/') path = '/index.html'
    if (path === '/editor') path = '/editor.html'
    const abs = join(WEB_DIR, path)
    if (!abs.startsWith(WEB_DIR)) return c.notFound()
    try {
      const buf = await readFile(abs)
      c.header('Content-Type', MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream')
      return c.body(buf)
    } catch {
      return c.notFound()
    }
  })

  serve({ fetch: app.fetch, port }, (info) => {
    console.log('')
    console.log(`  htmlshop running`)
    console.log(`  → http://localhost:${info.port}`)
    console.log(`  → editing: ${root}`)
    console.log('')
  })
}

async function walkFolders(dir, relRoot = '') {
  const out = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'assets') continue
    if (e.isDirectory()) {
      const rel = relRoot ? `${relRoot}/${e.name}` : e.name
      out.push(rel)
      out.push(...(await walkFolders(join(dir, e.name), rel)))
    }
  }
  return out
}

async function walkHtml(dir) {
  const out = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'assets') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walkHtml(p)))
    else if (e.isFile() && extname(e.name).toLowerCase() === '.html') out.push(p)
  }
  return out
}

function basename(p) {
  return p.split('/').pop()
}

async function listHtmlNames(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && extname(e.name).toLowerCase() === '.html')
      .map((e) => e.name)
  } catch {
    return []
  }
}

function pickNextSlideName(existing) {
  const nums = existing
    .map((n) => /^slide-(\d+)\.html?$/i.exec(n))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10))
  const next = nums.length ? Math.max(...nums) + 1 : 1
  let candidate = `slide-${next}.html`
  // Extremely defensive in case existing has gaps past slide-9999
  while (existing.includes(candidate)) candidate = `slide-${next + 1}.html`
  return candidate
}

function sanitizeHtmlName(name) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9._-]/gi, '_') || 'artboard'
  return `${base}.html`
}

function blankDesignTemplate(title) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      width: 1080px;
      height: 1080px;
      background: #ffffff;
      font-family: "DM Sans", system-ui, -apple-system, sans-serif;
      color: #111111;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    h1 { font-size: 84px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
</body>
</html>
`
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}
