# htmlshop

A small local editor for HTML design files. You open a folder, click elements in the browser, adjust text, typography, layout, color, and export images. Files are edited in place on disk.

htmlshop ships two pieces together:

1. `npx htmlshop`, a local Node server and browser editor for folders of `.html`/`.htm` designs.
2. A reusable AI-tool skill/rule that tells Codex, Claude Code, Cursor, and similar IDEs how to generate fixed-size HTML designs and launch the editor.

Everything runs locally. There are no accounts, telemetry, or remote htmlshop services.

## Copy-Paste Setup

Paste this into the terminal inside Cursor, Codex, Claude Code, Windsurf, or another AI coding IDE:

```bash
npx --yes htmlshop@latest install && npx --yes htmlshop@latest init
```

That installs the global Codex/Claude Code skill and adds the project rule that Cursor-style IDEs can read from `.cursor/rules/htmlshop.mdc`.

To launch the editor after setup:

```bash
npx --yes htmlshop@latest
```

## Install The Skill

Install for Codex and Claude Code:

```bash
npx htmlshop install
```

Install only one global skill:

```bash
npx htmlshop install codex
npx htmlshop install claude
```

Resolved install locations:

- Codex: `${CODEX_HOME:-~/.codex}/skills/htmlshop/SKILL.md`
- Claude Code: `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/htmlshop/SKILL.md`

For Cursor, run this at the root of each project where you want htmlshop available:

```bash
npx htmlshop init
```

That writes `.cursor/rules/htmlshop.mdc`. Windsurf, Aider, Continue, and other AI IDEs can use the same `skills/htmlshop/SKILL.md` content as project rules or context.

Uninstall global skills:

```bash
npx htmlshop uninstall
npx htmlshop uninstall codex
npx htmlshop uninstall claude
```

## Run The Editor

Open the default projects folder, created on first run:

```bash
npx htmlshop
```

Open a specific folder:

```bash
npx htmlshop ~/path/to/designs
```

Useful options:

```bash
npx htmlshop ~/path/to/designs --port 5200
npx htmlshop ~/path/to/designs --host 127.0.0.1
npx htmlshop ~/path/to/designs --no-open
npx htmlshop doctor
```

The default URL is `http://127.0.0.1:5178`. If that port is busy and you did not explicitly set a port, htmlshop tries the next available port and prints the final URL.

On first run, if the default projects folder has no visible designs, htmlshop seeds a bundled `welcome.html` demo so the gallery is immediately editable.

## AI Workflow

After installing the skill, ask your AI coding tool for a design:

```text
/htmlshop make a 1080x1080 Instagram post titled "Truth isn't loud"
using my design-system.md
```

The assistant should:

1. Read a referenced design system if one exists.
2. Write one or more self-contained `.html` files under `~/htmlshop/projects/`; `.htm` is also accepted.
3. Launch `npx htmlshop <project-folder>` in the background.
4. Give you the local editor URL.

Projects convention:

- Loose `.html` or `.htm` files in `~/htmlshop/projects/` are standalone designs.
- Subfolders are carousels or multi-slide projects.
- Uploaded images are saved under `<root>/assets/`.

## Editor Features

Gallery:

- Shows standalone designs and carousel folders.
- Creates new designs and new carousels.
- Renames, moves, duplicates, and deletes designs with local modals.
- Shows the active root folder in the header.
- Opens folders with multiple designs as a side-by-side carousel editor.

Editor:

- Click an element to select it.
- Drag or resize elements with transform handles.
- Static/relative layouts freeze into absolute positions on first transform so siblings do not reflow.
- Layers panel with editor-only hide/show toggles.
- Properties panel for text, typography, layout, background, borders, effects, and blending.
- Undo/redo per open design.
- Zoom controls and fit-to-screen.
- Add artboards and images.
- Rename or delete artboards from the Layers sidebar.
- Export PNG/JPG at 1x, 2x, or 3x for the active design or all slides.

Shortcuts:

| Action | Shortcut |
|---|---|
| Undo / Redo | Cmd+Z / Cmd+Shift+Z |
| Zoom in / out / 100% | Cmd+Plus / Cmd+Minus / Cmd+0 |
| Delete selected | Delete |
| Duplicate selected | Cmd+D |
| Deselect | Esc |

## Design File Shape

htmlshop works best with single-file fixed canvases. Use `.html` by default; `.htm` is accepted for existing files.

```html
<!doctype html>
<html>
<head>
  <style>
    body {
      margin: 0;
      width: 1080px;
      height: 1080px;
      position: relative;
      overflow: hidden;
    }
    .headline {
      position: absolute;
      left: 120px;
      top: 240px;
    }
  </style>
</head>
<body>
  <h1 class="headline">Hello</h1>
</body>
</html>
```

Inline CSS is preferred. External JavaScript is not needed. Google Fonts are supported, but local/system fonts keep the workflow fully offline after the editor loads.

## Privacy

See [PRIVACY.md](./PRIVACY.md). Short version: htmlshop serves files from your machine to your browser on `127.0.0.1`, edits files on disk, and does not send usage data anywhere. The editor UI currently loads DM Sans from Google Fonts.

## Development

```bash
npm install
npx playwright install chromium
npm run check
node bin/htmlshop.js --no-open
```

`npm run check` performs syntax checks, runs a local smoke test against a temporary folder, runs Playwright browser reliability tests, runs `npm audit --omit=dev`, and verifies package contents with `npm pack --dry-run`.

Useful targeted checks:

```bash
npm run smoke
npm run smoke:cli
npm run test:browser
```

Manual release checklist:

1. Empty first-run gallery.
2. New design and new carousel creation.
3. Open single design and multi-slide carousel.
4. Select, drag, resize, duplicate, delete, undo, redo.
5. Hide/lock a layer, save another edit, reload, and confirm editor-only `data-htmlshop-*` artifacts were not saved.
6. Rename and move conflict handling.
7. Upload image and save.
8. Export PNG and JPG at 1x/2x with correct dimensions.
9. Keyboard checks: tab through gallery menus, modals trap focus, Esc closes dialogs/drawers.
10. `htmlshop install`, `install codex`, `install claude`, `init`, `doctor`, and `--no-open`.

## License

MIT
