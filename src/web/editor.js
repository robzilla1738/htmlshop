const params = new URLSearchParams(location.search)
const filesParam = params.get('files')
const fileParam = params.get('file')
const fileList = filesParam
  ? filesParam.split(',').map(decodeURIComponent).filter(Boolean)
  : (fileParam ? [fileParam] : [])
if (!fileList.length) location.href = '/'

document.getElementById('filename').textContent =
  fileList.length === 1 ? fileList[0] : `${fileList.length} designs`

const statusEl = document.getElementById('status')
const rootPathEl = document.getElementById('root-path')
const stagesContainer = document.getElementById('stages')
const canvas = document.getElementById('canvas')
const panel = document.getElementById('panel')
const layersBody = document.getElementById('layers-body')
const undoBtn = document.getElementById('undo')
const redoBtn = document.getElementById('redo')
const zoomInBtn = document.getElementById('zoom-in')
const zoomOutBtn = document.getElementById('zoom-out')
const zoomResetBtn = document.getElementById('zoom-reset')
const zoomFitBtn = document.getElementById('zoom-fit')
const addImageBtn = document.getElementById('add-image')
const imgInput = document.getElementById('img-input')
const exportBtn = document.getElementById('export')
const addArtboardBtn = document.getElementById('add-artboard')
const settingsBtn = document.getElementById('settings-btn')
const settingsPop = document.getElementById('settings-pop')
const settingHover = document.getElementById('setting-hover')
const settingActiveBorder = document.getElementById('setting-active-border')
const resizeOverlay = document.getElementById('resize-overlay')
const toggleLayersBtn = document.getElementById('toggle-layers')
const togglePanelBtn = document.getElementById('toggle-panel')

const OVERLAY_STYLE_ID = '__htmlshop_overlay__'
const SELECTED_ATTR = 'data-htmlshop-selected'
const HIDDEN_ATTR = 'data-htmlshop-hidden'
const LOCKED_ATTR = 'data-htmlshop-locked'
const TRANSIENT_ATTRS = [SELECTED_ATTR, HIDDEN_ATTR, LOCKED_ATTR]
const MAX_HISTORY = 100
const TRANSPARENT_WRAPPER_TAGS = new Set([
  'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'HEADER', 'FOOTER', 'NAV',
  'FIGURE', 'PICTURE', 'A', 'SPAN'
])

const STANDARD_FONTS = [
  'system-ui, sans-serif',
  'ui-sans-serif, sans-serif',
  'ui-serif, serif',
  'ui-monospace, monospace',
  '"DM Sans", sans-serif',
  'Arial, sans-serif',
  'Helvetica, Arial, sans-serif',
  '"Helvetica Neue", Helvetica, Arial, sans-serif',
  'Georgia, serif',
  '"Times New Roman", Times, serif',
  'Times, serif',
  '"Courier New", Courier, monospace',
  'Verdana, sans-serif',
  'Tahoma, sans-serif',
  '"Trebuchet MS", sans-serif',
  'Impact, sans-serif',
  '"Comic Sans MS", cursive',
  'Garamond, serif',
  'Palatino, serif',
  'Monaco, monospace',
  'Menlo, monospace'
]

const stages = []
let activeStage = null
let zoom = 1
let stagesLoaded = 0
let layerDrag = null
let modalSeq = 0

const settings = {
  hoverOutline: true,
  activeBorder: true
}

loadRootPath()

// Build stages
for (const f of fileList) {
  const wrap = document.createElement('div')
  wrap.className = 'stage-wrap'

  const label = document.createElement('div')
  label.className = 'stage-label'
  label.textContent = f
  wrap.appendChild(label)

  const iframe = document.createElement('iframe')
  iframe.className = 'stage'
  iframe.src = `/files/${encodePath(f)}`
  wrap.appendChild(iframe)

  stagesContainer.appendChild(wrap)

  const s = {
    file: f,
    iframe,
    wrap,
    label,
    history: [],
    historyIndex: -1,
    selected: null,
    saveTimer: null,
    saving: false,
    pendingSave: false,
    naturalW: 1080,
    naturalH: 1080
  }
  stages.push(s)
  iframe.addEventListener('load', () => onStageLoad(s))
}
activeStage = stages[0]

document.addEventListener('keydown', onParentKey)

undoBtn.addEventListener('click', () => undo())
redoBtn.addEventListener('click', () => redo())
zoomInBtn.addEventListener('click', () => setZoom(zoom * 1.25))
zoomOutBtn.addEventListener('click', () => setZoom(zoom / 1.25))
zoomResetBtn.addEventListener('click', () => setZoom(1))
zoomFitBtn.addEventListener('click', fitZoom)
addImageBtn.addEventListener('click', () => imgInput.click())
imgInput.addEventListener('change', onImagePicked)
exportBtn.addEventListener('click', exportPng)
addArtboardBtn.addEventListener('click', addArtboard)
toggleLayersBtn?.addEventListener('click', () => toggleCompactPanel('layers'))
togglePanelBtn?.addEventListener('click', () => toggleCompactPanel('properties'))

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  settingsPop.hidden = !settingsPop.hidden
})
document.addEventListener('click', (e) => {
  if (!settingsPop.contains(e.target) && e.target !== settingsBtn) {
    settingsPop.hidden = true
  }
})
// Transform-overlay plumbing
resizeOverlay.querySelectorAll('.rh').forEach((h) => {
  h.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    startResize(h.dataset.rh, e)
  })
})
canvas.addEventListener('scroll', updateResizeOverlay)
window.addEventListener('resize', updateResizeOverlay)

settingHover.addEventListener('change', () => {
  settings.hoverOutline = settingHover.checked
  stages.forEach((s) => s.iframe.contentDocument && refreshOverlayStyles(s))
})
settingActiveBorder.addEventListener('change', () => {
  settings.activeBorder = settingActiveBorder.checked
  stages.forEach((s) => s.wrap.classList.toggle('no-active-border', !settings.activeBorder))
})

// ─── Stage load ────────────────────────────────────────────────────────────

function onStageLoad(s) {
  const doc = s.iframe.contentDocument
  if (!doc) return

  // Adopt whatever size the design actually is. Most generated designs set
  // fixed body dimensions (width:1080px; height:1350px; etc.) — honor that.
  // Falling back to scrollHeight can be misleading if content has drifted
  // outside the intended canvas, so CSS-declared width/height wins.
  const body = doc.body
  const bodyCs = s.iframe.contentWindow.getComputedStyle(body)
  const declaredW = parseFloat(bodyCs.width)
  const declaredH = parseFloat(bodyCs.height)
  const w = (isFinite(declaredW) && declaredW > 0) ? declaredW
    : (body.scrollWidth || body.offsetWidth || 1080)
  const h = (isFinite(declaredH) && declaredH > 0) ? declaredH
    : (body.scrollHeight || body.offsetHeight || 1080)
  s.naturalW = w
  s.naturalH = h
  s.iframe.style.width = w + 'px'
  s.iframe.style.height = h + 'px'
  s.label.textContent = `${s.file}  ·  ${w} × ${h}`

  refreshOverlayStyles(s)

  doc.addEventListener('mousedown', (e) => onStageMouseDown(e, s), true)
  doc.addEventListener('click', swallowClick, true)
  doc.addEventListener('submit', (e) => e.preventDefault(), true)
  doc.addEventListener('keydown', (e) => onIframeKey(e, s))

  s.history = [doc.body.innerHTML]
  s.historyIndex = 0

  stagesLoaded++
  if (stagesLoaded === stages.length) {
    fitZoom()
    updateHistoryButtons()
    renderLayers()
  }
}

async function loadRootPath() {
  if (!rootPathEl) return
  try {
    const res = await fetch('/api/root')
    if (!res.ok) return
    const { root } = await res.json()
    rootPathEl.textContent = root
    rootPathEl.title = root
  } catch {}
}

function refreshOverlayStyles(s) {
  const doc = s.iframe.contentDocument
  if (!doc) return
  const existing = doc.getElementById(OVERLAY_STYLE_ID)
  existing?.remove()
  const style = doc.createElement('style')
  style.id = OVERLAY_STYLE_ID
  style.textContent = `
    [${SELECTED_ATTR}] {
      outline: 2px solid #4f8cff !important;
      outline-offset: 2px !important;
    }
    ${settings.hoverOutline ? `
      *:hover:not([${SELECTED_ATTR}]) {
        outline: 1px dashed rgba(79, 140, 255, 0.55) !important;
        outline-offset: 1px !important;
        cursor: pointer !important;
      }
      [${LOCKED_ATTR}]:hover,
      [${LOCKED_ATTR}] *:hover {
        outline: none !important;
        cursor: default !important;
      }
    ` : ''}
    [${HIDDEN_ATTR}] {
      display: none !important;
    }
  `
  doc.head.appendChild(style)
}

