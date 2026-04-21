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

const OVERLAY_STYLE_ID = '__htmlshop_overlay__'
const SELECTED_ATTR = 'data-htmlshop-selected'
const HIDDEN_ATTR = 'data-htmlshop-hidden'
const MAX_HISTORY = 100

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

const settings = {
  hoverOutline: true,
  activeBorder: true
}

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
    history: [],
    historyIndex: -1,
    selected: null,
    saveTimer: null,
    saving: false,
    pendingSave: false
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
    [${HIDDEN_ATTR}] {
      display: none !important;
    }
    ${settings.hoverOutline ? `
      *:hover:not([${SELECTED_ATTR}]) {
        outline: 1px dashed rgba(79, 140, 255, 0.55) !important;
        outline-offset: 1px !important;
        cursor: pointer !important;
      }
    ` : ''}
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

function startDrag(s, el, startEvent) {
  const doc = s.iframe.contentDocument
  const win = s.iframe.contentWindow
  const cs = win.getComputedStyle(el)

  // mousedown originated inside this iframe — browser implicit mouse capture
  // will keep delivering mousemove/mouseup to this iframe's document until the
  // button is released. Listen here, not on window.
  const startX = startEvent.clientX
  const startY = startEvent.clientY

  const isAbs = cs.position === 'absolute' || cs.position === 'fixed'
  let origTop = parseFloat(cs.top) || 0
  let origLeft = parseFloat(cs.left) || 0
  let promoted = false
  let moved = false

  const onMove = (e) => {
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (!moved && Math.hypot(dx, dy) < 3) return
    moved = true

    if (!isAbs && !promoted) {
      const rect = el.getBoundingClientRect()
      const parent = el.offsetParent || doc.body
      const parentRect = parent.getBoundingClientRect()
      const parentCs = win.getComputedStyle(parent)
      const borderL = parseFloat(parentCs.borderLeftWidth) || 0
      const borderT = parseFloat(parentCs.borderTopWidth) || 0
      const x = rect.left - parentRect.left - borderL
      const y = rect.top - parentRect.top - borderT
      el.style.position = 'absolute'
      el.style.left = x + 'px'
      el.style.top = y + 'px'
      origLeft = x
      origTop = y
      promoted = true
    }

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
  const doc = s.iframe.contentDocument
  const win = s.iframe.contentWindow

  const cs = win.getComputedStyle(el)
  const wasAbs = cs.position === 'absolute' || cs.position === 'fixed'

  let left = parseFloat(cs.left) || 0
  let top = parseFloat(cs.top) || 0
  let width = parseFloat(cs.width) || 0
  let height = parseFloat(cs.height) || 0

  if (!wasAbs) {
    const rect = el.getBoundingClientRect()
    const parent = el.offsetParent || doc.body
    const parentRect = parent.getBoundingClientRect()
    const parentCs = win.getComputedStyle(parent)
    const borderL = parseFloat(parentCs.borderLeftWidth) || 0
    const borderT = parseFloat(parentCs.borderTopWidth) || 0
    left = rect.left - parentRect.left - borderL
    top = rect.top - parentRect.top - borderT
    width = rect.width
    height = rect.height
    el.style.position = 'absolute'
    el.style.left = left + 'px'
    el.style.top = top + 'px'
    el.style.width = width + 'px'
    el.style.height = height + 'px'
  }

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

  panel.innerHTML = `
    <div class="meta">
      <div class="meta-ident">
        <span class="tag">&lt;${tag}&gt;</span>
        ${id ? `<span class="cls">${escapeHtml(id)}</span>` : ''}
        ${cls ? `<span class="cls">${escapeHtml(cls)}</span>` : ''}
      </div>
      <div class="meta-actions">
        <button id="to-front" class="meta-btn" title="Bring to front">↑</button>
        <button id="to-back" class="meta-btn" title="Send to back">↓</button>
        <button id="duplicate-el" class="meta-btn" title="Duplicate (⌘D)">Dup</button>
        <button id="delete-el" class="meta-btn meta-btn-danger" title="Delete (⌫)">Del</button>
      </div>
    </div>

    ${!hasChildElements ? `
      <div class="section">
        <div class="section-title">Text</div>
        <textarea id="text" rows="3">${escapeHtml(el.textContent ?? '')}</textarea>
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

  panel.querySelectorAll('[data-prop]').forEach((inp) => {
    inp.addEventListener('input', () => applyStyleFromInput(s, el, inp))
    inp.addEventListener('change', () => applyStyleFromInput(s, el, inp))
  })
  panel.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => toggleTool(s, el, btn.dataset.tool))
  })
  panel.querySelectorAll('[data-size-delta]').forEach((btn) => {
    btn.addEventListener('click', () => adjustFontSize(s, el, Number(btn.dataset.sizeDelta)))
  })
  const text = panel.querySelector('#text')
  if (text) {
    text.addEventListener('input', () => {
      el.textContent = text.value
      scheduleSave(s)
      renderLayers()
    })
  }
  panel.querySelector('#delete-el')?.addEventListener('click', deleteSelected)
  panel.querySelector('#duplicate-el')?.addEventListener('click', duplicateSelected)
  panel.querySelector('#to-front')?.addEventListener('click', () => { bringToFront(s, el); renderPanel(s, el) })
  panel.querySelector('#to-back')?.addEventListener('click', () => { sendToBack(s, el); renderPanel(s, el) })
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
  const parent = el.parentElement
  if (!parent) return
  let maxZ = 0
  for (const sib of parent.children) {
    const z = parseInt(s.iframe.contentWindow.getComputedStyle(sib).zIndex, 10)
    if (!isNaN(z)) maxZ = Math.max(maxZ, z)
  }
  const cs = s.iframe.contentWindow.getComputedStyle(el)
  if (cs.position === 'static') el.style.position = 'relative'
  el.style.zIndex = String(maxZ + 1)
  scheduleSave(s)
}

