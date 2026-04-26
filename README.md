# vercel-delete

CLI tool to bulk-delete Vercel projects interactively.

## Setup

```bash
npm install
export VERCEL_TOKEN=your_token_here
```

Get your token at **vercel.com/account/tokens**.

## Usage

```bash
node delete.mjs
```

Use arrow keys to navigate, `space` to select, `a` to toggle all, `enter` to confirm. You'll get a final confirmation prompt before anything is deleted.

## Files

| File | Purpose |
|------|---------|
| `delete.mjs` | Interactive CLI (main entry point) |
| `server.js` | Web UI alternative (runs at localhost:3456) |