function swallowClick(e) {
  e.preventDefault()
  e.stopPropagation()
}

function onStageMouseDown(e, s) {
  e.preventDefault()
  e.stopPropagation()
  setActiveStage(s)
  const target = e.target
  if (isLockedForEditing(target) || isHiddenForEditing(target)) return
  selectElement(s, target)
  // Any element is draggable: static/relative elements auto-promote to absolute
  // on first move so the design layout isn't disturbed by a simple click.
  if (target !== s.iframe.contentDocument.body) {
    startDrag(s, target, e)
  }
}

function setActiveStage(s) {
  if (activeStage === s) return
  if (activeStage && activeStage.selected) {
    activeStage.selected.removeAttribute(SELECTED_ATTR)
    activeStage.selected = null
  }
  activeStage = s
  stages.forEach((st) => st.wrap.classList.toggle('active', st === s))
  renderLayers()
  updateResizeOverlay()
}

function toggleCompactPanel(panelName) {
  const layersOpen = panelName === 'layers' ? !document.body.classList.contains('show-layers') : false
  const panelOpen = panelName === 'properties' ? !document.body.classList.contains('show-properties') : false
  document.body.classList.toggle('show-layers', layersOpen)
  document.body.classList.toggle('show-properties', panelOpen)
  syncCompactPanelButtons()
}

function closeCompactPanels() {
  document.body.classList.remove('show-layers', 'show-properties')
  syncCompactPanelButtons()
}

function syncCompactPanelButtons() {
  toggleLayersBtn?.setAttribute('aria-expanded', String(document.body.classList.contains('show-layers')))
  togglePanelBtn?.setAttribute('aria-expanded', String(document.body.classList.contains('show-properties')))
}

function startDrag(s, el, startEvent) {
  if (isLockedForEditing(el) || isHiddenForEditing(el)) return
  const doc = s.iframe.contentDocument
  const win = s.iframe.contentWindow

  // Photoshop-style workspace: first interaction freezes the document so
  // elements stop reflowing around each other. After this, drags just move
  // the selected element — siblings stay put.
  freezeDocumentLayout(doc, win)

  const cs = win.getComputedStyle(el)
  const startX = startEvent.clientX
  const startY = startEvent.clientY
  const origLeft = parseFloat(cs.left) || 0
  const origTop = parseFloat(cs.top) || 0
  let moved = false

  const onMove = (e) => {
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (!moved && Math.hypot(dx, dy) < 3) return
    moved = true
    el.style.left = Math.round(origLeft + dx) + 'px'
    el.style.top = Math.round(origTop + dy) + 'px'
    updateResizeOverlay()
  }
  const cleanup = () => {
    doc.removeEventListener('mousemove', onMove, true)
    doc.removeEventListener('mouseup', onUp, true)
    win.removeEventListener('blur', cleanup)
  }
  const onUp = () => {
    cleanup()
    if (moved) {
      scheduleSave(s)
      if (s.selected === el) renderPanel(s, el)
    }
  }
  doc.addEventListener('mousemove', onMove, true)
  doc.addEventListener('mouseup', onUp, true)
  // Safety net: if the iframe loses focus mid-drag (e.g. user alt-tabs), release.
  win.addEventListener('blur', cleanup)
}

/**
 * Convert the document's layout to absolute positioning at the current
 * rendered coordinates of every element. After this, nothing reflows —
 * elements stay where they're placed, matching a Photoshop-style canvas.
 * Idempotent: already-absolute elements are left alone.
 */
function freezeDocumentLayout(doc, win) {
  if (!doc || !doc.body) return

  const body = doc.body
  const elements = Array.from(doc.querySelectorAll('body *'))
    .filter((el) => !isStructuralTag(el))

  // Measure everything — element rects AND their offsetParent rects — BEFORE
  // any mutation. position:absolute anchors to the nearest positioned ancestor
  // (the offsetParent), not always body. Mixing up the reference frame was
  // what caused elements to drift and body.scrollHeight to balloon on reload.
  const measurements = elements.map((el) => {
    const rect = el.getBoundingClientRect()
    const cs = win.getComputedStyle(el)
    const alreadyAbs = cs.position === 'absolute' || cs.position === 'fixed'
    const parent = el.offsetParent || body
    const parentRect = parent.getBoundingClientRect()
    const parentCs = win.getComputedStyle(parent)
    const borderL = parseFloat(parentCs.borderLeftWidth) || 0
    const borderT = parseFloat(parentCs.borderTopWidth) || 0
    return { el, rect, parentRect, borderL, borderT, alreadyAbs }
  })

  // Body becomes a positioning context for any descendants whose offsetParent
  // would have fallen through to it.
  const bodyCs = win.getComputedStyle(body)
  if (bodyCs.position === 'static') body.style.position = 'relative'

  for (const m of measurements) {
    if (m.alreadyAbs) continue
    const { el, rect, parentRect, borderL, borderT } = m
    el.style.position = 'absolute'
    el.style.left = Math.round(rect.left - parentRect.left - borderL) + 'px'
    el.style.top = Math.round(rect.top - parentRect.top - borderT) + 'px'
    el.style.width = Math.round(rect.width) + 'px'
    el.style.height = Math.round(rect.height) + 'px'
    el.style.margin = '0'
  }
}

function beginPointerCapture(cursor) {
  for (const st of stages) st.iframe.style.pointerEvents = 'none'
  document.body.style.cursor = cursor || 'default'
  document.body.style.userSelect = 'none'
}
function endPointerCapture() {
  for (const st of stages) st.iframe.style.pointerEvents = ''
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// ─── Selection + panel ─────────────────────────────────────────────────────

function selectElement(s, el) {
  const doc = s.iframe.contentDocument
  if (!el || el === doc.documentElement) return
  if (el !== doc.body && (isLockedForEditing(el) || isHiddenForEditing(el))) return
  if (s.selected) s.selected.removeAttribute(SELECTED_ATTR)
  s.selected = el
  s.selected.setAttribute(SELECTED_ATTR, '')
  setActiveStage(s)
  renderPanel(s, el)
  renderLayers()
  updateResizeOverlay()
}

function deselect() {
  if (activeStage && activeStage.selected) {
    activeStage.selected.removeAttribute(SELECTED_ATTR)
    activeStage.selected = null
  }
  panel.innerHTML = '<div class="empty-state">Click any element in the design to edit.</div>'
  renderLayers()
  updateResizeOverlay()
}

function updateResizeOverlay() {
  const s = activeStage
  if (!s || !s.selected || s.selected === s.iframe.contentDocument.body) {
    resizeOverlay.hidden = true
    return
  }
  const iframeRect = s.iframe.getBoundingClientRect()
  const elemRect = s.selected.getBoundingClientRect()
  const left = iframeRect.left + elemRect.left * zoom
  const top = iframeRect.top + elemRect.top * zoom
  const width = elemRect.width * zoom
  const height = elemRect.height * zoom
  if (width < 4 || height < 4) {
    resizeOverlay.hidden = true
    return
  }
  resizeOverlay.style.left = left + 'px'
  resizeOverlay.style.top = top + 'px'
  resizeOverlay.style.width = width + 'px'
  resizeOverlay.style.height = height + 'px'
  resizeOverlay.hidden = false
}

function startResize(corner, startEvent) {
  const s = activeStage
  if (!s || !s.selected) return
  const el = s.selected
  if (isLockedForEditing(el) || isHiddenForEditing(el)) return
  const doc = s.iframe.contentDocument
  const win = s.iframe.contentWindow

  // Lock the layout before resizing so nothing else reflows.
  freezeDocumentLayout(doc, win)

  const cs = win.getComputedStyle(el)
  const left = parseFloat(cs.left) || 0
  const top = parseFloat(cs.top) || 0
  const width = parseFloat(cs.width) || 0
  const height = parseFloat(cs.height) || 0

  // startEvent comes from parent (handle in parent DOM) — its clientX/Y are
  // already in parent-window coords.
  const startX = startEvent.clientX
  const startY = startEvent.clientY
  const startLeft = left
  const startTop = top
  const startWidth = width
  const startHeight = height

  const west = corner.includes('w')
  const east = corner.includes('e')
  const north = corner.includes('n')
  const south = corner.includes('s')

  beginPointerCapture(cursorForCorner(corner))

  const onMove = (e) => {
    const dx = (e.clientX - startX) / zoom
    const dy = (e.clientY - startY) / zoom
    let newLeft = startLeft
    let newTop = startTop
    let newWidth = startWidth
    let newHeight = startHeight
    if (east) newWidth = Math.max(4, startWidth + dx)
    if (south) newHeight = Math.max(4, startHeight + dy)
    if (west) {
      newWidth = Math.max(4, startWidth - dx)
      newLeft = startLeft + (startWidth - newWidth)
    }
    if (north) {
      newHeight = Math.max(4, startHeight - dy)
      newTop = startTop + (startHeight - newHeight)
    }
    el.style.left = Math.round(newLeft) + 'px'
    el.style.top = Math.round(newTop) + 'px'
    el.style.width = Math.round(newWidth) + 'px'
    el.style.height = Math.round(newHeight) + 'px'
    updateResizeOverlay()
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove, true)
    window.removeEventListener('mouseup', onUp, true)
    endPointerCapture()
    scheduleSave(s)
    if (s.selected === el) renderPanel(s, el)
  }
  window.addEventListener('mousemove', onMove, true)
  window.addEventListener('mouseup', onUp, true)
}

