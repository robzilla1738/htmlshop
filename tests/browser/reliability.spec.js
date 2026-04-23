import { test, expect } from '@playwright/test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from '../../src/server.js'

const host = '127.0.0.1'

test.describe('htmlshop browser reliability', () => {
  let root
  let server
  let base

  test.beforeEach(async ({ page }) => {
    root = await mkdtemp(join(tmpdir(), 'htmlshop-browser-'))
    await writeFile(join(root, 'design.html'), designHtml({
      title: 'Hello',
      note: 'World',
      width: 320,
      height: 240
    }))

    const port = await freePort(host)
    server = startServer({ root, host, port, open: false })
    base = `http://${host}:${port}`
    await waitForServer(base)

    await page.route('https://fonts.googleapis.com/**', (route) => {
      route.fulfill({ contentType: 'text/css', body: '' })
    })
    await page.route('https://fonts.gstatic.com/**', (route) => {
      route.fulfill({ status: 404, body: '' })
    })
  })

  test.afterEach(async ({ page }) => {
    await page.close().catch(() => {})
    server.closeAllConnections?.()
    server.closeIdleConnections?.()
    await new Promise((resolve) => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  })

  test('gallery creates a design and opens the editor', async ({ page }) => {
    await page.goto(base, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('#root-path')).toHaveText(root)
    await expect(page.locator('.card')).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Open design.html' })).toBeVisible()

    await page.getByRole('button', { name: /\+ New design/ }).click()

    await expect(page).toHaveURL(/\/editor\?file=slide-1\.html$/)
    await expect(page.locator('#filename')).toHaveText('slide-1.html')
    await expect(page.locator('.stage-label')).toContainText('1080 × 1080')
  })

  test('gallery menus and modals work from the keyboard', async ({ page }) => {
    await page.goto(base, { waitUntil: 'domcontentloaded' })

    const menuButton = page.getByRole('button', { name: 'Actions for design.html' })
    await menuButton.focus()
    await page.keyboard.press('Enter')
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('menuitem', { name: 'Rename...' })).toBeVisible()

    await page.getByRole('button', { name: /\+ New carousel/ }).click()
    const input = page.locator('#dialog-input')
    const confirm = page.locator('#dialog-confirm')
    await expect(input).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(confirm).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(input).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('editor loads CSS dimensions and handles transforms, history, duplicate, and delete', async ({ page }) => {
    await page.goto(`${base}/editor?file=design.html`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.stage-label')).toContainText('320 × 240')

    const title = page.frameLocator('iframe.stage').locator('#title')
    await expect(title).toHaveText('Hello')

    await dragBy(page, title, 32, 18)
    await expect(page.locator('#status')).toHaveText('saved')
    await expect.poll(() => styleNumber(title, 'left')).toBeGreaterThan(40)

    await expect(page.locator('#resize-overlay')).toBeVisible()
    const widthBeforeResize = await styleNumber(title, 'width')
    const handle = page.locator('.rh-se')
    const handleBox = await handle.boundingBox()
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 25, handleBox.y + handleBox.height / 2 + 10)
    await page.mouse.up()
    await expect(page.locator('#status')).toHaveText('saved')
    await expect.poll(() => styleNumber(title, 'width')).toBeGreaterThan(widthBeforeResize)
    const widthAfterResize = await styleNumber(title, 'width')

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => styleNumber(title, 'width')).toBeLessThan(widthAfterResize)
    await page.getByRole('button', { name: 'Redo' }).click()
    await expect.poll(() => styleNumber(title, 'width')).toBeGreaterThan(widthBeforeResize)

    await title.click()
    await page.locator('#duplicate-el').click()
    await expect(page.frameLocator('iframe.stage').locator('h1')).toHaveCount(2)

    await page.locator('#delete-el').click()
    await expect(page.frameLocator('iframe.stage').locator('h1')).toHaveCount(1)
  })

  test('transient layer state is not saved to design HTML', async ({ page }) => {
    await page.goto(`${base}/editor?file=design.html`, { waitUntil: 'domcontentloaded' })

    const title = page.frameLocator('iframe.stage').locator('#title')
    await title.click()

    const titleRow = page.locator('.layer-row').filter({ hasText: 'Hello' }).first()
    await titleRow.getByRole('button', { name: 'Lock layer' }).click()
    await titleRow.getByRole('button', { name: 'Hide layer' }).click()

    const note = page.frameLocator('iframe.stage').locator('#note')
    await note.click()
    await page.locator('#text').fill('Updated note')
    await expect(page.locator('#status')).toHaveText('saved')

    const saved = await fetchJson(`${base}/api/file?path=design.html`)
    expect(saved.content).toContain('Updated note')
    expect(saved.content).not.toContain('data-htmlshop-selected')
    expect(saved.content).not.toContain('data-htmlshop-hidden')
    expect(saved.content).not.toContain('data-htmlshop-locked')
    expect(saved.content).not.toContain('__htmlshop_overlay__')
  })

  test('artboards can be added, renamed, and deleted from the layers sidebar', async ({ page }) => {
    await mkdir(join(root, 'deck'))
    await writeFile(join(root, 'deck', 'slide-1.html'), designHtml({ title: 'One' }))
    await writeFile(join(root, 'deck', 'slide-2.html'), designHtml({ title: 'Two' }))

    const files = ['deck/slide-1.html', 'deck/slide-2.html'].map(encodeURIComponent).join(',')
    await page.goto(`${base}/editor?files=${files}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.stage-label')).toHaveCount(2)

    await page.getByRole('button', { name: /\+ Artboard/ }).click()
    await expect.poll(() => page.url()).toContain('deck%2Fslide-3.html')
    await expect(page.locator('.stage-label')).toHaveCount(3)

    await page.getByRole('button', { name: 'Rename deck/slide-3.html' }).click()
    await page.locator('#dialog-input').fill('renamed.html')
    await page.locator('#dialog-confirm').click()
    await expect.poll(() => page.url()).toContain('deck%2Frenamed.html')

    await page.getByRole('button', { name: 'Delete deck/renamed.html' }).click()
    await page.locator('#dialog-confirm').click()
    await expect.poll(() => page.url()).not.toContain('renamed.html')
    await expect(page.locator('.stage-label')).toHaveCount(2)
  })

  test('export dialog uses declared canvas dimensions and gallery does not recursively delete folders', async ({ page }) => {
    await page.goto(`${base}/editor?file=design.html`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => {
      window.__htmlshopExportOpts = []
      window.htmlToImage = {
        toPng: async (_target, opts) => {
          window.__htmlshopExportOpts.push(opts)
          return 'data:image/png;base64,iVBORw0KGgo='
        },
        toJpeg: async (_target, opts) => {
          window.__htmlshopExportOpts.push(opts)
          return 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
        }
      }
      window.showSaveFilePicker = async () => ({
        createWritable: async () => ({
          write: async () => {},
          close: async () => {}
        })
      })
    })

    await page.getByRole('button', { name: 'Export' }).click()
    await page.keyboard.press('Shift+Tab')
    await expect(page.locator('[data-modal-cancel]')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.locator('#export-go')).toBeFocused()
    await page.locator('#export-go').click()
    await expect.poll(() => page.evaluate(() => window.__htmlshopExportOpts.length)).toBe(1)
    const opts = await page.evaluate(() => window.__htmlshopExportOpts[0])
    expect(opts.width).toBe(320)
    expect(opts.height).toBe(240)
    expect(opts.pixelRatio).toBe(2)

    await mkdir(join(root, 'not-empty'))
    await writeFile(join(root, 'not-empty', 'slide-1.html'), designHtml({ title: 'Nested' }))
    await page.goto(base, { waitUntil: 'domcontentloaded' })

    const group = page.locator('.group').filter({ hasText: 'not-empty' })
    await group.locator('.folder-menu .card-menu-btn').click()
    await page.getByRole('menuitem', { name: 'Delete empty folder' }).click()
    await expect(page.locator('.toast')).toContainText('not empty')
    await expect(page.locator('.toast')).toHaveAttribute('role', 'alert')
    await expect(page.locator('.group').filter({ hasText: 'not-empty' })).toBeVisible()
  })

  test('small viewports use compact layout without document overflow', async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(viewport)
      await page.goto(base, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.card')).toHaveCount(1)
      await expect.poll(() => horizontalOverflow(page)).toBeLessThanOrEqual(1)

      await page.goto(`${base}/editor?file=design.html`, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.stage-label')).toContainText('320 × 240')
      await expect.poll(() => horizontalOverflow(page)).toBeLessThanOrEqual(1)

      const layersToggle = page.getByRole('button', { name: 'Layers' })
      const panelToggle = page.getByRole('button', { name: 'Properties' })
      await expect(layersToggle).toBeVisible()
      await layersToggle.click()
      await expect(layersToggle).toHaveAttribute('aria-expanded', 'true')
      await panelToggle.click()
      await expect(layersToggle).toHaveAttribute('aria-expanded', 'false')
      await expect(panelToggle).toHaveAttribute('aria-expanded', 'true')
      await page.keyboard.press('Escape')
      await expect(panelToggle).toHaveAttribute('aria-expanded', 'false')
    }
  })
})

async function dragBy(page, locator, dx, dy) {
  const box = await locator.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 4 })
  await page.mouse.up()
}

async function styleNumber(locator, property) {
  return await locator.evaluate((el, prop) => parseFloat(getComputedStyle(el).getPropertyValue(prop)) || 0, property)
}

async function horizontalOverflow(page) {
  return await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return await res.json()
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

function freePort(hostname) {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, hostname, () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

function designHtml({ title = 'Design', note = 'Note', width = 320, height = 240 } = {}) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      margin: 0;
      width: ${width}px;
      height: ${height}px;
      position: relative;
      overflow: hidden;
      font-family: Arial, sans-serif;
      background: #fff;
    }
    #title {
      position: absolute;
      left: 40px;
      top: 50px;
      width: 120px;
      height: 48px;
      margin: 0;
      font-size: 32px;
      line-height: 1.1;
    }
    #note {
      position: absolute;
      left: 40px;
      top: 130px;
      width: 180px;
      height: 32px;
      margin: 0;
      font-size: 20px;
    }
  </style>
</head>
<body>
  <h1 id="title">${escapeHtml(title)}</h1>
  <p id="note">${escapeHtml(note)}</p>
</body>
</html>
`
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}
