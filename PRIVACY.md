# Privacy Policy

htmlshop is a local tool. It runs on your machine, reads and writes files you point it at, and nothing else.

Last updated: April 2026.

## What htmlshop does with your data

Nothing leaves your computer. The CLI opens a local HTTP server at `127.0.0.1` (default port 5178) and serves the editor to your browser. Every HTML file, uploaded image, and export stays on your disk.

## What htmlshop does NOT do

- No telemetry, analytics, or usage tracking.
- No accounts, login, or cloud sync.
- No ads.
- No "phone home" on startup.
- No central servers. There's no backend.

The default project folder (`~/htmlshop/projects/`) is owned and readable only by you, same as any other folder in your home directory.

## The one external request to know about

When you open the editor in your browser, it loads DM Sans from Google Fonts:

- `fonts.googleapis.com` (CSS)
- `fonts.gstatic.com` (woff2 files)

Your browser requests those URLs directly. Google sees your IP address and the font URL. No other data (no file contents, no usage info) gets sent.

If you want to block this:

- Block both domains at the DNS level or via a browser extension, and the editor will fall back to system fonts.
- Or run the editor in a browser profile that blocks third-party font CDNs.

Self-hosted fonts are a planned improvement. File an issue if it matters to you.

## Image upload (+ Image button)

When you upload an image via the editor, the file is:

1. Base64-encoded by your browser.
2. POSTed to the local server at `127.0.0.1`.
3. Written to `<your-folder>/assets/` on your disk.

It never leaves your machine.

## Export

Exports render client-side using `html-to-image`. The output PNG or JPG is generated in your browser and either saved via the File System Access API (you pick the location) or downloaded to your normal downloads folder. No upload.

## Using htmlshop through an AI tool (Claude Code, Cursor, etc.)

If you invoke htmlshop through the installed skill or Cursor rule, the AI tool reads and processes your prompt. That means your request and any referenced files (for example `design-system.md`) get sent to whatever LLM provider you configured — Anthropic, OpenAI, or another.

That's a property of the AI tool you're using, not htmlshop. The skill file (`SKILL.md`) just tells the assistant how to write HTML into your local projects folder and launch the editor. htmlshop itself never sees that traffic.

The HTML files the assistant writes are stored on your disk in `~/htmlshop/projects/`.

## Third-party dependencies

- [`hono`](https://hono.dev) and `@hono/node-server` — the local HTTP server.
- [`html-to-image`](https://github.com/bubkoo/html-to-image) — renders designs to PNG/JPG in the browser.

Neither makes outbound network requests beyond what your browser does.

## Data retention

Nothing retained centrally because there is no centre. Files live on your disk until you delete them or move them.

## Children

htmlshop isn't directed at children and doesn't knowingly collect information from anyone, including children, because it doesn't collect information from anyone at all.

## Changes

If this policy changes, the update will land in this file with a bumped "Last updated" date. Watch the repo or check the git log.

## Contact

Open an issue at https://github.com/robzilla1738/htmlshop/issues.
