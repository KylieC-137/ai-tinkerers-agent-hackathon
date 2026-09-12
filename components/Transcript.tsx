"use client";

export type TranscriptTurn = {
  id: string;
  role: "user" | "agent";
  text: string;
};

export function Transcript({ turns }: { turns: TranscriptTurn[] }) {
  return (
    <details className="glass absolute inset-x-3 bottom-32 z-20 max-h-[52vh] overflow-hidden rounded-3xl border border-white/15 shadow-2xl">
      <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-bold tracking-wide">
        <span>TRANSCRIPT</span>
        <span className="text-xs text-white/60">{turns.length} turns · tap to expand</span>
      </summary>
      <div className="max-h-[40vh] space-y-3 overflow-y-auto border-t border-white/10 px-4 py-4">
        {turns.length === 0 ? (
          <p className="text-sm text-white/60">The conversation will appear here.</p>
        ) : (
          turns.map((turn) => (
            <div
              key={turn.id}
              className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                turn.role === "agent" ? "bg-[#d7ff4f] text-[#10140f]" : "bg-white/10 text-white"
              }`}
            >
              <div className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] opacity-60">
                {turn.role === "agent" ? "Coach" : "You"}
              </div>
              {turn.text}
            </div>
          ))
        )}
      </div>
    </details>
  );
}