function sendToBack(s, el) {
  const parent = el.parentElement
  if (!parent) return
  let minZ = 0
  for (const sib of parent.children) {
    const z = parseInt(s.iframe.contentWindow.getComputedStyle(sib).zIndex, 10)
    if (!isNaN(z)) minZ = Math.min(minZ, z)
  }
  const cs = s.iframe.contentWindow.getComputedStyle(el)
  if (cs.position === 'static') el.style.position = 'relative'
  el.style.zIndex = String(minZ - 1)
  scheduleSave(s)
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
    el.style.setProperty(prop, inp.value)
    // When the user picks a background-color, make sure any existing
    // background-image (gradient, url()) doesn't hide the color.
    if (prop === 'background-color') {
      el.style.setProperty('background-image', 'none')
      el.style.removeProperty('background')
    }
    const text = panel.querySelector(`input[data-prop="${prop}"][data-kind="color-text"]`)
    if (text) text.value = inp.value
  } else if (kind === 'color-text') {
    const v = inp.value.trim()
    el.style.setProperty(prop, v || 'transparent')
    if (prop === 'background-color' && v) {
      el.style.setProperty('background-image', 'none')
      el.style.removeProperty('background')
    }
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

    if (stages.length > 1) {
      const header = document.createElement('div')
      header.className = 'layers-stage' + (s === activeStage ? ' active' : '')
      header.textContent = s.file
      header.addEventListener('click', () => setActiveStage(s))
      layersBody.appendChild(header)
    }

    renderLayerNode(layersBody, s, doc.body, 0)
  }
}

