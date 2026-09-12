# Build Coach contributor guide

## Stack

- Next.js App Router with TypeScript and Tailwind CSS
- One client page; Node.js API route with a 60-second platform budget
- Plain `fetch` to OpenRouter; no LLM framework
- Browser camera and Web Speech Recognition; OpenRouter MP3 speech output with browser speech fallback
- React state mirrored to `localStorage`; no database, auth, or accounts

## Conventions

- Keep `ProjectState` generic. Never add hook-specific fields to its type; learned domain values belong in `facts`.
- Keep activity knowledge in `lib/playbooks/`. Adding an activity should require one playbook file and one registry entry.
- Capture and send only one frame per user trigger. Never add continuous capture or streaming.
- The model decides progression from the frame, state, user words, and playbook. Do not encode the demo sequence as application conditionals.
- Preserve the last good state on model, timeout, or parsing failure.
- Spoken output stays under two short sentences and is always duplicated in the visual caption.
- Speech output uses `/api/speech` and OpenRouter's dedicated `/api/v1/audio/speech` endpoint. Keep all OpenRouter fetch calls in `lib/openrouter.ts`. Use the existing key; optional `OPENROUTER_TTS_MODEL` and `OPENROUTER_TTS_VOICE` must be a supported pair.
- Play the returned MP3 through one reusable `HTMLAudioElement`, unlocked with a silent clip inside the Start/Replay gesture. Do not route speech through Web Audio: mobile Safari interrupts an `AudioContext` whenever speech synthesis or the microphone takes the audio session, and an interrupted context only resumes from inside a gesture, which forced every phone turn onto the browser voice.
- Prime speech synthesis from the Start gesture with a muted one-space utterance so the fallback voice stays permitted on iOS without holding the audio session.
- Cancel superseded speech; pause the mic during generation/playback and for 300ms afterward. Replay must not capture an image or advance the project.
- Never expose `OPENROUTER_API_KEY` through a `NEXT_PUBLIC_` variable or browser code.

## Recorded decisions

See `decisions.md`. In particular, pnpm replaces the broken global npm installation, and the fallback IDs were updated after checking OpenRouter’s live model catalog.

## Run and verify

```bash
pnpm install
Copy-Item .env.example .env.local  # PowerShell
pnpm dev
```

In a second terminal:

```bash
pnpm test:step
pnpm test:step 02-metal-mode.jpg
pnpm test:step 04-wrong-anchor.jpg wood-state.json next
pnpm typecheck
pnpm build
```

The test script targets `http://localhost:3000` unless `BUILD_COACH_URL` is set. It sends a checked-in fixture as a JPEG data URL and prints the full state, actual routed model, and latency.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