function cursorForCorner(c) {
  if (c === 'nw' || c === 'se') return 'nwse-resize'
  if (c === 'ne' || c === 'sw') return 'nesw-resize'
  if (c === 'n' || c === 's') return 'ns-resize'
  if (c === 'e' || c === 'w') return 'ew-resize'
  return 'default'
}

function renderPanel(s, el) {
  const cs = s.iframe.contentWindow.getComputedStyle(el)
  const tag = el.tagName.toLowerCase()
  if (el === s.iframe.contentDocument.body) {
    renderBodyPanel(s, el, cs)
    return
  }

  const hasChildElements = el.children.length > 0
  const cls = el.className && typeof el.className === 'string'
    ? el.className.trim().split(/\s+/).filter(Boolean).map((c) => '.' + c).join('')
    : ''
  const id = el.id ? '#' + el.id : ''

  const isBold = parseInt(cs.fontWeight, 10) >= 600
  const isItalic = cs.fontStyle === 'italic' || cs.fontStyle === 'oblique'
  const isUnderline = /underline/.test(cs.textDecorationLine || cs.textDecoration || '')

  const position = cs.position
  const isAbsolute = position === 'absolute' || position === 'fixed'

  const fonts = getAvailableFonts()
  const currentFont = cs.fontFamily
  const bgShort = el.style.background || ''

  // Show the Text section when the element has text content we can safely edit:
  // leaves have whole textContent, elements with direct text nodes have those
  // nodes (children are preserved).
  const directText = getDirectText(el)
  const textEditable = !hasChildElements || directText.length > 0
  const textValue = !hasChildElements ? (el.textContent ?? '') : directText

  panel.innerHTML = `
    <div class="meta">
      <div class="meta-ident">
        <span class="tag">&lt;${tag}&gt;</span>
        ${id ? `<span class="cls">${escapeHtml(id)}</span>` : ''}
        ${cls ? `<span class="cls">${escapeHtml(cls)}</span>` : ''}
      </div>
      <div class="meta-actions">
        <button id="to-front" class="meta-btn" title="Bring to front" aria-label="Bring to front">↑</button>
        <button id="to-back" class="meta-btn" title="Send to back" aria-label="Send to back">↓</button>
        <button id="duplicate-el" class="meta-btn" title="Duplicate (⌘D)">Dup</button>
        <button id="delete-el" class="meta-btn meta-btn-danger" title="Delete (⌫)">Del</button>
      </div>
    </div>

    ${textEditable ? `
      <div class="section">
        <div class="section-title">Text${hasChildElements ? ' (this element only)' : ''}</div>
        <textarea id="text" rows="3">${escapeHtml(textValue)}</textarea>
      </div>
    ` : ''}

    <div class="section">
      <div class="section-title">Text Style</div>
      <div class="tool-row">
        <button class="tool" data-tool="bold" aria-pressed="${isBold}"><b>B</b></button>
        <button class="tool" data-tool="italic" aria-pressed="${isItalic}"><i>I</i></button>
        <button class="tool" data-tool="underline" aria-pressed="${isUnderline}"><u>U</u></button>
        <span class="tool-gap"></span>
        <button class="tool tool-narrow" data-size-delta="-2" title="Smaller">A−</button>
        <button class="tool tool-narrow" data-size-delta="2" title="Larger">A+</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Typography</div>
      ${fontFamilyField(currentFont, fonts)}
      ${numberWithUnit('font-size', cs.fontSize)}
      ${selectFieldStr('font-weight', String(cs.fontWeight || '400'), ['100','200','300','400','500','600','700','800','900'])}
      ${numberWithUnit('line-height', cs.lineHeight === 'normal' ? '' : cs.lineHeight, { unitless: true })}
      ${numberWithUnit('letter-spacing', cs.letterSpacing === 'normal' ? '' : cs.letterSpacing)}
      ${colorFieldWithClear('color', cs.color)}
      ${selectFieldStr('text-align', cs.textAlign || 'start', ['start','left','center','right','justify'])}
      ${selectFieldStr('text-transform', cs.textTransform || 'none', ['none','uppercase','lowercase','capitalize'])}
    </div>

    <div class="section">
      <div class="section-title">Layout</div>
      ${selectFieldStr('display', cs.display, guessDisplayOptions(cs.display))}
      ${selectFieldStr('position', position, ['static','relative','absolute','fixed','sticky'])}
      ${isAbsolute ? `
        ${inputField('top', cs.top, 'text')}
        ${inputField('left', cs.left, 'text')}
        ${inputField('right', cs.right, 'text')}
        ${inputField('bottom', cs.bottom, 'text')}
        ${inputField('z-index', cs.zIndex === 'auto' ? '' : cs.zIndex, 'text')}
      ` : ''}
      ${inputField('width', cs.width, 'text')}
      ${inputField('height', cs.height, 'text')}
      ${inputField('padding', cs.padding, 'text')}
      ${inputField('margin', cs.margin, 'text')}
      ${inputField('gap', cs.gap, 'text')}
      ${selectFieldStr('overflow', cs.overflow || 'visible', ['visible','hidden','scroll','auto','clip'])}
      ${selectFieldStr('visibility', cs.visibility || 'visible', ['visible','hidden','collapse'])}
    </div>

    <div class="section">
      <div class="section-title">Background</div>
      ${colorFieldWithClear('background-color', cs.backgroundColor)}
      ${inputField('background', bgShort, 'text')}
      <div class="hint">Use background for gradients / images. e.g. <code>linear-gradient(135deg,#f00,#00f)</code></div>
    </div>

    <div class="section">
      <div class="section-title">Border &amp; Effects</div>
      ${inputField('border', cs.border, 'text')}
      ${inputField('border-radius', cs.borderRadius, 'text')}
      ${inputField('box-shadow', cs.boxShadow === 'none' ? '' : cs.boxShadow, 'text')}
      ${numberWithUnit('opacity', String(cs.opacity), { unitless: true })}
      ${selectFieldStr('mix-blend-mode', cs.mixBlendMode || 'normal', ['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity'])}
    </div>
  `

  bindStyleInputs(s, el)
  panel.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => toggleTool(s, el, btn.dataset.tool))
  })
  panel.querySelectorAll('[data-size-delta]').forEach((btn) => {
    btn.addEventListener('click', () => adjustFontSize(s, el, Number(btn.dataset.sizeDelta)))
  })
  const text = panel.querySelector('#text')
  if (text) {
    text.addEventListener('input', () => {
      if (el.children.length === 0) {
        // Leaf: safe to replace the whole textContent.
        el.textContent = text.value
      } else {
        // Element has children; only replace its direct text nodes so nested
        // elements (spans, line breaks, etc.) stay intact.
        const directNodes = [...el.childNodes].filter((n) => n.nodeType === 3)
        directNodes.forEach((n) => n.remove())
        if (text.value) {
          el.insertBefore(el.ownerDocument.createTextNode(text.value), el.firstChild)
        }
      }
      scheduleSave(s)
      renderLayers()
    })
  }
  panel.querySelector('#delete-el')?.addEventListener('click', deleteSelected)
  panel.querySelector('#duplicate-el')?.addEventListener('click', duplicateSelected)
  panel.querySelector('#to-front')?.addEventListener('click', () => { bringToFront(s, el); renderPanel(s, el) })
  panel.querySelector('#to-back')?.addEventListener('click', () => { sendToBack(s, el); renderPanel(s, el) })
}

