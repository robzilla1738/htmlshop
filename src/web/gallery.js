const groupsEl = document.getElementById('groups')
const count = document.getElementById('count')
const empty = document.getElementById('empty')
const hint = document.getElementById('hint')
const rootPathEl = document.getElementById('root-path')
const newFolderBtn = document.getElementById('new-folder')
const newDesignBtn = document.getElementById('new-design')

let files = []
let folders = []
let rootPath = ''

// Scale each card's preview iframe so the design fills the card.
// The design's natural size is read from its body on load, then scaled.
const previewObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const iframe = entry.target.querySelector('iframe')
    if (!iframe) continue
    const cardW = entry.contentRect.width
    const naturalW = Number(iframe.dataset.naturalW) || 1080
    if (cardW > 0) iframe.style.transform = `scale(${cardW / naturalW})`
  }
})

function sizePreview(frame, iframe) {
  const doc = iframe.contentDocument
  if (!doc || !doc.body) return
  const cs = iframe.contentWindow.getComputedStyle(doc.body)
  const declaredW = parseFloat(cs.width)
  const declaredH = parseFloat(cs.height)
  const w = (isFinite(declaredW) && declaredW > 0) ? declaredW
    : (doc.body.scrollWidth || doc.body.offsetWidth || 1080)
  const h = (isFinite(declaredH) && declaredH > 0) ? declaredH
    : (doc.body.scrollHeight || doc.body.offsetHeight || 1080)
  iframe.style.width = w + 'px'
  iframe.style.height = h + 'px'
  iframe.dataset.naturalW = w
  iframe.dataset.naturalH = h
  frame.style.aspectRatio = `${w} / ${h}`
  const cardW = frame.clientWidth
  if (cardW > 0) iframe.style.transform = `scale(${cardW / w})`
}

await refresh()

newFolderBtn.addEventListener('click', async () => {
  const folderName = await promptText({
    title: 'New carousel',
    label: 'Carousel folder name',
    placeholder: 'apologetics-series',
    confirmText: 'Create'
  })
  if (!folderName) return

  const folderRes = await api('/api/folders', {
    method: 'POST',
    body: JSON.stringify({ path: folderName })
  })
  if (!folderRes.ok) {
    toast('Could not create folder: ' + folderRes.error)
    return
  }

  // Auto-create a blank first slide and jump straight into the editor.
  const designRes = await api('/api/new-design', {
    method: 'POST',
    body: JSON.stringify({ folder: folderRes.data.path })
  })
  if (!designRes.ok) {
    toast('Folder created, but could not create first slide: ' + designRes.error)
    await refresh()
    return
  }

  location.href = `/editor?file=${encodeURIComponent(designRes.data.path)}`
})

newDesignBtn.addEventListener('click', async () => {
  const res = await api('/api/new-design', {
    method: 'POST',
    body: JSON.stringify({ folder: '' })
  })
  if (!res.ok) {
    toast('Could not create design: ' + res.error)
    return
  }
  location.href = `/editor?file=${encodeURIComponent(res.data.path)}`
})

document.addEventListener('click', (e) => {
  document.querySelectorAll('.card-menu').forEach((m) => {
    if (!m.contains(e.target)) m.classList.remove('open')
  })
})

async function refresh() {
  const [filesRes, foldersRes, rootRes] = await Promise.all([
    api('/api/files'),
    api('/api/folders'),
    api('/api/root')
  ])
  if (!filesRes.ok || !foldersRes.ok) {
    toast('Could not load designs.')
    return
  }
  files = filesRes.data
  folders = foldersRes.data
  rootPath = rootRes.ok ? rootRes.data.root : ''
  render()
}

function render() {
  groupsEl.innerHTML = ''
  count.textContent = `${files.length} design${files.length === 1 ? '' : 's'}`
  if (rootPathEl) {
    rootPathEl.textContent = rootPath
    rootPathEl.title = rootPath
  }

  const byDir = new Map()
  byDir.set('', [])
  for (const f of folders) byDir.set(f, [])
  for (const f of files) {
    const dir = f.path.split('/').slice(0, -1).join('/')
    if (!byDir.has(dir)) byDir.set(dir, [])
    byDir.get(dir).push(f)
  }

  const order = [''].concat(
    Array.from(byDir.keys()).filter((d) => d !== '').sort((a, b) => a.localeCompare(b))
  )

  for (const dir of order) {
    const items = byDir.get(dir) || []
    if (dir === '' && !items.length) continue
    groupsEl.appendChild(buildGroup(dir, items))
  }

  const hasContent = files.length > 0 || folders.length > 0
  empty.hidden = hasContent
  hint.hidden = !hasContent
}

