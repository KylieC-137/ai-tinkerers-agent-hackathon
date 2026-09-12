"use client";

import type { ProjectState } from "@/lib/state";
import type { SpeechInfo } from "@/lib/speech";

type DebugPanelProps = {
  open: boolean;
  onClose: () => void;
  state: ProjectState | null;
  observation: string;
  model: string;
  latencyMs: number | null;
  frame: string | null;
  speechInfo: SpeechInfo;
  replayDisabled: boolean;
  onReplay: () => void;
};

export function DebugPanel({
  open,
  onClose,
  state,
  observation,
  model,
  latencyMs,
  frame,
  speechInfo,
  replayDisabled,
  onReplay,
}: DebugPanelProps) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-end bg-black/65" role="dialog" aria-modal="true">
      <section className="max-h-[82vh] w-full overflow-y-auto rounded-t-[2rem] bg-[#171c16] px-5 pb-8 pt-5 shadow-2xl safe-bottom">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-[#d7ff4f]">
              Agent trace
            </div>
            <h2 className="text-xl font-bold">What the coach knows</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-11 w-11 rounded-full bg-white/10 text-xl"
            aria-label="Close debug panel"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DebugCard label="Model" value={model || "Waiting for first turn"} />
          <DebugCard label="Latency" value={latencyMs == null ? "—" : `${latencyMs} ms`} />
        </div>

        <div className="mt-3 rounded-2xl bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Coach voice</div>
              <p className="mt-1 text-sm font-semibold">{speechInfo.voice || "OpenRouter natural voice"}</p>
            </div>
            <button type="button" onClick={onReplay} disabled={replayDisabled}
              className="min-h-11 rounded-xl bg-[#d7ff4f] px-3 text-xs font-bold text-[#10140f] disabled:opacity-40">
              Replay voice
            </button>
          </div>
          <p className="mt-2 break-words text-xs text-white/60">
            {speechInfo.model || "Waiting for speech"}
            {speechInfo.latencyMs != null && ` · ${speechInfo.latencyMs} ms`}
            {` · ${speechInfo.phase}`}
          </p>
          {speechInfo.error && <p className="mt-2 text-xs text-orange-200" role="status">{speechInfo.error}</p>}
          <p className="mt-2 text-xs text-white/45">AI-generated voice. Replay reads the caption without taking a photo.</p>
        </div>

        <div className="mt-3 rounded-2xl bg-white/5 p-4">
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
            Last observation
          </div>
          <p className="text-sm leading-relaxed text-white/90">{observation || "No frame analyzed yet."}</p>
        </div>

        {frame && (
          <div className="mt-3 overflow-hidden rounded-2xl bg-white/5 p-3">
            {/* A data URL is intentional here: it is the exact last frame already held in memory. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={frame} alt="Last frame sent to the model" className="max-h-52 w-full rounded-xl object-cover" />
            <div className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
              Last frame sent
            </div>
          </div>
        )}

        <div className="mt-3 rounded-2xl bg-black/30 p-4">
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
            Persistent project state
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[#d7ff4f]">
            {JSON.stringify(state, null, 2)}
          </pre>
        </div>
      </section>
    </div>
  );
}

function DebugCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4">
      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/50">{label}</div>
      <div className="break-words text-sm font-semibold">{value}</div>
    </div>
  );
}