function renderBodyPanel(s, el, cs) {
  const fonts = getAvailableFonts()
  const currentFont = cs.fontFamily
  const bgShort = el.style.background || ''

  panel.innerHTML = `
    <div class="meta meta-canvas">
      <div class="meta-ident">
        <span class="tag">Canvas</span>
        <span class="cls">background</span>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Canvas</div>
      ${inputField('width', cs.width, 'text')}
      ${inputField('height', cs.height, 'text')}
      ${selectFieldStr('overflow', cs.overflow || 'hidden', ['hidden','visible','clip','auto','scroll'])}
    </div>

    <div class="section">
      <div class="section-title">Background</div>
      ${colorFieldWithClear('background-color', cs.backgroundColor)}
      ${inputField('background', bgShort, 'text')}
      <div class="hint">Use background for gradients / images. e.g. <code>linear-gradient(135deg,#f00,#00f)</code></div>
    </div>

    <div class="section">
      <div class="section-title">Default Text</div>
      ${fontFamilyField(currentFont, fonts)}
      ${colorFieldWithClear('color', cs.color)}
    </div>
  `

  bindStyleInputs(s, el)
}

function bindStyleInputs(s, el) {
  panel.querySelectorAll('[data-prop]').forEach((inp) => {
    inp.addEventListener('input', () => applyStyleFromInput(s, el, inp))
    inp.addEventListener('change', () => applyStyleFromInput(s, el, inp))
  })
}

function guessDisplayOptions(current) {
  const base = ['block','inline','inline-block','flex','inline-flex','grid','inline-grid','none','contents']
  if (current && !base.includes(current)) base.unshift(current)
  return base
}

function toggleTool(s, el, tool) {
  const cs = s.iframe.contentWindow.getComputedStyle(el)
  if (tool === 'bold') {
    const isBold = parseInt(cs.fontWeight, 10) >= 600
    el.style.fontWeight = isBold ? '400' : '700'
  } else if (tool === 'italic') {
    const isItalic = cs.fontStyle === 'italic' || cs.fontStyle === 'oblique'
    el.style.fontStyle = isItalic ? 'normal' : 'italic'
  } else if (tool === 'underline') {
    const isUnderline = /underline/.test(cs.textDecorationLine || cs.textDecoration || '')
    el.style.textDecoration = isUnderline ? 'none' : 'underline'
  }
  renderPanel(s, el)
  scheduleSave(s)
}

function adjustFontSize(s, el, delta) {
  const cs = s.iframe.contentWindow.getComputedStyle(el)
  const m = /^(-?[\d.]+)(px|em|rem|%)?$/.exec(cs.fontSize)
  if (!m) return
  const next = Math.max(1, parseFloat(m[1]) + delta)
  el.style.fontSize = next + (m[2] || 'px')
  renderPanel(s, el)
  scheduleSave(s)
}

function bringToFront(s, el) {
  if (!canReorderLayer(s, el)) return
  const order = getLayerStackOrder(s)
  if (!order.includes(el)) return
  normalizeLayerStack(s, [el, ...order.filter((item) => item !== el)])
  scheduleSave(s)
  renderLayers()
}

function sendToBack(s, el) {
  if (!canReorderLayer(s, el)) return
  const order = getLayerStackOrder(s)
  if (!order.includes(el)) return
  normalizeLayerStack(s, [...order.filter((item) => item !== el), el])
  scheduleSave(s)
  renderLayers()
}

// ─── Field generators ──────────────────────────────────────────────────────

function inputField(prop, value, type) {
  return `
    <div class="field">
      <label>${prop}</label>
      <input data-prop="${prop}" type="${type}" value="${escapeAttr(value ?? '')}">
    </div>`
}

function numberWithUnit(prop, cssValue, opts = {}) {
  const unitless = opts.unitless === true
  const m = /^(-?[\d.]+)(px|em|rem|%)?$/.exec(String(cssValue).trim())
  const num = m ? m[1] : ''
  const unit = m ? (m[2] || (unitless ? '' : 'px')) : (unitless ? '' : 'px')
  const units = unitless ? ['', 'px', 'em', 'rem', '%'] : ['px', 'em', 'rem', '%']
  return `
    <div class="field">
      <label>${prop}</label>
      <div class="num-unit">
        <input data-prop="${prop}" data-kind="num" type="number" step="any" value="${escapeAttr(num)}">
        <select data-prop="${prop}" data-kind="unit">
          ${units.map((u) => `<option value="${u}" ${u === unit ? 'selected' : ''}>${u || '—'}</option>`).join('')}
        </select>
      </div>
    </div>`
}

function colorFieldWithClear(prop, cssValue) {
  const { hex, isTransparent } = parseColor(cssValue)
  const pickerValue = hex || '#000000'
  const textValue = isTransparent ? '' : (hex || cssValue || '')
  return `
    <div class="field">
      <label>${prop}</label>
      <div class="color-row">
        <input data-prop="${prop}" data-kind="color" type="color" value="${pickerValue}">
        <input data-prop="${prop}" data-kind="color-text" type="text" value="${escapeAttr(textValue)}" placeholder="transparent">
      </div>
    </div>`
}

function selectFieldStr(prop, value, options) {
  return `
    <div class="field">
      <label>${prop}</label>
      <select data-prop="${prop}">
        ${options.map((o) => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('')}
      </select>
    </div>`
}