function renderLayerNode(container, s, el, depth) {
  const row = document.createElement('div')
  row.className = 'layer-row'
  if (s === activeStage && s.selected === el) row.classList.add('selected')
  row.style.paddingLeft = (depth * 12 + 8) + 'px'

  const eye = document.createElement('button')
  eye.className = 'layer-eye'
  const isHidden = el.hasAttribute(HIDDEN_ATTR)
  eye.textContent = isHidden ? '◌' : '●'
  eye.title = isHidden ? 'Show' : 'Hide'
  eye.addEventListener('click', (e) => {
    e.stopPropagation()
    if (isHidden) el.removeAttribute(HIDDEN_ATTR)
    else el.setAttribute(HIDDEN_ATTR, '')
    scheduleSave(s)
    renderLayers()
  })

  const name = document.createElement('span')
  name.className = 'layer-name'
  name.textContent = describeElement(el)

  row.appendChild(eye)
  row.appendChild(name)
  row.addEventListener('click', () => selectElement(s, el))
  container.appendChild(row)

  for (const child of el.children) {
    const tag = child.tagName
    if (tag === 'SCRIPT' || tag === 'STYLE') continue
    renderLayerNode(container, s, child, depth + 1)
  }
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
  if (tag === 'hr') return 'divider'
  if (tag === 'br') return 'line break'
  if (tag === 'body') return 'body (background)'

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
  const sel = [...doc.querySelectorAll(`[${SELECTED_ATTR}]`)]
  sel.forEach((n) => n.removeAttribute(SELECTED_ATTR))
  const snap = doc.body.innerHTML
  sel.forEach((n) => n.setAttribute(SELECTED_ATTR, ''))

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

  // Strip editor-only artifacts for serialization
  const overlay = doc.getElementById(OVERLAY_STYLE_ID)
  const overlayText = overlay?.textContent ?? null
  overlay?.remove()
  const selectedEls = [...doc.querySelectorAll(`[${SELECTED_ATTR}]`)]
  selectedEls.forEach((n) => n.removeAttribute(SELECTED_ATTR))
  const hiddenEls = [...doc.querySelectorAll(`[${HIDDEN_ATTR}]`)]
  hiddenEls.forEach((n) => n.removeAttribute(HIDDEN_ATTR))

  const doctype = doc.doctype
    ? `<!DOCTYPE ${doc.doctype.name}${doc.doctype.publicId ? ` PUBLIC "${doc.doctype.publicId}"` : ''}${doc.doctype.systemId ? ` "${doc.doctype.systemId}"` : ''}>\n`
    : '<!doctype html>\n'
  const content = doctype + doc.documentElement.outerHTML

  if (overlayText) {
    const st = doc.createElement('style')
    st.id = OVERLAY_STYLE_ID
    st.textContent = overlayText
    doc.head.appendChild(st)
  }
  selectedEls.forEach((n) => n.setAttribute(SELECTED_ATTR, ''))
  hiddenEls.forEach((n) => n.setAttribute(HIDDEN_ATTR, ''))

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
    alert('Image too large (max 10MB)')
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
  const clone = s.selected.cloneNode(true)
  clone.removeAttribute(SELECTED_ATTR)
  clone.querySelectorAll(`[${SELECTED_ATTR}]`).forEach((n) => n.removeAttribute(SELECTED_ATTR))
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

function commonFolder(paths) {
  if (!paths.length) return ''
  const dirs = paths.map((p) => p.split('/').slice(0, -1).join('/'))
  const first = dirs[0]
  return dirs.every((d) => d === first) ? first : ''
}

// ─── Export ────────────────────────────────────────────────────────────────

function exportPng() {
  if (!window.htmlToImage) {
    alert('Export library not loaded yet')
    return
  }
  openExportDialog()
}

function openExportDialog() {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'

  const multi = stages.length > 1
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head">Export</div>
      <div class="modal-body">
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
      </div>
      <div class="modal-foot">
        <button class="tb" id="export-cancel">Cancel</button>
        <button class="tb tb-primary" id="export-go">Export</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  overlay.querySelectorAll('.export-choice').forEach((group) => {
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('.choice-btn')
      if (!btn) return
      group.querySelectorAll('.choice-btn').forEach((b) => b.classList.toggle('active', b === btn))
    })
  })
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
  overlay.querySelector('#export-cancel').addEventListener('click', () => overlay.remove())
  overlay.querySelector('#export-go').addEventListener('click', async () => {
    const format = overlay.querySelector('[data-group="format"] .active').dataset.value
    const scale = Number(overlay.querySelector('[data-group="scale"] .active').dataset.value)
    const scope = overlay.querySelector('input[name="scope"]:checked').value
    overlay.remove()
    await runExport({ format, scale, scope })
  })
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
  }
}

async function renderStageToBlob(s, { format, scale }) {
  const doc = s.iframe.contentDocument
  const win = s.iframe.contentWindow
  const overlay = doc.getElementById(OVERLAY_STYLE_ID)
  const overlayText = overlay?.textContent ?? null
  overlay?.remove()
  const selectedEls = [...doc.querySelectorAll(`[${SELECTED_ATTR}]`)]
  selectedEls.forEach((n) => n.removeAttribute(SELECTED_ATTR))
  const hiddenEls = [...doc.querySelectorAll(`[${HIDDEN_ATTR}]`)]
  hiddenEls.forEach((n) => n.removeAttribute(HIDDEN_ATTR))

  try {
    const target = doc.body
    const width = target.scrollWidth || 1080
    const height = target.scrollHeight || 1080
    const bg = win.getComputedStyle(target).backgroundColor || '#ffffff'
    const opts = { width, height, pixelRatio: scale, cacheBust: true, backgroundColor: bg }

    const dataUrl = format === 'jpg'
      ? await window.htmlToImage.toJpeg(target, { ...opts, quality: 0.95 })
      : await window.htmlToImage.toPng(target, opts)

    const res = await fetch(dataUrl)
    return await res.blob()
  } finally {
    if (overlayText) {
      const st = doc.createElement('style')
      st.id = OVERLAY_STYLE_ID
      st.textContent = overlayText
      doc.head.appendChild(st)
    }
    selectedEls.forEach((n) => n.setAttribute(SELECTED_ATTR, ''))
    hiddenEls.forEach((n) => n.setAttribute(HIDDEN_ATTR, ''))
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
