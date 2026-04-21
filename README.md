# htmlshop

A small local editor for HTML design files. You click stuff, it changes, it saves back to the file. Made for the workflow of "I had Claude generate a social post, now I want to tweak the copy and nudge the headline 20px left."

Two parts:

1. A CLI (`npx htmlshop`) that opens a folder of `.html` files in a visual editor.
2. A skill for Claude Code / Cursor so you can ask your AI tool to make designs in plain English and have them open automatically.

---

## Paste-ready install commands

### Claude Code (global)

```bash
npx htmlshop install
```

Copies the plugin into `~/.claude/plugins/htmlshop/`. Restart Claude Code and the `/htmlshop` skill becomes available in every project.

### Cursor (per-project rule)

In the terminal at the root of whatever project you want htmlshop available in:

```bash
npx htmlshop init
```

Creates `.cursor/rules/htmlshop.mdc` in that project. Cursor picks it up on the next chat. Run it again in each project where you want it.

### Cursor (global, manual)

Cursor doesn't have a file-based global rules location, but it does have a user-rules box. Paste the contents of `skills/htmlshop/SKILL.md` from this repo into:

**Cursor → Settings → Rules → User Rules**

Grab the file with:

```bash
curl -s https://raw.githubusercontent.com/robzilla1738/htmlshop/main/skills/htmlshop/SKILL.md | pbcopy
```

(macOS `pbcopy` puts it on your clipboard; on Linux swap for `xclip -selection clipboard`.)

### Windsurf / other AI IDEs

Most AI IDEs read project-level instruction files. The `init` command creates a Cursor rule, but the same file works as generic context:

```bash
npx htmlshop init
```

Or point whatever mechanism your tool uses (e.g. `.aiderrc`, `.continuerules`) at `skills/htmlshop/SKILL.md`.

### Just the CLI, no AI skill

```bash
npx htmlshop
```

Opens the editor on `~/htmlshop/projects/` (created on first run). Pass a path to point it elsewhere:

```bash
npx htmlshop ~/path/to/designs
```

### Uninstall

```bash
npx htmlshop uninstall    # removes ~/.claude/plugins/htmlshop
```

For Cursor, delete the `.cursor/rules/htmlshop.mdc` or the user-rule you pasted in.

---

## How you actually use it

Once the skill is installed, in Claude Code or Cursor:

```
/htmlshop make a 1080x1080 Instagram post titled "Truth isn't loud"
          using my design-system.md
```

Or any variation. The assistant:

1. Looks for a `design-system.md` if you referenced one (the path you gave, current directory, `~/htmlshop/design-system.md`).
2. Writes a self-contained HTML file into `~/htmlshop/projects/<slug>/`.
3. Launches `npx htmlshop <slug>` in the background.
4. Gives you the editor URL (default `http://localhost:5178`).

From there you can click into any element and tweak it visually.

---

## Projects folder

Everything lives under `~/htmlshop/projects/` by default.

- Subfolders are carousels (multi-slide projects).
- Loose files at the top level are standalone designs.

That's the whole convention.

---

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

---

## Shortcuts

| Action | Shortcut |
|---|---|
| Undo / Redo | ⌘Z / ⌘⇧Z |
| Zoom in / out / 100% | ⌘+ / ⌘− / ⌘0 |
| Delete selected | ⌫ |
| Duplicate selected | ⌘D |
| Deselect | Esc |

---

## Caveats worth knowing

Files get modified in place. Keep them in git or back them up before doing anything destructive.

Save re-serializes the live DOM back to the file. Attribute quoting gets normalized, self-closing tags become HTML5-style, but comments and text stay intact.

Preview scaling is tuned for 1080×1080. Other dimensions work fine in the editor, but gallery previews may letterbox.

The File System Access API (the "pick where to save" dialog) is Chrome/Edge only. Everywhere else it falls back to a regular download.

---

## License

MIT