function fontFamilyField(currentValue, fonts) {
  const current = (currentValue || '').trim()
  const opts = fonts.slice()
  const inList = opts.some((f) => normalizeFont(f) === normalizeFont(current))
  if (current && !inList) opts.unshift(current)
  const selectedVal = inList ? opts.find((f) => normalizeFont(f) === normalizeFont(current)) : current

  const options = opts
    .map((f) => {
      const label = f.split(',')[0].replace(/['"]/g, '').trim()
      const sel = f === selectedVal ? 'selected' : ''
      return `<option value="${escapeAttr(f)}" ${sel}>${escapeHtml(label)}</option>`
    })
    .join('')

  return `
    <div class="field">
      <label>font-family</label>
      <select data-prop="font-family" data-kind="font-select">
        ${options}
        <option value="__custom__">Custom…</option>
      </select>
    </div>
    <div class="field font-custom" data-for="font-family" hidden>
      <label>custom</label>
      <input data-prop="font-family" data-kind="font-text" type="text" value="${escapeAttr(current)}" placeholder='"My Font", serif'>
    </div>`
}

function normalizeFont(f) {
  return String(f).toLowerCase().replace(/['"]/g, '').replace(/\s+/g, '')
}

function getAvailableFonts() {
  const fonts = new Set(STANDARD_FONTS)
  for (const s of stages) {
    const doc = s.iframe.contentDocument
    if (!doc) continue
    doc.querySelectorAll('body, body *').forEach((el) => {
      const ff = s.iframe.contentWindow.getComputedStyle(el).fontFamily
      if (ff) fonts.add(ff)
    })
  }
  return Array.from(fonts).sort((a, b) => a.localeCompare(b))
}

// ─── Style apply ───────────────────────────────────────────────────────────

function applyStyleFromInput(s, el, inp) {
  const prop = inp.dataset.prop
  const kind = inp.dataset.kind

  if (kind === 'num' || kind === 'unit') {
    const numInput = panel.querySelector(`input[data-prop="${prop}"][data-kind="num"]`)
    const unitSel = panel.querySelector(`select[data-prop="${prop}"][data-kind="unit"]`)
    const num = numInput?.value ?? ''
    const unit = unitSel?.value ?? ''
    const val = num === '' ? '' : `${num}${unit}`
    el.style.setProperty(prop, val)
  } else if (kind === 'color') {
    // When the user picks a background-color, make sure any existing
    // background-image (gradient, url()) doesn't hide the color.
    if (prop === 'background-color') {
      el.style.removeProperty('background')
      el.style.setProperty('background-image', 'none')
    }
    el.style.setProperty(prop, inp.value)
    const text = panel.querySelector(`input[data-prop="${prop}"][data-kind="color-text"]`)
    if (text) text.value = inp.value
  } else if (kind === 'color-text') {
    const v = inp.value.trim()
    if (prop === 'background-color' && v) {
      el.style.removeProperty('background')
      el.style.setProperty('background-image', 'none')
    }
    el.style.setProperty(prop, v || 'transparent')
    const picker = panel.querySelector(`input[data-prop="${prop}"][data-kind="color"]`)
    if (picker && /^#[0-9a-f]{6}$/i.test(v)) picker.value = v
  } else if (kind === 'font-select') {
    const customRow = panel.querySelector(`.font-custom[data-for="${prop}"]`)
    if (inp.value === '__custom__') {
      if (customRow) {
        customRow.hidden = false
        customRow.querySelector('input')?.focus()
      }
      return
    }
    if (customRow) customRow.hidden = true
    el.style.setProperty(prop, inp.value)
  } else if (kind === 'font-text') {
    el.style.setProperty(prop, inp.value)
  } else {
    el.style.setProperty(prop, inp.value)
    if (prop === 'position') renderPanel(s, el)
  }
  scheduleSave(s)
  updateResizeOverlay()
}

// ─── Layers panel ──────────────────────────────────────────────────────────

function renderLayers() {
  layersBody.innerHTML = ''
  if (!stages.length) return
  for (const s of stages) {
    const doc = s.iframe.contentDocument
    if (!doc) continue

    const header = document.createElement('div')
    header.className = 'layers-stage' + (s === activeStage ? ' active' : '')
    header.addEventListener('click', () => setActiveStage(s))

    const title = document.createElement('span')
    title.className = 'layers-stage-name'
    title.textContent = s.file

    const actions = document.createElement('span')
    actions.className = 'layers-stage-actions'

    const rename = document.createElement('button')
    rename.className = 'layer-stage-action'
    rename.type = 'button'
    rename.title = 'Rename artboard'
    rename.setAttribute('aria-label', `Rename ${s.file}`)
    rename.textContent = '✎'
    rename.addEventListener('click', (e) => {
      e.stopPropagation()
      setActiveStage(s)
      renameArtboard()
    })

    const del = document.createElement('button')
    del.className = 'layer-stage-action danger'
    del.type = 'button'
    del.title = 'Delete artboard'
    del.setAttribute('aria-label', `Delete ${s.file}`)
    del.textContent = '⌫'
    del.addEventListener('click', (e) => {
      e.stopPropagation()
      setActiveStage(s)
      deleteArtboard()
    })

    actions.appendChild(rename)
    actions.appendChild(del)
    header.appendChild(title)
    header.appendChild(actions)
    layersBody.appendChild(header)

    for (const entry of collectVisualLayers(s)) {
      renderLayerRow(layersBody, s, entry)
    }
  }
}

function renderLayerRow(container, s, entry) {
  const el = entry.el
  const doc = s.iframe.contentDocument
  const isBody = el === doc.body
  const isHidden = isLayerHidden(el)
  const isLocked = isLayerLocked(el)
  const canDrag = canReorderLayer(s, el)
  const row = document.createElement('div')
  row.className = 'layer-row'
  if (isBody) row.classList.add('pinned')
  if (entry.nested) row.classList.add('nested')
  if (isHidden) row.classList.add('hidden-layer')
  if (isLocked) row.classList.add('locked')
  if (s === activeStage && s.selected === el) row.classList.add('selected')

  const grip = document.createElement('span')
  grip.className = 'layer-grip'
  grip.textContent = canDrag ? '⋮⋮' : ''
  grip.title = canDrag ? 'Drag to reorder' : ''
  if (canDrag) {
    row.draggable = true
    row.title = 'Click to select. Drag up or down to reorder.'
    row.addEventListener('dragstart', (e) => {
      if (e.target.closest('button')) {
        e.preventDefault()
        return
      }
      beginLayerRowDrag(s, el, row, e)
    })
    row.addEventListener('dragend', () => endLayerRowDrag(row))
  }

  const eye = document.createElement('button')
  eye.className = 'layer-icon layer-eye'
  eye.type = 'button'
  eye.textContent = isHidden ? '○' : '●'
  eye.title = isBody ? 'Background stays visible' : (isHidden ? 'Show layer' : 'Hide layer')
  eye.setAttribute('aria-label', eye.title)
  eye.disabled = isBody
  eye.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleLayerVisibility(s, el)
  })

  const lock = document.createElement('button')
  lock.className = 'layer-icon layer-lock'
  lock.type = 'button'
  lock.textContent = isLocked ? '🔒' : '🔓'
  lock.title = isBody ? 'Background cannot be locked' : (isLocked ? 'Unlock layer' : 'Lock layer')
  lock.setAttribute('aria-label', lock.title)
  lock.disabled = isBody
  lock.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleLayerLock(s, el)
  })

  const name = document.createElement('span')
  name.className = 'layer-name'
  name.textContent = describeElement(el)

  row.appendChild(grip)
  row.appendChild(eye)
  row.appendChild(lock)
  row.appendChild(name)
  row.addEventListener('click', () => {
    setActiveStage(s)
    if (isHidden || isLockedForEditing(el)) return
    selectElement(s, el)
  })
  row.addEventListener('dragover', (e) => {
    if (!layerDrag || layerDrag.s !== s || layerDrag.el === el) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = row.getBoundingClientRect()
    const before = isBody || e.clientY < rect.top + rect.height / 2
    setLayerDropMarker(row, before ? 'before' : 'after')
  })
  row.addEventListener('drop', (e) => {
    if (!layerDrag || layerDrag.s !== s || layerDrag.el === el) return
    e.preventDefault()
    const rect = row.getBoundingClientRect()
    const placement = isBody || e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    moveLayerByDrop(s, layerDrag.el, el, placement)
    layerDrag = null
  })
  container.appendChild(row)
}

function beginLayerRowDrag(s, el, row, e) {
  layerDrag = { s, el }
  row.classList.add('dragging')
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', describeElement(el))
}

function endLayerRowDrag(row) {
  row.classList.remove('dragging')
  clearLayerDropMarkers()
  layerDrag = null
}

function setLayerDropMarker(row, placement) {
  clearLayerDropMarkers()
  row.classList.add(placement === 'before' ? 'drop-before' : 'drop-after')
}

function clearLayerDropMarkers() {
  layersBody.querySelectorAll('.drop-before, .drop-after')
    .forEach((row) => row.classList.remove('drop-before', 'drop-after'))
}

function moveLayerByDrop(s, dragged, target, placement) {
  if (!canReorderLayer(s, dragged)) return
  const doc = s.iframe.contentDocument
  const order = getLayerStackOrder(s)
  if (!order.includes(dragged)) return

  const next = order.filter((el) => el !== dragged)
  let targetIndex = target === doc.body ? next.length : next.indexOf(target)
  if (targetIndex < 0) return
  if (placement === 'after' && target !== doc.body) targetIndex += 1
  next.splice(targetIndex, 0, dragged)

  if (order.length === next.length && order.every((el, i) => el === next[i])) {
    clearLayerDropMarkers()
    return
  }

  normalizeLayerStack(s, next)
  scheduleSave(s)
  renderLayers()
  if (s.selected) renderPanel(s, s.selected)
}

function getLayerStackOrder(s) {
  return collectVisualLayers(s)
    .map((entry) => entry.el)
    .filter((el) => canReorderLayer(s, el))
}

function normalizeLayerStack(s, orderedTopFirst) {
  const win = s.iframe.contentWindow
  const count = orderedTopFirst.length
  orderedTopFirst.forEach((el, index) => {
    const cs = win.getComputedStyle(el)
    if (cs.position === 'static') el.style.position = 'relative'
    el.style.zIndex = String(count - index)
  })
}

function canReorderLayer(s, el) {
  const doc = s.iframe.contentDocument
  return !!el && el !== doc.body && !isLockedForEditing(el) && getLayerStackAnchor(s, el) === el
}

function toggleLayerVisibility(s, el) {
  const doc = s.iframe.contentDocument
  if (!el || el === doc.body) return
  const willHide = !isLayerHidden(el)
  if (willHide) el.setAttribute(HIDDEN_ATTR, '')
  else el.removeAttribute(HIDDEN_ATTR)
  if (willHide) clearSelectionInside(s, el)
  renderLayers()
  updateResizeOverlay()
}

function toggleLayerLock(s, el) {
  const doc = s.iframe.contentDocument
  if (!el || el === doc.body) return
  if (isLayerLocked(el)) {
    el.removeAttribute(LOCKED_ATTR)
  } else {
    el.setAttribute(LOCKED_ATTR, '')
    clearSelectionInside(s, el)
  }
  renderLayers()
  updateResizeOverlay()
}

function isLayerHidden(el) {
  return !!el?.hasAttribute?.(HIDDEN_ATTR)
}

function clearSelectionInside(s, el) {
  if (!s.selected || (s.selected !== el && !el.contains(s.selected))) return
  s.selected.removeAttribute(SELECTED_ATTR)
  s.selected = null
  panel.innerHTML = '<div class="empty-state">Click any element in the design to edit.</div>'
}

function isLayerLocked(el) {
  return !!el?.hasAttribute?.(LOCKED_ATTR)
}

function isLockedForEditing(el) {
  return !!el?.closest?.(`[${LOCKED_ATTR}]`)
}

function isHiddenForEditing(el) {
  return !!el?.closest?.(`[${HIDDEN_ATTR}]`)
}

function collectVisualLayers(s) {
  const doc = s.iframe.contentDocument
  const win = s.iframe.contentWindow
  const entries = []
  let domIndex = 0

  const visit = (el) => {
    if (isStructuralTag(el)) return
    domIndex += 1

    if (el !== doc.body && (isLayerHidden(el) || isLayerLocked(el))) {
      entries.push(layerEntry(s, el, domIndex))
      return
    }

    if (el !== doc.body && isTransparentWrapper(el, win)) {
      for (const child of el.children) visit(child)
      return
    }

    if (el !== doc.body && isLayerObject(el, win)) {
      entries.push(layerEntry(s, el, domIndex))
    }

    for (const child of el.children) visit(child)
  }

  for (const child of doc.body.children) visit(child)

  entries.sort((a, b) => {
    if (b.z !== a.z) return b.z - a.z
    if (b.depth !== a.depth) return b.depth - a.depth
    return b.domIndex - a.domIndex
  })
  entries.push({ el: doc.body, z: -Infinity, depth: 0, domIndex: -1, nested: false, pinned: true })
  return entries
}

function layerEntry(s, el, domIndex) {
  const win = s.iframe.contentWindow
  const anchor = getLayerStackAnchor(s, el)
  const z = parseInt(win.getComputedStyle(anchor).zIndex, 10)
  return {
    el,
    z: isNaN(z) ? 0 : z,
    depth: layerDepth(s, el),
    domIndex,
    nested: anchor !== el,
    pinned: false
  }
}

function getLayerStackAnchor(s, el) {
  const doc = s.iframe.contentDocument
  const win = s.iframe.contentWindow
  let anchor = el
  let parent = el.parentElement
  while (parent && parent !== doc.body) {
    if (!isTransparentWrapper(parent, win) && (isLayerHidden(parent) || isLayerLocked(parent) || isLayerObject(parent, win))) {
      anchor = parent
    }
    parent = parent.parentElement
  }
  return anchor
}

function layerDepth(s, el) {
  const doc = s.iframe.contentDocument
  let depth = 0
  let parent = el.parentElement
  while (parent && parent !== doc.body) {
    depth += 1
    parent = parent.parentElement
  }
  return depth
}

function isLayerObject(el, win) {
  if (isStructuralTag(el)) return false
  if (isReplacedLayer(el)) return true
  if (getDirectText(el)) return true
  if (hasVisualSurface(el, win)) return true
  if (el.isContentEditable) return true
  return false
}

function isStructuralTag(el) {
  const t = el.tagName
  // Hidden infrastructure (head-ish elements that somehow land in body).
  if (t === 'SCRIPT' || t === 'STYLE' || t === 'LINK' || t === 'META' || t === 'NOSCRIPT' || t === 'TITLE') return true
  // Layout hints with no visual surface to edit. Keeping these in the layers
  // panel is noise; the user edits the content around them instead.
  if (t === 'BR' || t === 'HR' || t === 'WBR' || t === 'SOURCE' || t === 'TRACK' || t === 'TEMPLATE') return true
  return false
}

function isTransparentWrapper(el, win) {
  if (!TRANSPARENT_WRAPPER_TAGS.has(el.tagName)) return false
  if (isReplacedLayer(el)) return false
  if (getDirectText(el)) return false
  return !hasVisualSurface(el, win)
}

function isReplacedLayer(el) {
  const t = el.tagName
  return t === 'IMG' || t === 'SVG' || t === 'CANVAS' || t === 'VIDEO' || t === 'AUDIO' ||
    t === 'IFRAME' || t === 'BUTTON' || t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT'
}

function hasVisualSurface(el, win) {
  const cs = win.getComputedStyle(el)
  if (cs.display === 'none') return false
  const bg = cs.backgroundColor
  if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return true
  if (cs.backgroundImage && cs.backgroundImage !== 'none') return true
  if (cs.boxShadow && cs.boxShadow !== 'none') return true
  if (cs.filter && cs.filter !== 'none') return true
  if (cs.backdropFilter && cs.backdropFilter !== 'none') return true

  const sides = ['Top', 'Right', 'Bottom', 'Left']
  for (const side of sides) {
    const width = parseFloat(cs[`border${side}Width`]) || 0
    const style = cs[`border${side}Style`]
    if (width > 0 && style !== 'none' && style !== 'hidden') return true
  }
  return false
}

function describeElement(el) {
  const tag = el.tagName.toLowerCase()

  if (tag === 'img') {
    const alt = el.getAttribute('alt')
    if (alt && alt.trim()) return `🖼 ${alt.trim().slice(0, 32)}`
    const src = el.getAttribute('src') || ''
    const base = (src.split('/').pop() || 'image').split('?')[0]
    return `🖼 ${base}`
  }
  if (tag === 'svg') return 'svg icon'
  if (tag === 'canvas') return 'canvas'
  if (tag === 'video') return 'video'
  if (tag === 'body') return 'body (background)'
  const aria = el.getAttribute('aria-label') || el.getAttribute('title')
  if (aria && aria.trim()) return `${tag} · ${aria.trim().slice(0, 36)}`

  // Prefer visible text — use direct text content first, then full descendant text
  const directText = getDirectText(el)
  const allText = (el.textContent || '').trim()
  const text = directText || (!el.children.length ? allText : '')

  if (text) {
    const preview = text.slice(0, 36)
    const ellipsis = text.length > 36 ? '…' : ''
    return `${tag} · "${preview}${ellipsis}"`
  }

  if (el.id) return `${tag}#${el.id}`
  if (el.className && typeof el.className === 'string') {
    const cls = el.className.trim().split(/\s+/).filter(Boolean)[0]
    if (cls) return `${tag}.${cls}`
  }
  return tag
}

function getDirectText(el) {
  let out = ''
  for (const n of el.childNodes) {
    if (n.nodeType === 3) out += n.textContent
  }
  return out.trim()
}

// ─── History ───────────────────────────────────────────────────────────────

function recordHistory(s) {
  const doc = s.iframe.contentDocument
  if (!doc) return
  const snap = withEditorArtifactsStripped(doc, () => doc.body.innerHTML)

  if (s.history[s.historyIndex] === snap) return
  s.history.length = s.historyIndex + 1
  s.history.push(snap)
  if (s.history.length > MAX_HISTORY) s.history.shift()
  else s.historyIndex = s.history.length - 1
  updateHistoryButtons()
}

function undo() {
  const s = activeStage
  if (!s || s.historyIndex <= 0) return
  s.historyIndex--
  applyHistory(s)
}

function redo() {
  const s = activeStage
  if (!s || s.historyIndex >= s.history.length - 1) return
  s.historyIndex++
  applyHistory(s)
}

function applyHistory(s) {
  const doc = s.iframe.contentDocument
  s.selected = null
  doc.body.innerHTML = s.history[s.historyIndex]
  panel.innerHTML = '<div class="empty-state">Click any element in the design to edit.</div>'
  updateHistoryButtons()
  renderLayers()
  updateResizeOverlay()
  scheduleSave(s, { skipHistory: true })
}

function updateHistoryButtons() {
  const s = activeStage
  undoBtn.disabled = !s || s.historyIndex <= 0
  redoBtn.disabled = !s || s.historyIndex >= s.history.length - 1
}

// ─── Save ──────────────────────────────────────────────────────────────────

function scheduleSave(s, opts = {}) {
  clearTimeout(s.saveTimer)
  setAnyStatus('editing…', 'dirty')
  s.saveTimer = setTimeout(() => doSave(s, opts), 500)
}

async function doSave(s, { skipHistory = false } = {}) {
  if (s.saving) {
    s.pendingSave = true
    return
  }
  s.saving = true
  setAnyStatus('saving…', 'saving')

  if (!skipHistory) recordHistory(s)

  const doc = s.iframe.contentDocument
  const content = withEditorArtifactsStripped(doc, () => {
    const doctype = doc.doctype
      ? `<!DOCTYPE ${doc.doctype.name}${doc.doctype.publicId ? ` PUBLIC "${doc.doctype.publicId}"` : ''}${doc.doctype.systemId ? ` "${doc.doctype.systemId}"` : ''}>\n`
      : '<!doctype html>\n'
    return doctype + doc.documentElement.outerHTML
  })

  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(s.file)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    })
    if (!res.ok) throw new Error((await res.json()).error || 'save failed')
    setAnyStatus('saved', 'saved')
  } catch (e) {
    setAnyStatus('save error: ' + e.message, 'error')
    toast('Save failed: ' + e.message)
  } finally {
    s.saving = false
    updateResizeOverlay()
    if (s.pendingSave) {
      s.pendingSave = false
      scheduleSave(s, { skipHistory: true })
    }
  }
}

