export type SpeechInfo = {
  source: "openrouter" | "browser" | null;
  phase: "idle" | "generating" | "speaking" | "ready" | "unavailable";
  model: string;
  voice: string;
  latencyMs: number | null;
  error: string | null;
};

export const initialSpeechInfo: SpeechInfo = {
  source: null, phase: "idle", model: "", voice: "", latencyMs: null, error: null,
};

// Quality labels are a heuristic: the browser API has no quality score.
export function chooseBrowserVoice(voices: SpeechSynthesisVoice[]) {
  function score(voice: SpeechSynthesisVoice) {
    return (/premium|enhanced|natural|neural/i.test(`${voice.name} ${voice.voiceURI}`) ? 100 : 0)
      + (/^Google /i.test(voice.name) ? 60 : 0)
      + (voice.default ? 20 : 0) + (/^en[-_]US$/i.test(voice.lang) ? 10 : 0);
  }
  return voices.filter((voice) => /^en(?:[-_]|$)/i.test(voice.lang))
    .sort((a, b) => score(b) - score(a))[0];
}