function buildGroup(dir, items) {
  const section = document.createElement('section')
  section.className = 'group'

  const header = document.createElement('div')
  header.className = 'group-head'

  const name = document.createElement('span')
  name.className = 'group-name'
  if (dir === '') {
    name.innerHTML = '<span class="muted">Standalone designs</span>'
  } else {
    name.textContent = dir
  }

  const countEl = document.createElement('span')
  countEl.className = 'group-count muted'
  countEl.textContent = `${items.length} design${items.length === 1 ? '' : 's'}`

  header.appendChild(name)
  header.appendChild(countEl)

  if (dir !== '' && items.length >= 2) {
    const carouselBtn = document.createElement('button')
    carouselBtn.className = 'tb tb-wide group-carousel'
    carouselBtn.textContent = 'Open as carousel'
    carouselBtn.title = 'Open all designs in this folder'
    carouselBtn.addEventListener('click', () => {
      const qs = items.map((i) => encodeURIComponent(i.path)).join(',')
      location.href = `/editor?files=${qs}`
    })
    header.appendChild(carouselBtn)
  }

  if (dir !== '') {
    header.appendChild(buildFolderMenu(dir, items.length))
  }

  section.appendChild(header)

  if (!items.length) {
    const emptyRow = document.createElement('div')
    emptyRow.className = 'group-empty'
    const addBtn = document.createElement('button')
    addBtn.className = 'tb'
    addBtn.textContent = '+ Add first design'
    addBtn.addEventListener('click', () => createDesignInFolder(dir))
    emptyRow.appendChild(addBtn)
    section.appendChild(emptyRow)
  } else {
    const grid = document.createElement('div')
    grid.className = 'grid'
    for (const f of items) grid.appendChild(buildCard(f))
    section.appendChild(grid)
  }
  return section
}

async function createDesignInFolder(folder) {
  const res = await api('/api/new-design', {
    method: 'POST',
    body: JSON.stringify({ folder })
  })
  if (!res.ok) {
    toast('Could not create design: ' + res.error)
    return
  }
  location.href = `/editor?file=${encodeURIComponent(res.data.path)}`
}

function buildCard(f) {
  const card = document.createElement('a')
  card.className = 'card'
  card.href = `/editor?file=${encodeURIComponent(f.path)}`
  card.dataset.path = f.path

  const frame = document.createElement('div')
  frame.className = 'frame'
  const iframe = document.createElement('iframe')
  iframe.src = `/files/${encodePath(f.path)}`
  iframe.loading = 'lazy'
  iframe.tabIndex = -1
  iframe.title = f.name
  frame.appendChild(iframe)
  previewObserver.observe(frame)

  const label = document.createElement('div')
  label.className = 'label'
  label.title = f.path
  label.textContent = f.name

  iframe.addEventListener('load', () => {
    sizePreview(frame, iframe)
    const w = iframe.dataset.naturalW
    const h = iframe.dataset.naturalH
    if (w && h) label.textContent = `${f.name}  ·  ${w} x ${h}`
  })

  card.appendChild(buildCardMenu(f))
  card.appendChild(frame)
  card.appendChild(label)
  return card
}

function buildCardMenu(f) {
  const wrap = document.createElement('div')
  wrap.className = 'card-menu'

  const btn = document.createElement('button')
  btn.className = 'card-menu-btn'
  btn.textContent = '...'
  btn.title = 'Actions'
  btn.setAttribute('aria-label', `Actions for ${f.name}`)
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    document.querySelectorAll('.card-menu.open').forEach((m) => m !== wrap && m.classList.remove('open'))
    wrap.classList.toggle('open')
  })

  const pop = document.createElement('div')
  pop.className = 'card-menu-pop'
  pop.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  pop.appendChild(menuItem('Move to...', () => {
    wrap.classList.remove('open')
    showMoveDialog(f)
  }))
  pop.appendChild(menuItem('Duplicate', async () => {
    wrap.classList.remove('open')
    await duplicateFile(f)
  }))
  pop.appendChild(menuItem('Rename...', async () => {
    wrap.classList.remove('open')
    await renameFile(f)
  }))
  pop.appendChild(menuItem('Delete', async () => {
    wrap.classList.remove('open')
    await deleteFile(f)
  }, 'danger'))

  wrap.appendChild(btn)
  wrap.appendChild(pop)
  return wrap
}

async function duplicateFile(f) {
  const readRes = await api(`/api/file?path=${encodeURIComponent(f.path)}`)
  if (!readRes.ok) {
    toast('Duplicate failed: ' + readRes.error)
    return
  }
  const dir = f.path.split('/').slice(0, -1).join('/')
  const createRes = await api('/api/new-design', {
    method: 'POST',
    body: JSON.stringify({ folder: dir })
  })
  if (!createRes.ok) {
    toast('Duplicate failed: ' + createRes.error)
    return
  }
  const writeRes = await api(`/api/file?path=${encodeURIComponent(createRes.data.path)}`, {
    method: 'PUT',
    body: JSON.stringify({ content: readRes.data.content })
  })
  if (!writeRes.ok) {
    toast('Duplicate failed: ' + writeRes.error)
    return
  }
  toast('Duplicated design.', 'success')
  await refresh()
}

