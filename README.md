# LiquidAI — Shopify Developer Assistant

Turn design screenshots into complete Shopify Liquid sections, or debug Liquid template errors with AI.

## Setup (required once)

### 1. Install

```bash
npm install
```

### 2. Add your Anthropic API key

```bash
copy .env.example .env
```

Edit `.env` and **replace the placeholder** with your real key from [console.anthropic.com](https://console.anthropic.com):

```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxx
```

> **Important:** `sk-ant-YOUR_KEY_HERE` is a placeholder — the app will not work until you paste a real key.

### 3. Start

```bash
npm run dev
```

Open the URL shown in the terminal (usually http://localhost:5173).

The dev script automatically:
- Loads `.env` and `.env.local`
- Finds a free API port (3001, 3002, … if busy)
- Syncs Vite proxy to the API port

## Usage

### Screenshot → Shopify section
1. Upload a design image
2. Click **Analyze with AI** → **Generate Shopify Section**
3. View code in the right panel (Liquid, schema, CSS, Preview)

### Debug Liquid errors
1. Click **Code** in the input toolbar
2. Paste your Liquid code or attach a `.liquid` file
3. Ask: *"Debug this Shopify Liquid error"*

### Quick actions
Use sidebar or welcome cards for hero sections, HTML→Liquid, schema generation, etc.

## Startup logs

When the API starts you will see:

```
── LiquidAI Startup ──────────────────────────
.env found:        yes (.env)
ANTHROPIC_API_KEY: set (sk-ant-...abc123)
API port:          3001
───────────────────────────────────────────────
```

If the key shows `placeholder` or `missing`, fix `.env` and restart.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| API Key Not Set | Paste real key in `.env`, restart `npm run dev` |
| Replace placeholder | `.env` still has `YOUR_KEY_HERE` — use your real key |
| Cannot connect | Run `npm run dev` (starts API + Vite together) |
| Port in use | Dev script auto-picks next free port |

## Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (required) |
| `ANTHROPIC_AUTH_TOKEN` | Alternative auth token (optional) |
| `PORT` | API port preference (default 3001) |
