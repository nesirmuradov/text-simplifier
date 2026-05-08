# Text Simplifier

A Raycast extension that simplifies highlighted text using Claude. Highlight any text, invoke the command, and get a shorter, clearer version — with the option to replace the original in place.

## Prerequisites

- macOS with [Raycast](https://raycast.com/) installed
- Node.js 18+ (`brew install node`)
- An [Anthropic API key](https://console.anthropic.com/) (each user needs their own)

## Install

```sh
git clone https://github.com/nesirmuradov/text-simplifier.git
cd text-simplifier
npm install
npm run dev
```

`npm run dev` registers the extension with Raycast and watches for changes. The first time you run it, Raycast will prompt for your Anthropic API key — paste it in once and it's stored in macOS Keychain (encrypted, scoped to Raycast).

You can quit the dev process (`Ctrl+C`) when you're done — the extension stays installed. Re-run `npm run dev` only when you want to pull in code changes.

> **Don't put the project in iCloud Drive.** Raycast's file watcher and `node_modules` symlinks don't play well with iCloud sync. A local path like `~/raycast-extensions/text-simplifier` works.

## Usage

1. Highlight text in any app (browser, Notes, Slack, Obsidian, etc.)
2. Open Raycast (`⌘ Space`) and run **Simplify Text**
3. The simplified version streams in
4. Choose an action:
   - **Enter** — Replace Highlighted Text (also copies to clipboard)
   - **⌘⇧C** — Copy to Clipboard
   - **⌘E** — Edit before using

## Updating

```sh
cd ~/raycast-extensions/text-simplifier
git pull
npm install        # only if package.json changed
npm run dev        # to reload the extension
```

## How it works

- Sends the highlighted text to Claude (`claude-sonnet-4-6`) with a fixed system prompt
- Streams the response back token-by-token (Server-Sent Events)
- Uses Raycast's `Clipboard` API to replace the source-app selection on Enter

## Troubleshooting

**"Could not find extension's manifest file"** — Source files must be under `src/`. If you cloned and see this, run `npm run dev` again to regenerate.

**"No text selected"** — The extension calls `getSelectedText()`. Some apps don't expose selections to macOS Accessibility (e.g., certain web apps in Chrome without a focused frame). Try in Notes or a regular text field first.

**Streaming hangs** — Check your API key in Raycast → Extensions → Text Simplifier → Configure. Bad keys return a 401 with a clear error message; expired plans return 429.