async function renameFile(f) {
  const current = f.path.split('/').pop()
  const next = await promptText({
    title: 'Rename design',
    label: 'File name',
    value: current,
    confirmText: 'Rename'
  })
  if (!next || next === current) return
  const dir = f.path.split('/').slice(0, -1).join('/')
  const newPath = dir ? `${dir}/${next}` : next
  const res = await api('/api/move', {
    method: 'POST',
    body: JSON.stringify({ from: f.path, to: newPath })
  })
  if (!res.ok) {
    toast('Rename failed: ' + res.error)
    return
  }
  await refresh()
}

async function deleteFile(f) {
  const ok = await confirmDialog({
    title: 'Delete design',
    message: `Delete "${f.path}"? This cannot be undone.`,
    confirmText: 'Delete',
    danger: true
  })
  if (!ok) return
  const res = await api(`/api/file?path=${encodeURIComponent(f.path)}`, { method: 'DELETE' })
  if (!res.ok) {
    toast('Delete failed: ' + res.error)
    return
  }
  await refresh()
}

function buildFolderMenu(dir, fileCount) {
  const wrap = document.createElement('div')
  wrap.className = 'card-menu folder-menu'

  const btn = document.createElement('button')
  btn.className = 'card-menu-btn'
  btn.textContent = '...'
  btn.title = 'Folder actions'
  btn.setAttribute('aria-label', `Actions for folder ${dir}`)
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    document.querySelectorAll('.card-menu.open').forEach((m) => m !== wrap && m.classList.remove('open'))
    wrap.classList.toggle('open')
  })

  const pop = document.createElement('div')
  pop.className = 'card-menu-pop'
  pop.addEventListener('click', (e) => e.stopPropagation())

  pop.appendChild(menuItem('+ Add design here', () => {
    wrap.classList.remove('open')
    createDesignInFolder(dir)
  }))
  pop.appendChild(menuItem('Rename folder...', async () => {
    wrap.classList.remove('open')
    await renameFolder(dir)
  }))
  pop.appendChild(menuItem('Delete empty folder', async () => {
    wrap.classList.remove('open')
    await deleteFolder(dir, fileCount)
  }, 'danger'))

  wrap.appendChild(btn)
  wrap.appendChild(pop)
  return wrap
}

async function renameFolder(dir) {
  const parts = dir.split('/')
  const current = parts[parts.length - 1]
  const next = await promptText({
    title: 'Rename folder',
    label: 'Folder name',
    value: current,
    confirmText: 'Rename'
  })
  if (!next || next === current) return
  const parent = parts.slice(0, -1).join('/')
  const newPath = parent ? `${parent}/${next}` : next
  const res = await api('/api/move', {
    method: 'POST',
    body: JSON.stringify({ from: dir, to: newPath })
  })
  if (!res.ok) {
    toast('Rename failed: ' + res.error)
    return
  }
  await refresh()
}

async function deleteFolder(dir, fileCount) {
  if (fileCount > 0) {
    toast(`Folder "${dir}" is not empty. Move or delete its designs first.`)
    return
  }
  const ok = await confirmDialog({
    title: 'Delete folder',
    message: `Delete empty folder "${dir}"?`,
    confirmText: 'Delete',
    danger: true
  })
  if (!ok) return
  const res = await api(`/api/file?path=${encodeURIComponent(dir)}`, { method: 'DELETE' })
  if (!res.ok) {
    toast('Delete failed: ' + res.error)
    return
  }
  await refresh()
}

function menuItem(label, handler, extraCls = '') {
  const b = document.createElement('button')
  b.className = 'menu-item' + (extraCls ? ' ' + extraCls : '')
  b.textContent = label
  b.addEventListener('click', handler)
  return b
}

