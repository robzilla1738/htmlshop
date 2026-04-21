---
name: htmlshop
description: Create and visually edit HTML design files such as social posts, carousels, hero graphics, or any 2D layout. Use when the user says "/htmlshop", asks to create a design, design a carousel, make an Instagram post, tweak a generated HTML file visually, or references their design system or brand. Also triggers on "open htmlshop", "open the editor", "launch the design tool". Works from Codex, Claude Code, Cursor, or any LLM coding tool.
---

# htmlshop

Two things in one tool:

1. A generation workflow. The assistant writes a single self-contained HTML file (fixed dimensions, inline CSS) into the user's projects folder. If there's a `design-system.md` around, use it.
2. A local editor launched with `npx htmlshop`. Opens a folder, shows a gallery, lets the user click into any design and edit text, fonts, layout, colors, and transforms. Autosaves to disk.

Everything runs locally. Nothing uploads anywhere.

## Projects folder

Default location: `~/htmlshop/projects/`. Gets created the first time `npx htmlshop` runs without arguments.

Convention inside that folder:

- Subfolders are carousels or multi-slide projects. e.g. `~/htmlshop/projects/apologetics-series/slide-1.html`, `slide-2.html`.
- Loose HTML files at the top level are standalone designs.

When creating a new design, write it under `~/htmlshop/projects/<slug>/`. Pick a kebab-case slug from the user's request. One file per design. For a carousel, write `slide-1.html`, `slide-2.html`, etc. into the same subfolder.

## Creating a new design

When the user asks for a new design in natural language, like *"/htmlshop create a 1080×1080 Instagram post titled 'Truth isn't loud' using my design-system.md"*:

1. Look for the design system if they mentioned one. Check the exact path they gave, then the current directory (`./design-system.md`, `./brand.md`, `./BRAND.md`), then `~/htmlshop/design-system.md`. If you find it, read it and pull out fonts, colors, spacing, and tone. If they referenced one and you can't find it, ask where it is. If they didn't reference one, use sensible defaults (DM Sans, neutral palette, 1080×1080).

2. Pick a slug and filename. Kebab-case from intent. Standalone goes to `~/htmlshop/projects/<slug>.html`. Carousel goes to `~/htmlshop/projects/<slug>/slide-1.html` and so on.

3. Write the HTML. Constraints:
   - One `.html` file. All CSS inline in a `<style>` block. No external JS.
   - Fixed dimensions: `body { width: Xpx; height: Ypx; margin: 0; position: relative; overflow: hidden }`. Common sizes: 1080×1080, 1080×1350, 1920×1080.
   - Google Fonts via `<link>` is fine. Otherwise use system-ui.
   - Don't reference external images unless the user gave you URLs, or put local files at `assets/*` relative to the HTML.
   - Follow the design system's typography, colors, and tokens if one exists.

4. Use the Write tool to save the file(s). Make the parent directory if needed.

5. Launch the editor in the background so the user can keep chatting:

   ```bash
   npx htmlshop ~/htmlshop/projects/<slug>
   ```

   Use your tool's background process mode when available. `npx htmlshop` with no path works if you wrote a standalone design at the top of `projects/`.

6. Tell the user the URL the command prints (usually `http://localhost:5178`). Mention that edits autosave and that they can add more slides from inside the editor with `+ Artboard`.

## Opening / editing existing designs

If the user just wants to open what they already have ("open htmlshop", "edit my designs"):

1. Pick a folder. Priority order: path the user mentioned, then current directory if it has `.html` files, then `~/htmlshop/projects/`.
2. Run `npx htmlshop <folder>` in the background.
3. Give the user the URL.

## What the editor offers

- Gallery with folders (carousels). Click a card to open single; folder headers get an "Open as carousel" button when they have 2+ files.
- Click to select, drag to move. Static or relative elements auto-promote to `position: absolute` on first drag. 8 resize handles on the selected element. ⌫ deletes, ⌘D duplicates.
- Layers panel on the left, labeled by visible text. Eye icon hides/shows (editor-only, not saved).
- Properties panel on the right: text + B/I/U, typography with a font-family dropdown auto-filled from your designs + web standards, layout (display, position, dimensions, overflow, visibility), background (color picker + shorthand for gradients), border + effects + blend modes.
- ⌘Z / ⌘⇧Z undo per stage (100 steps). Zoom with ⌘− / ⌘+ / ⌘0.
- `+ Artboard` adds a new slide next to the open one(s).
- Rename/Delete in the toolbar renames or removes the active artboard file.
- `+ Image` uploads to `<folder>/assets/` and places it.
- Export: pick PNG/JPG, 1×/2×/3×, this design or all slides, save location (via the browser File System Access API when available).

## Notes

- Always launch the editor in the background when your tool supports it. `npx htmlshop` doesn't return until the user closes it.
- Users may have live edits when they come back to you. Don't overwrite files without confirmation if you're regenerating.
- If the user says "change", "update", or "tweak" something that already exists, edit the file. Don't create a new one.
- Keep generated HTML in a single file. Don't split CSS out — the editor serializes everything back to one file on save.