function setAnyStatus(text, state) {
  statusEl.textContent = text
  statusEl.dataset.state = state
}

// ─── Zoom ──────────────────────────────────────────────────────────────────

function setZoom(z) {
  zoom = Math.max(0.1, Math.min(3, z))
  stagesContainer.style.transform = `scale(${zoom})`
  stagesContainer.style.transformOrigin = 'top left'
  const naturalW = stagesContainer.scrollWidth
  const naturalH = stagesContainer.scrollHeight
  stagesContainer.style.width = naturalW + 'px'
  stagesContainer.style.height = naturalH + 'px'
  stagesContainer.style.marginRight = naturalW * (zoom - 1) + 'px'
  stagesContainer.style.marginBottom = naturalH * (zoom - 1) + 'px'
  zoomResetBtn.textContent = Math.round(zoom * 100) + '%'
  updateResizeOverlay()
}

function fitZoom() {
  const pad = 48
  const availW = canvas.clientWidth - pad
  const availH = canvas.clientHeight - pad
  stagesContainer.style.transform = ''
  stagesContainer.style.width = ''
  stagesContainer.style.height = ''
  stagesContainer.style.marginRight = ''
  stagesContainer.style.marginBottom = ''
  const naturalW = stagesContainer.scrollWidth
  const naturalH = stagesContainer.scrollHeight
  const z = Math.min(availW / naturalW, availH / naturalH, 1)
  setZoom(z)
}

