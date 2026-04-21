const groupsEl = document.getElementById('groups')
const count = document.getElementById('count')
const empty = document.getElementById('empty')
const newFolderBtn = document.getElementById('new-folder')
const newDesignBtn = document.getElementById('new-design')

let files = []
let folders = []

// Scale each card's preview iframe to exactly match the card's rendered width.
const previewObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const iframe = entry.target.querySelector('iframe')
    if (!iframe) continue
    const w = entry.contentRect.width
    if (w > 0) iframe.style.transform = `scale(${w / 1080})`
  }
})

await refresh()

newFolderBtn.addEventListener('click', async () => {
  const name = prompt('New carousel folder name:')
  if (!name || !name.trim()) return
  const res = await fetch('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: name.trim() })
  })
  const json = await res.json()
  if (!res.ok) {
    alert('Could not create folder: ' + (json.error || 'unknown'))
    return
  }
  await refresh()
})

newDesignBtn.addEventListener('click', async () => {
  const res = await fetch('/api/new-design', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder: '' })
  })
  const json = await res.json()
  if (!res.ok) {
    alert('Could not create design: ' + (json.error || 'unknown'))
    return
  }
  location.href = `/editor?file=${encodeURIComponent(json.path)}`
})

document.addEventListener('click', (e) => {
  document.querySelectorAll('.card-menu').forEach((m) => {
    if (!m.contains(e.target)) m.classList.remove('open')
  })
})

async function refresh() {
  ;[files, folders] = await Promise.all([
    fetch('/api/files').then((r) => r.json()),
    fetch('/api/folders').then((r) => r.json())
  ])
  render()
}

function render() {
  groupsEl.innerHTML = ''
  count.textContent = `${files.length} design${files.length === 1 ? '' : 's'}`

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

  let rendered = 0
  for (const dir of order) {
    const items = byDir.get(dir) || []
    if (dir === '' && !items.length) continue
    const section = buildGroup(dir, items)
    groupsEl.appendChild(section)
    rendered += items.length
  }

  empty.hidden = !!(files.length || folders.length)
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
    carouselBtn.textContent = `Open as carousel →`
    carouselBtn.addEventListener('click', () => {
      const qs = items.map((i) => encodeURIComponent(i.path)).join(',')
      location.href = `/editor?files=${qs}`
    })
    header.appendChild(carouselBtn)
  }

  if (dir !== '') {
    const folderMenu = buildFolderMenu(dir, items.length)
    header.appendChild(folderMenu)
  }

  section.appendChild(header)

  if (!items.length) {
    const emptyRow = document.createElement('div')
    emptyRow.className = 'group-empty muted'
    emptyRow.textContent = 'Empty folder'

    const addBtn = document.createElement('button')
    addBtn.className = 'tb'
    addBtn.textContent = '+ Add first design'
    addBtn.addEventListener('click', () => createDesignInFolder(dir))
    emptyRow.appendChild(document.createTextNode(' '))
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
  const res = await fetch('/api/new-design', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder })
  })
  const json = await res.json()
  if (!res.ok) {
    alert('Could not create design: ' + (json.error || 'unknown'))
    return
  }
  location.href = `/editor?file=${encodeURIComponent(json.path)}`
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
  frame.appendChild(iframe)
  previewObserver.observe(frame)

  const label = document.createElement('div')
  label.className = 'label'
  label.title = f.path
  label.textContent = f.name

  const menu = buildCardMenu(f)

  card.appendChild(menu)
  card.appendChild(frame)
  card.appendChild(label)
  return card
}

function buildCardMenu(f) {
  const wrap = document.createElement('div')
  wrap.className = 'card-menu'

  const btn = document.createElement('button')
  btn.className = 'card-menu-btn'
  btn.textContent = '⋯'
  btn.title = 'Actions'
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

  pop.appendChild(menuItem('Move to…', () => {
    wrap.classList.remove('open')
    showMoveDialog(f)
  }))
  pop.appendChild(menuItem('Duplicate', async () => {
    wrap.classList.remove('open')
    const res = await fetch(`/api/file?path=${encodeURIComponent(f.path)}`)
    if (!res.ok) return
    const { content } = await res.json()
    // Create a new sibling, then overwrite with current content
    const dir = f.path.split('/').slice(0, -1).join('/')
    const createRes = await fetch('/api/new-design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: dir })
    })
    const createJson = await createRes.json()
    if (!createRes.ok) return
    await fetch(`/api/file?path=${encodeURIComponent(createJson.path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    })
    await refresh()
  }))
  pop.appendChild(menuItem('Rename…', async () => {
    wrap.classList.remove('open')
    const current = f.path.split('/').pop()
    const next = prompt('Rename to:', current)
    if (!next || next === current) return
    const dir = f.path.split('/').slice(0, -1).join('/')
    const newPath = dir ? `${dir}/${next}` : next
    const res = await fetch('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: f.path, to: newPath })
    })
    const json = await res.json()
    if (!res.ok) {
      alert('Rename failed: ' + (json.error || 'unknown'))
      return
    }
    await refresh()
  }))
  pop.appendChild(menuItem('Delete', async () => {
    wrap.classList.remove('open')
    if (!confirm(`Delete "${f.path}"? This cannot be undone.`)) return
    const res = await fetch(`/api/file?path=${encodeURIComponent(f.path)}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) {
      alert('Delete failed: ' + (json.error || 'unknown'))
      return
    }
    await refresh()
  }, 'danger'))

  wrap.appendChild(btn)
  wrap.appendChild(pop)
  return wrap
}

