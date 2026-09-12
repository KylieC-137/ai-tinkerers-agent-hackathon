# Build Coach decisions

- Use `pnpm` because the machine's global `npm` installation is incomplete; this does not change the Next.js stack.
- Use `google/gemini-3.8-flash` as the primary model. A live OpenRouter catalog check on 2026-09-12 confirmed it accepts image input.
- Replace the nonexistent fallback aliases `~openai/gpt-sol-latest` and `~anthropic/claude-sonnet-latest` with current vision-capable catalog IDs `openai/gpt-5.6-luna` and `anthropic/claude-sonnet-5`.
- Keep the activity schema generic. Activity-specific steps, facts, hardware cues, branches, and mistakes live only in the playbook.
- If the model fails, times out twice, or returns invalid JSON, preserve the last good state and return a safe retry instruction rather than inventing progress.
- Treat a direct button tap as the utterance `next`, and the Done button as `done?`, so button and voice paths exercise the same agent loop.
- Request camera and microphone permissions from the Start/Resume gesture. If microphone permission or Speech Recognition is unavailable, continue in clearly labeled button-only mode.
- User requested a more natural voice and explicitly authorized OpenRouter speech models, superseding the original browser-only output constraint. Use the dedicated OpenRouter `/api/v1/audio/speech` endpoint with `x-ai/grok-voice-tts-1.0` / `eve` by default (verified in the live speech catalog on 2026-09-12). Reuse the existing server API key. Browser speech recognition remains the input path.
- Generate MP3 from the coach's exact completed caption, with no camera frame or project state sent to the speech endpoint. Return the caption immediately and synthesize separately so a speech failure never rolls back project state.
- Unlock Web Audio from Start/Resume, cancel superseded speech, and keep recognition paused through generation/playback plus 300ms. Use ranked browser English voices on generation/playback failure; display the fallback reason and speech model/voice/latency in the existing debug panel. Replay provides a fresh user gesture without capturing a frame.