// ─── Image insertion ───────────────────────────────────────────────────────

async function onImagePicked(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  if (f.size > 10 * 1024 * 1024) {
    toast('Image too large (max 10MB)')
    return
  }
  if (!activeStage) return
  setAnyStatus('uploading…', 'saving')
  const dataUrl = await readAsDataUrl(f)
  try {
    const res = await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: f.name, dataUrl })
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'upload failed')
    insertImage(activeStage, json.path)
  } catch (err) {
    setAnyStatus('upload error: ' + err.message, 'error')
    toast('Upload failed: ' + err.message)
  }
}

function insertImage(s, assetPath) {
  const doc = s.iframe.contentDocument
  const img = doc.createElement('img')
  img.src = relativeFromHtmlToAsset(s.file, assetPath)
  img.style.position = 'absolute'
  img.style.top = '200px'
  img.style.left = '200px'
  img.style.width = '300px'
  img.style.height = 'auto'
  doc.body.appendChild(img)
  selectElement(s, img)
  scheduleSave(s)
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

function relativeFromHtmlToAsset(htmlPath, assetPath) {
  const fromDir = htmlPath.split('/').slice(0, -1)
  const toParts = assetPath.split('/')
  let i = 0
  while (i < fromDir.length && i < toParts.length - 1 && fromDir[i] === toParts[i]) i++
  const ups = fromDir.length - i
  const tail = toParts.slice(i).join('/')
  return ups > 0 ? '../'.repeat(ups) + tail : tail
}

// ─── Delete / Duplicate ────────────────────────────────────────────────────

function deleteSelected() {
  const s = activeStage
  if (!s) return
  const doc = s.iframe.contentDocument
  if (!s.selected || s.selected === doc.body || s.selected === doc.documentElement) return
  if (isLockedForEditing(s.selected) || isHiddenForEditing(s.selected)) return
  s.selected.remove()
  s.selected = null
  panel.innerHTML = '<div class="empty-state">Click any element in the design to edit.</div>'
  renderLayers()
  scheduleSave(s)
}

function duplicateSelected() {
  const s = activeStage
  if (!s) return
  const doc = s.iframe.contentDocument
  if (!s.selected || s.selected === doc.body || s.selected === doc.documentElement) return
  if (isLockedForEditing(s.selected) || isHiddenForEditing(s.selected)) return
  const clone = s.selected.cloneNode(true)
  clone.removeAttribute(SELECTED_ATTR)
  clone.removeAttribute(HIDDEN_ATTR)
  clone.removeAttribute(LOCKED_ATTR)
  for (const attr of TRANSIENT_ATTRS) {
    clone.querySelectorAll(`[${attr}]`).forEach((n) => n.removeAttribute(attr))
  }
  const cs = s.iframe.contentWindow.getComputedStyle(s.selected)
  if (cs.position === 'absolute' || cs.position === 'fixed') {
    clone.style.top = (parseFloat(cs.top) || 0) + 20 + 'px'
    clone.style.left = (parseFloat(cs.left) || 0) + 20 + 'px'
  }
  s.selected.parentElement.insertBefore(clone, s.selected.nextSibling)
  selectElement(s, clone)
  scheduleSave(s)
}

// ─── Artboard ──────────────────────────────────────────────────────────────

async function addArtboard() {
  const folder = commonFolder(fileList)
  setAnyStatus('creating…', 'saving')
  try {
    const res = await fetch('/api/new-design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder })
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'create failed')

    const nextFiles = [...fileList, json.path]
    const qs = nextFiles.map(encodeURIComponent).join(',')
    location.href = `/editor?files=${qs}`
  } catch (err) {
    setAnyStatus('artboard error: ' + err.message, 'error')
  }
}

async function renameArtboard() {
  const s = activeStage
  if (!s) return
  const current = s.file.split('/').pop()
  const next = await promptText({
    title: 'Rename artboard',
    label: 'File name',
    value: current,
    confirmText: 'Rename'
  })
  if (!next) return
  const nextName = normalizeHtmlName(next)
  if (nextName === current) return

  const dir = s.file.split('/').slice(0, -1).join('/')
  const to = dir ? `${dir}/${nextName}` : nextName
  setAnyStatus('renaming…', 'saving')
  try {
    const res = await fetch('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: s.file, to })
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'rename failed')
    const nextFiles = fileList.map((f) => f === s.file ? json.path : f)
    navigateToArtboards(nextFiles)
  } catch (err) {
    setAnyStatus('rename error: ' + err.message, 'error')
    toast('Rename failed: ' + err.message)
  }
}

async function deleteArtboard() {
  const s = activeStage
  if (!s) return
  const ok = await confirmDialog({
    title: 'Delete artboard',
    message: `Delete "${s.file}"? This removes the HTML file from disk and cannot be undone.`,
    confirmText: 'Delete',
    danger: true
  })
  if (!ok) return

  setAnyStatus('deleting…', 'saving')
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(s.file)}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'delete failed')
    const nextFiles = fileList.filter((f) => f !== s.file)
    if (!nextFiles.length) {
      location.href = '/'
      return
    }
    navigateToArtboards(nextFiles)
  } catch (err) {
    setAnyStatus('delete error: ' + err.message, 'error')
    toast('Delete failed: ' + err.message)
  }
}

function normalizeHtmlName(name) {
  const trimmed = String(name || '').trim()
  if (!trimmed) return ''
  return /\.html?$/i.test(trimmed) ? trimmed : `${trimmed}.html`
}

function navigateToArtboards(paths) {
  if (paths.length === 1) {
    location.href = `/editor?file=${encodeURIComponent(paths[0])}`
    return
  }
  const qs = paths.map(encodeURIComponent).join(',')
  location.href = `/editor?files=${qs}`
}

function commonFolder(paths) {
  if (!paths.length) return ''
  const dirs = paths.map((p) => p.split('/').slice(0, -1).join('/'))
  const first = dirs[0]
  return dirs.every((d) => d === first) ? first : ''
}

// ─── Export ────────────────────────────────────────────────────────────────

function exportPng() {
  if (!window.htmlToImage) {
    toast('Export library not loaded yet')
    return
  }
  openExportDialog()
}