function buildFolderMenu(dir, fileCount) {
  const wrap = document.createElement('div')
  wrap.className = 'card-menu folder-menu'

  const btn = document.createElement('button')
  btn.className = 'card-menu-btn'
  btn.textContent = '⋯'
  btn.title = 'Folder actions'
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
  pop.appendChild(menuItem('Rename folder…', async () => {
    wrap.classList.remove('open')
    const parts = dir.split('/')
    const current = parts[parts.length - 1]
    const next = prompt('Rename folder to:', current)
    if (!next || next === current) return
    const parent = parts.slice(0, -1).join('/')
    const newPath = parent ? `${parent}/${next}` : next
    const res = await fetch('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: dir, to: newPath })
    })
    const json = await res.json()
    if (!res.ok) {
      alert('Rename failed: ' + (json.error || 'unknown'))
      return
    }
    await refresh()
  }))

  wrap.appendChild(btn)
  wrap.appendChild(pop)
  return wrap
}

function menuItem(label, handler, extraCls = '') {
  const b = document.createElement('button')
  b.className = 'menu-item' + (extraCls ? ' ' + extraCls : '')
  b.textContent = label
  b.addEventListener('click', handler)
  return b
}

function showMoveDialog(f) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'

  const modal = document.createElement('div')
  modal.className = 'modal'
  modal.innerHTML = `
    <div class="modal-head">Move "${escapeHtml(f.name)}"</div>
    <div class="modal-body">
      <div class="modal-section-title">Choose destination</div>
      <div class="folder-picker"></div>
      <div class="modal-section-title">Or create new folder</div>
      <div class="new-folder-row">
        <input type="text" placeholder="folder name" id="new-folder-input">
        <button class="tb" id="new-folder-go">Create &amp; move</button>
      </div>
    </div>
    <div class="modal-foot">
      <button class="tb" id="cancel-move">Cancel</button>
    </div>
  `

  const picker = modal.querySelector('.folder-picker')
  const destinations = ['', ...folders]
  const currentDir = f.path.split('/').slice(0, -1).join('/')
  for (const dest of destinations) {
    if (dest === currentDir) continue
    const row = document.createElement('button')
    row.className = 'folder-option'
    row.textContent = dest === '' ? '(standalone / root)' : dest
    row.addEventListener('click', async () => {
      await doMove(f, dest)
      overlay.remove()
    })
    picker.appendChild(row)
  }
  if (!picker.children.length) {
    picker.innerHTML = '<div class="muted" style="padding:6px 0">No other folders. Create one below.</div>'
  }

  modal.querySelector('#cancel-move').addEventListener('click', () => overlay.remove())
  modal.querySelector('#new-folder-go').addEventListener('click', async () => {
    const input = modal.querySelector('#new-folder-input')
    const val = input.value.trim()
    if (!val) return
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: val })
    })
    const json = await res.json()
    if (!res.ok) {
      alert('Folder creation failed: ' + (json.error || 'unknown'))
      return
    }
    await doMove(f, json.path)
    overlay.remove()
  })
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove()
  })
  overlay.appendChild(modal)
  document.body.appendChild(overlay)
  modal.querySelector('#new-folder-input')?.focus()
}

async function doMove(f, destDir) {
  const name = f.path.split('/').pop()
  const to = destDir ? `${destDir}/${name}` : name
  const res = await fetch('/api/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: f.path, to })
  })
  const json = await res.json()
  if (!res.ok) {
    alert('Move failed: ' + (json.error || 'unknown'))
    return
  }
  await refresh()
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/')
}
