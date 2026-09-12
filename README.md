# Build Coach

Build Coach is a mobile-first, hands-free visual agent for physical work. A user props up a phone, says “next,” and the app captures exactly one camera frame, combines it with persistent project state and a swappable activity playbook, asks a vision-language model what changed, then speaks one concrete next action. The first playbook installs a wall hook and demonstrates the core thesis: the coach sees mistakes, remembers whether the wall is a stud or hollow drywall, and changes its hardware advice accordingly.

## Architecture

```text
phone camera ── one JPEG on trigger ──┐
voice/button ── utterance ────────────┼──> POST /api/step
localStorage ── ProjectState ─────────┘          │
                                                 ├── system rules
                                                 ├── activity playbook
                                                 └── OpenRouter vision model
                                                          │
                  caption + speech <── StepResult JSON <──┘
                  transcript/state ──> React + localStorage
```

The API key stays in the Node.js route. The browser sends the current goal, activity ID, state, trigger utterance, and one downscaled JPEG. The response contains the full next state, visible observation, mistake, short spoken line, completion flags, the model that actually answered, and latency.

## Local setup

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

On Windows PowerShell, use `Copy-Item .env.example .env.local`. Add your OpenRouter key to `.env.local`, then open [http://localhost:3000](http://localhost:3000). Camera access works on localhost; a real phone needs HTTPS.

Environment variables:

```ini
OPENROUTER_API_KEY=              # required, server-only
OPENROUTER_MODEL=google/gemini-3.8-flash
OPENROUTER_FALLBACK_MODELS=openai/gpt-5.6-luna,anthropic/claude-sonnet-5
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The default IDs were checked against OpenRouter’s public model catalog and accept image input. Every request supplies both `model` and ordered `models`, letting OpenRouter move to the fallbacks when a provider fails, rate-limits, moderates, or rejects context. The response’s actual `model` is shown in the agent trace panel. Structured JSON is requested explicitly; models that reject that option get one retry without it. Timeouts get one retry, and invalid output preserves the last good state.

## Backend fixture test

With the dev server running in one terminal and a valid key configured:

```bash
pnpm test:step
pnpm test:step 02-metal-mode.jpg
pnpm test:step 04-wrong-anchor.jpg wood-state.json next
```

The optional arguments are image filename, state filename, and utterance. Set `BUILD_COACH_URL` to test a deployed URL. The script prints the full result, actual model, and latency. The checked-in images are deliberately labeled placeholders; replace them with real photos using the same filenames before prompt tuning.

## Deploy to Vercel

```bash
pnpm dlx vercel@latest login
pnpm dlx vercel@latest
pnpm dlx vercel@latest env add OPENROUTER_API_KEY production
pnpm dlx vercel@latest env add OPENROUTER_MODEL production
pnpm dlx vercel@latest env add OPENROUTER_FALLBACK_MODELS production
pnpm dlx vercel@latest env add NEXT_PUBLIC_APP_URL production
pnpm dlx vercel@latest --prod
```

Set `NEXT_PUBLIC_APP_URL` to the final HTTPS origin. No secret is committed or sent to the browser.

## Add a playbook

Create one file in `lib/playbooks/` with an ID, name, summary, ordered steps, hardware or object descriptions, branch facts, common mistakes, and completion evidence. Import it and add one line to the registry in `lib/playbooks/index.ts`. The state, API, camera, voice, transcript, and debug UI need no activity-specific changes.

## Useful commands

```bash
pnpm dev
pnpm typecheck
pnpm build
pnpm test:step
```