function openExportDialog() {
  const restoreFocus = document.activeElement
  const multi = stages.length > 1
  const overlay = createModal({
    title: 'Export',
    body: `
        <div class="modal-section-title">Scope</div>
        <div class="export-scope">
          <label><input type="radio" name="scope" value="active" checked> Active design only</label>
          ${multi ? `<label><input type="radio" name="scope" value="all"> All ${stages.length} slides</label>` : ''}
        </div>
        <div class="modal-section-title">Format</div>
        <div class="export-choice" data-group="format">
          <button type="button" class="choice-btn active" data-value="png">PNG</button>
          <button type="button" class="choice-btn" data-value="jpg">JPG</button>
        </div>
        <div class="modal-section-title">Scale</div>
        <div class="export-choice" data-group="scale">
          <button type="button" class="choice-btn" data-value="1">1×</button>
          <button type="button" class="choice-btn active" data-value="2">2× (recommended)</button>
          <button type="button" class="choice-btn" data-value="3">3× (hi-res)</button>
        </div>
        <div class="hint">${supportsFilePicker() ? 'You will be prompted to choose a save location.' : 'Files will be downloaded via your browser.'}</div>
    `,
    footer: `
      <button class="tb" data-modal-cancel>Cancel</button>
      <button class="tb tb-primary" id="export-go">Export</button>
    `,
    restoreFocus
  })

  overlay.querySelectorAll('.export-choice').forEach((group) => {
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('.choice-btn')
      if (!btn) return
      group.querySelectorAll('.choice-btn').forEach((b) => b.classList.toggle('active', b === btn))
    })
  })
  overlay.querySelector('#export-go').addEventListener('click', async () => {
    const format = overlay.querySelector('[data-group="format"] .active').dataset.value
    const scale = Number(overlay.querySelector('[data-group="scale"] .active').dataset.value)
    const scope = overlay.querySelector('input[name="scope"]:checked').value
    closeModal(overlay, restoreFocus)
    await runExport({ format, scale, scope })
  })
  overlay.querySelector('#export-go')?.focus()
}

async function runExport({ format, scale, scope }) {
  const list = scope === 'all' ? stages : [activeStage].filter(Boolean)
  if (!list.length) return

  setAnyStatus('exporting…', 'saving')
  try {
    const exports = []
    for (const s of list) {
      const blob = await renderStageToBlob(s, { format, scale })
      const name = s.file.split('/').pop().replace(/\.html?$/i, '') + (format === 'jpg' ? '.jpg' : '.png')
      exports.push({ name, blob })
    }

    if (exports.length === 1) {
      await saveBlob(exports[0].blob, exports[0].name, format)
    } else {
      await saveBlobsToDirectory(exports, format)
    }
    setAnyStatus('exported', 'saved')
  } catch (err) {
    if (err?.name === 'AbortError') {
      setAnyStatus('', '')
      return
    }
    setAnyStatus('export error: ' + err.message, 'error')
    toast('Export failed: ' + err.message)
  }
}

async function renderStageToBlob(s, { format, scale }) {
  const doc = s.iframe.contentDocument
  const win = s.iframe.contentWindow
  return await withEditorArtifactsStripped(doc, async () => {
    const target = doc.body
    const width = s.naturalW || parseFloat(win.getComputedStyle(target).width) || target.scrollWidth || 1080
    const height = s.naturalH || parseFloat(win.getComputedStyle(target).height) || target.scrollHeight || 1080
    const bg = win.getComputedStyle(target).backgroundColor || '#ffffff'
    const opts = { width, height, pixelRatio: scale, cacheBust: true, backgroundColor: bg }

    const dataUrl = format === 'jpg'
      ? await window.htmlToImage.toJpeg(target, { ...opts, quality: 0.95 })
      : await window.htmlToImage.toPng(target, opts)

    const res = await fetch(dataUrl)
    return await res.blob()
  })
}

function withEditorArtifactsStripped(doc, fn) {
  const overlay = doc.getElementById(OVERLAY_STYLE_ID)
  const overlayText = overlay?.textContent ?? null
  overlay?.remove()

  const attrStates = []
  for (const attr of TRANSIENT_ATTRS) {
    for (const el of doc.querySelectorAll(`[${attr}]`)) {
      attrStates.push({ el, attr, value: el.getAttribute(attr) })
      el.removeAttribute(attr)
    }
  }

  const restore = () => {
    if (overlayText !== null && !doc.getElementById(OVERLAY_STYLE_ID)) {
      const st = doc.createElement('style')
      st.id = OVERLAY_STYLE_ID
      st.textContent = overlayText
      doc.head.appendChild(st)
    }
    for (const { el, attr, value } of attrStates) {
      if (!el.isConnected) continue
      if (value === null) el.setAttribute(attr, '')
      else el.setAttribute(attr, value)
    }
  }

  try {
    const result = fn()
    if (result && typeof result.then === 'function') {
      return result.finally(restore)
    }
    restore()
    return result
  } catch (err) {
    restore()
    throw err
  }
}

function supportsFilePicker() {
  return typeof window.showSaveFilePicker === 'function'
}
function supportsDirPicker() {
  return typeof window.showDirectoryPicker === 'function'
}

async function saveBlob(blob, filename, format) {
  if (supportsFilePicker()) {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{
        description: format === 'jpg' ? 'JPEG image' : 'PNG image',
        accept: format === 'jpg' ? { 'image/jpeg': ['.jpg', '.jpeg'] } : { 'image/png': ['.png'] }
      }]
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return
  }
  downloadBlob(blob, filename)
}

async function saveBlobsToDirectory(files, format) {
  if (supportsDirPicker()) {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
    for (const { name, blob } of files) {
      const fileHandle = await dirHandle.getFileHandle(name, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
    }
    return
  }
  for (const { name, blob } of files) {
    downloadBlob(blob, name)
    await new Promise((r) => setTimeout(r, 120))
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ─── Keyboard ──────────────────────────────────────────────────────────────

function onParentKey(e) {
  if (e.key === 'Escape' && (document.body.classList.contains('show-layers') || document.body.classList.contains('show-properties'))) {
    e.preventDefault()
    closeCompactPanels()
    return
  }
  if (handleUndoRedo(e)) return
  if (isTyping(e.target)) return
  handleZoomKeys(e)
}

function onIframeKey(e, s) {
  if (handleUndoRedo(e)) return
  if (handleZoomKeys(e)) return
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (!s.selected) return
    e.preventDefault()
    setActiveStage(s)
    deleteSelected()
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
    if (!s.selected) return
    e.preventDefault()
    setActiveStage(s)
    duplicateSelected()
  } else if (e.key === 'Escape') {
    deselect()
  }
}

function handleUndoRedo(e) {
  const meta = e.metaKey || e.ctrlKey
  if (!meta) return false
  const k = e.key.toLowerCase()
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return true }
  if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); return true }
  return false
}

function handleZoomKeys(e) {
  const meta = e.metaKey || e.ctrlKey
  if (!meta) return false
  if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(zoom * 1.25); return true }
  if (e.key === '-') { e.preventDefault(); setZoom(zoom / 1.25); return true }
  if (e.key === '0') { e.preventDefault(); setZoom(1); return true }
  return false
}

function isTyping(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function toast(message, state = 'error') {
  let wrap = document.querySelector('.toast-stack')
  if (!wrap) {
    wrap = document.createElement('div')
    wrap.className = 'toast-stack'
    document.body.appendChild(wrap)
  }
  const el = document.createElement('div')
  el.className = `toast ${state}`
  if (state === 'error') {
    el.setAttribute('role', 'alert')
  } else {
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
  }
  el.textContent = message
  wrap.appendChild(el)
  setTimeout(() => el.remove(), state === 'error' ? 5200 : 2600)
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
  const id = `modal-${++modalSeq}`
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="${id}-title" aria-describedby="${id}-body">
      <div class="modal-head" id="${id}-title">${escapeHtml(title)}</div>
      <div class="modal-body" id="${id}-body">${body}</div>
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
    } else if (e.key === 'Tab') {
      trapModalFocus(overlay, e)
    }
  })
  document.body.appendChild(overlay)
  return overlay
}

function trapModalFocus(overlay, e) {
  const focusable = [...overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && el.offsetParent !== null)
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

function closeModal(overlay, restoreFocus) {
  overlay.remove()
  if (restoreFocus && typeof restoreFocus.focus === 'function') restoreFocus.focus()
}

function parseColor(color) {
  const s = String(color || '').trim()
  if (!s || s === 'transparent') return { hex: '', isTransparent: true }
  const rgba = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/.exec(s)
  if (rgba) {
    const alpha = rgba[4] !== undefined ? parseFloat(rgba[4]) : 1
    if (alpha === 0) return { hex: '', isTransparent: true }
    const hex =
      '#' +
      [rgba[1], rgba[2], rgba[3]]
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')
    return { hex, isTransparent: false, alpha }
  }
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return { hex: s, isTransparent: false }
  return { hex: '', isTransparent: false }
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