function showMoveDialog(f) {
  const restoreFocus = document.activeElement
  const overlay = createModal({
    title: `Move "${f.name}"`,
    body: `
      <div class="modal-section-title">Choose destination</div>
      <div class="folder-picker"></div>
      <div class="modal-section-title">Or create new folder</div>
      <div class="new-folder-row">
        <input type="text" placeholder="folder name" id="new-folder-input">
        <button class="tb" id="new-folder-go">Create &amp; move</button>
      </div>
    `,
    footer: '<button class="tb" data-modal-cancel>Cancel</button>',
    restoreFocus
  })

  const modal = overlay.querySelector('.modal')
  const picker = modal.querySelector('.folder-picker')
  const destinations = ['', ...folders]
  const currentDir = f.path.split('/').slice(0, -1).join('/')
  for (const dest of destinations) {
    if (dest === currentDir) continue
    const row = document.createElement('button')
    row.className = 'folder-option'
    row.textContent = dest === '' ? '(standalone / root)' : dest
    row.addEventListener('click', async () => {
      const moved = await doMove(f, dest)
      if (moved) closeModal(overlay, restoreFocus)
    })
    picker.appendChild(row)
  }
  if (!picker.children.length) {
    picker.innerHTML = '<div class="muted" style="padding:6px 0">No other folders. Create one below.</div>'
  }

  modal.querySelector('#new-folder-go').addEventListener('click', async () => {
    const input = modal.querySelector('#new-folder-input')
    const val = input.value.trim()
    if (!val) return
    const res = await api('/api/folders', {
      method: 'POST',
      body: JSON.stringify({ path: val })
    })
    if (!res.ok) {
      toast('Folder creation failed: ' + res.error)
      return
    }
    const moved = await doMove(f, res.data.path)
    if (moved) closeModal(overlay, restoreFocus)
  })
  modal.querySelector('#new-folder-input')?.focus()
}

async function doMove(f, destDir) {
  const name = f.path.split('/').pop()
  const to = destDir ? `${destDir}/${name}` : name
  const res = await api('/api/move', {
    method: 'POST',
    body: JSON.stringify({ from: f.path, to })
  })
  if (!res.ok) {
    toast('Move failed: ' + res.error)
    return false
  }
  await refresh()
  return true
}

async function api(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.error || res.statusText || 'unknown error' }
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err.message || 'network error' }
  }
}

function promptText({ title, label, value = '', placeholder = '', confirmText = 'OK' }) {
  const restoreFocus = document.activeElement
  const overlay = createModal({
    title,
    body: `
      <label class="dialog-field">
        <span>${escapeHtml(label)}</span>
        <input id="dialog-input" type="text" value="${escapeAttr(value)}" placeholder="${escapeAttr(placeholder)}">
      </label>
    `,
    footer: `
      <button class="tb" data-modal-cancel>Cancel</button>
      <button class="tb tb-primary" id="dialog-confirm">${escapeHtml(confirmText)}</button>
    `,
    restoreFocus
  })
  const input = overlay.querySelector('#dialog-input')
  const confirm = overlay.querySelector('#dialog-confirm')

  return new Promise((resolve) => {
    const finish = (val) => {
      closeModal(overlay, restoreFocus)
      resolve(val)
    }
    confirm.addEventListener('click', () => finish(input.value.trim()))
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        finish(input.value.trim())
      }
    })
    overlay.addEventListener('modal-cancel', () => resolve(null), { once: true })
    input.focus()
    input.select()
  })
}

function confirmDialog({ title, message, confirmText = 'OK', danger = false }) {
  const restoreFocus = document.activeElement
  const overlay = createModal({
    title,
    body: `<p class="dialog-message">${escapeHtml(message)}</p>`,
    footer: `
      <button class="tb" data-modal-cancel>Cancel</button>
      <button class="tb ${danger ? 'tb-danger' : 'tb-primary'}" id="dialog-confirm">${escapeHtml(confirmText)}</button>
    `,
    restoreFocus
  })

  return new Promise((resolve) => {
    overlay.querySelector('#dialog-confirm').addEventListener('click', () => {
      closeModal(overlay, restoreFocus)
      resolve(true)
    })
    overlay.addEventListener('modal-cancel', () => resolve(false), { once: true })
    overlay.querySelector('[data-modal-cancel]')?.focus()
  })
}

function createModal({ title, body, footer, restoreFocus }) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head" id="modal-title">${escapeHtml(title)}</div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">${footer}</div>
    </div>
  `
  const cancel = () => {
    overlay.dispatchEvent(new CustomEvent('modal-cancel'))
    closeModal(overlay, restoreFocus)
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cancel() })
  overlay.querySelectorAll('[data-modal-cancel]').forEach((el) => el.addEventListener('click', cancel))
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  })
  document.body.appendChild(overlay)
  return overlay
}

function closeModal(overlay, restoreFocus) {
  overlay.remove()
  if (restoreFocus && typeof restoreFocus.focus === 'function') restoreFocus.focus()
}

function toast(message, state = 'error') {
  let wrap = document.querySelector('.toast-stack')
  if (!wrap) {
    wrap = document.createElement('div')
    wrap.className = 'toast-stack'
    document.body.appendChild(wrap)
  }
  const el = document.createElement('div')
  el.className = `toast ${state}`
  el.textContent = message
  wrap.appendChild(el)
  setTimeout(() => el.remove(), state === 'error' ? 5200 : 2600)
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

function escapeAttr(s) { return escapeHtml(s) }

function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/')
}
