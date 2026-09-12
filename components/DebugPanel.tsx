"use client";

import type { ProjectState } from "@/lib/state";

type DebugPanelProps = {
  open: boolean;
  onClose: () => void;
  state: ProjectState | null;
  observation: string;
  model: string;
  latencyMs: number | null;
  frame: string | null;
};

export function DebugPanel({
  open,
  onClose,
  state,
  observation,
  model,
  latencyMs,
  frame,
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
