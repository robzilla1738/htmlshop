# htmlshop

A small local editor for HTML design files. You click stuff, it changes, and it saves back to the file. Made for the workflow of "I had Claude generate a social post, now I want to tweak the copy and nudge the headline 20px left."

## Quick start

```bash
npx htmlshop
```

No argument means it opens your projects folder at `~/htmlshop/projects/` (created on first run). Point it somewhere else if you want:

```bash
npx htmlshop ~/path/to/designs
```

Open the URL it prints (defaults to `http://localhost:5178`). You get a gallery of every `.html` file, grouped by subfolder. Folders with 2+ designs can open as a carousel.

## Use it from Claude Code / Cursor

htmlshop ships as a Claude Code plugin so you can ask the assistant to make designs in plain English and have them show up in the editor automatically:

```
/htmlshop make a 1080×1080 Instagram post titled "Truth isn't loud"
          using my design-system.md
```

The assistant looks for a `design-system.md` (if you referenced one), writes a self-contained HTML file into `~/htmlshop/projects/<slug>/`, and launches the editor.

### Install the plugin

Until I get the marketplace listing up, clone the repo into the plugins folder and Claude Code will pick it up:

```bash
git clone https://github.com/robzilla1738/htmlshop ~/.claude/plugins/htmlshop
```

Structure that makes it a valid plugin:

```
htmlshop/
├── .claude-plugin/plugin.json
└── skills/
    └── htmlshop/SKILL.md
```

### Projects folder

Everything lives under `~/htmlshop/projects/`. Subfolders are carousels (multi-slide projects), loose files at the top level are standalone designs. That's the whole convention.

## What the editor actually does

Gallery: designs grouped by folder. Buttons for `+ New design` and `+ New carousel`. Each card has a `⋯` menu (move, duplicate, rename, delete). Folder headers have their own menu plus an "Open as carousel" button when there are 2+ files.

Editor: one iframe per open design, laid out horizontally. Each stage has its own selection, history, and save state.

- Click-drag any element. If it's static or relative, it gets promoted to `position: absolute` at its current rendered spot on the first drag, so nothing jumps.
- 8 resize handles on the selected element.
- Layers panel on the left, labeled by visible text. Eye icon hides/shows (editor-only, not written to disk).
- Properties panel on the right:
  - Text content, plus B/I/U and A−/A+ steppers.
  - Typography: font-family dropdown auto-filled from fonts actually used in the designs + web standards. Size, weight, line-height, letter-spacing, color, align, transform.
  - Layout: display, position, inset (when absolute), z-index, width/height, padding, margin, gap, overflow, visibility.
  - Background: color picker and a full `background` shorthand field for gradients and images. Picking a color auto-clears `background-image` so the color actually shows.
  - Border, radius, box-shadow, opacity, mix-blend-mode.
- Undo/redo with ⌘Z / ⌘⇧Z, 100 steps per stage.
- Zoom with ⌘− / ⌘+ / ⌘0. Auto-fits on load.
- `+ Artboard` creates a blank sibling design and reloads with it included.
- `+ Image` uploads to `<folder>/assets/` and drops it on the canvas.
- Bring-to-front / send-to-back in the meta row.
- Export opens a dialog: PNG or JPG, 1×/2×/3×, this design or all slides. Uses the File System Access API to let you pick the save location in Chrome/Edge; falls back to a normal download in Firefox/Safari.
- Overlay settings (⚙): toggle hover outlines and the active-stage border.

## Shortcuts

| Action | Shortcut |
|---|---|
| Undo / Redo | ⌘Z / ⌘⇧Z |
| Zoom in / out / 100% | ⌘+ / ⌘− / ⌘0 |
| Delete selected | ⌫ |
| Duplicate selected | ⌘D |
| Deselect | Esc |

## Caveats worth knowing

Files get modified in place. Keep them in git or back them up before doing anything destructive.

Save re-serializes the live DOM back to the file. Attribute quoting gets normalized, self-closing tags become HTML5-style, but comments and text stay intact.

Preview scaling is tuned for 1080×1080. Other dimensions work fine in the editor, but gallery previews may letterbox.

The File System Access API (the "pick where to save" dialog) is Chrome/Edge only. Everywhere else it falls back to a regular download.

## License

MIT
