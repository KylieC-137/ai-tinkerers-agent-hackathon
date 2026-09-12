"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraView, type CameraHandle } from "@/components/CameraView";
import { DebugPanel } from "@/components/DebugPanel";
import { Transcript, type TranscriptTurn } from "@/components/Transcript";
import {
  VoiceController,
  type MicStatus,
  type VoiceHandle,
} from "@/components/VoiceController";
import type { ProjectState, StepApiResult } from "@/lib/state";

const STORAGE_KEY = "build-coach:last-session:v1";
const DEMO_GOAL =
  "My goal is to put up a hook in the wall but I'm not sure where to drill and how to do it. I'm using these hooks and I have this stud finder.";

type SavedSession = {
  goal: string;
  activityId: string;
  state: ProjectState;
  transcript: TranscriptTurn[];
  lastSpeak: string;
};

export default function Home() {
  const [goal, setGoal] = useState(DEMO_GOAL);
  const [activityId, setActivityId] = useState("wall-hook");
  const [sessionActive, setSessionActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [micStatus, setMicStatus] = useState<MicStatus>("paused");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ProjectState | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [caption, setCaption] = useState("Point the camera at your work.");
  const [observation, setObservation] = useState("");
  const [model, setModel] = useState("");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastFrame, setLastFrame] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [hasSavedSession, setHasSavedSession] = useState(false);

  const cameraRef = useRef<CameraHandle>(null);
  const voiceRef = useRef<VoiceHandle>(null);
  const stateRef = useRef<ProjectState | null>(null);
  const pendingStartRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    try {
      setHasSavedSession(Boolean(localStorage.getItem(STORAGE_KEY)));
    } catch {}
  }, []);

  useEffect(
    () => () => {
      stream?.getTracks().forEach((track) => track.stop());
    },
    [stream],
  );

  const persist = useCallback(
    (nextState: ProjectState, nextTranscript: TranscriptTurn[], lastSpeak: string) => {
      try {
        const saved: SavedSession = {
          goal,
          activityId,
          state: nextState,
          transcript: nextTranscript,
          lastSpeak,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        setHasSavedSession(true);
      } catch {}
    },
    [activityId, goal],
  );

  const runTurn = useCallback(
    async (utterance: string, stateOverride?: ProjectState | null) => {
      if (busyRef.current) return;
      const frame = cameraRef.current?.capture();
      if (!frame) {
        const message = "The camera is still waking up. Hold steady and tap next again.";
        setCaption(message);
        voiceRef.current?.speak(message);
        return;
      }

      busyRef.current = true;
      setBusy(true);
      setLastFrame(frame);
      const userTurn: TranscriptTurn = {
        id: `${Date.now()}-user`,
        role: "user",
        text: utterance,
      };
      setTranscript((turns) => [...turns, userTurn]);

      try {
        const response = await fetch("/api/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goal,
            activityId,
            state: stateOverride === undefined ? stateRef.current : stateOverride,
            utterance,
            imageDataUrl: frame,
          }),
        });
        const payload = (await response.json()) as StepApiResult & { error?: string };
        if (!response.ok) throw new Error(payload.error || "The coach request failed.");

        stateRef.current = payload.state;
        setState(payload.state);
        setObservation(payload.observation);
        setModel(payload.model);
        setLatencyMs(payload.latencyMs);
        setCaption(payload.speak);
        const agentTurn: TranscriptTurn = {
          id: `${Date.now()}-agent`,
          role: "agent",
          text: payload.speak,
        };
        setTranscript((turns) => {
          const next = [...turns, agentTurn];
          persist(payload.state, next, payload.speak);
          return next;
        });
        voiceRef.current?.speak(payload.speak);
      } catch (error) {
        const details = error instanceof Error ? error.message : "Unknown error";
        const message = details.includes("OPENROUTER_API_KEY")
          ? "The OpenRouter key is missing. Add it on the server, then tap next."
          : "I didn't get a clear read on that. Hold the camera steady and say next.";
        setCaption(message);
        setModel("request failed");
        setObservation(details);
        setTranscript((turns) => [
          ...turns,
          { id: `${Date.now()}-error`, role: "agent", text: message },
        ]);
        voiceRef.current?.speak(message);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [activityId, goal, persist],
  );

  const requestMedia = useCallback(async () => {
    setCameraError("");
    const cameraPromise = navigator.mediaDevices?.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    const micPromise = navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((micStream) => micStream.getTracks().forEach((track) => track.stop()))
      .catch(() => setMicStatus("unavailable"));

    if (!cameraPromise) throw new Error("Camera access requires HTTPS or localhost.");
    const cameraStream = await cameraPromise;
    await micPromise;
    return cameraStream;
  }, []);

  const start = useCallback(async () => {
    if (!goal.trim()) return;
    voiceRef.current?.unlock();
    pendingStartRef.current = true;
    setState(null);
    setTranscript([]);
    setCaption("Looking at your project…");
    setSessionActive(true);
    try {
      setStream(await requestMedia());
    } catch (error) {
      pendingStartRef.current = false;
      setCameraError(error instanceof Error ? error.message : "Camera access was denied.");
    }
  }, [goal, requestMedia]);

  const resume = useCallback(async () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedSession;
      setGoal(saved.goal);
      setActivityId(saved.activityId);
      setState(saved.state);
      stateRef.current = saved.state;
      setTranscript(saved.transcript || []);
      setCaption(saved.lastSpeak || "Session restored. Say next when you're ready.");
      pendingStartRef.current = false;
      voiceRef.current?.unlock();
      setSessionActive(true);
      setStream(await requestMedia());
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Could not resume this session.");
      setSessionActive(true);
    }
  }, [requestMedia]);

  const handleCameraReady = useCallback(() => {
    if (!pendingStartRef.current) return;
    pendingStartRef.current = false;
    void runTurn("start", null);
  }, [runTurn]);

  const handleVoiceTrigger = useCallback(
    (utterance: string) => {
      void runTurn(utterance);
    },
    [runTurn],
  );

  return (
    <main className="min-h-[100dvh] bg-[#10140f]">
      <VoiceController
        ref={voiceRef}
        active={sessionActive}
        busy={busy}
        onTrigger={handleVoiceTrigger}
        onStatus={setMicStatus}
      />

      {!sessionActive ? (
        <section className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-8 pt-8 safe-bottom">
          <div className="mb-auto">
            <div className="mb-8 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#d7ff4f] text-xl font-black text-[#10140f]">
                B
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight">Build Coach</h1>
                <p className="text-xs text-white/55">LOOK · REMEMBER · ADAPT</p>
              </div>
            </div>

            <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#d7ff4f]">Your project</p>
            <h2 className="mb-6 max-w-sm text-4xl font-black leading-[0.98] tracking-tight">
              Keep your hands on the work.
            </h2>

            <label className="mb-2 block text-sm font-bold" htmlFor="goal">
              What are you building?
            </label>
            <textarea
              id="goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              rows={5}
              className="w-full resize-none rounded-3xl border border-white/15 bg-white/7 px-5 py-4 text-base leading-relaxed text-white outline-none transition focus:border-[#d7ff4f]"
            />

            <label className="mb-2 mt-4 block text-sm font-bold" htmlFor="activity">
              Playbook
            </label>
            <select
              id="activity"
              value={activityId}
              onChange={(event) => setActivityId(event.target.value)}
              className="w-full rounded-2xl border border-white/15 bg-[#1b201a] px-4 py-4 text-white outline-none focus:border-[#d7ff4f]"
            >
              <option value="wall-hook">Wall hook</option>
            </select>
          </div>

          <div className="mt-8 space-y-3">
            {hasSavedSession && (
              <button
                type="button"
                onClick={resume}
                className="w-full py-3 text-sm font-bold text-[#d7ff4f] underline underline-offset-4"
              >
                Resume last session
              </button>
            )}
            <button
              type="button"
              onClick={start}
              disabled={!goal.trim()}
              className="h-16 w-full rounded-2xl bg-[#d7ff4f] text-lg font-black text-[#10140f] shadow-[0_0_40px_rgba(215,255,79,0.18)] disabled:opacity-40"
            >
              START COACHING
            </button>
            <p className="text-center text-xs leading-relaxed text-white/45">
              Camera frames are sent only when you say a trigger phrase or tap a button.
            </p>
          </div>
        </section>
      ) : (
        <section className="relative h-[100dvh] w-full overflow-hidden bg-black">
          {stream ? (
            <CameraView
              ref={cameraRef}
              stream={stream}
              onReady={handleCameraReady}
              onError={setCameraError}
            />
          ) : (
            <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_center,#273124,#10140f_65%)] px-8 text-center">
              <div>
                <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full border border-white/20 text-3xl">
                  ◉
                </div>
                <h2 className="text-xl font-bold">Camera unavailable</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  {cameraError || "Waiting for camera permission…"}
                </p>
                {cameraError && (
                  <p className="mt-3 text-xs text-[#d7ff4f]">
                    Enable Camera for this site in browser settings, reload, then resume the session.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/85" />

          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="glass rounded-full border border-white/15 px-3 py-2 text-[11px] font-black tracking-[0.16em]">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#d7ff4f]" />
              BUILD COACH
            </div>
            <button
              type="button"
              onClick={() => setDebugOpen(true)}
              className="glass h-11 w-11 rounded-full border border-white/15 text-base font-black"
              aria-label="Open agent debug panel"
            >
              i
            </button>
          </div>

          <div className="absolute inset-x-5 bottom-52 z-10">
            {state?.currentStepId && (
              <div className="mb-3 inline-flex rounded-full bg-black/55 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#d7ff4f] backdrop-blur-md">
                {state.steps.find((step) => step.id === state.currentStepId)?.title}
              </div>
            )}
            <p className="max-w-xl text-3xl font-black leading-tight tracking-tight drop-shadow-lg">{caption}</p>
          </div>

          <Transcript turns={transcript} />

          <div className="glass absolute inset-x-0 bottom-0 z-30 border-t border-white/10 px-4 pt-3 safe-bottom">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span
                className={`rounded-full px-3 py-1.5 font-bold ${
                  micStatus === "listening"
                    ? "bg-[#d7ff4f]/15 text-[#d7ff4f]"
                    : micStatus === "unavailable"
                      ? "bg-orange-400/15 text-orange-200"
                      : "bg-white/10 text-white/65"
                }`}
              >
                {micStatus === "listening"
                  ? "● listening"
                  : micStatus === "unavailable"
                    ? "voice unavailable — use button"
                    : "mic paused"}
              </span>
              <span className="text-white/45">Say “next”</span>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void runTurn("next")}
                disabled={busy || !stream}
                className="h-16 flex-1 rounded-2xl bg-[#d7ff4f] text-xl font-black text-[#10140f] disabled:opacity-50"
              >
                {busy ? "LOOKING…" : "NEXT"}
              </button>
              <button
                type="button"
                onClick={() => void runTurn("done?")}
                disabled={busy || !stream}
                className="h-16 rounded-2xl border border-white/20 bg-white/10 px-5 text-sm font-black disabled:opacity-50"
              >
                DONE?
              </button>
            </div>
          </div>

          <DebugPanel
            open={debugOpen}
            onClose={() => setDebugOpen(false)}
            state={state}
            observation={observation}
            model={model}
            latencyMs={latencyMs}
            frame={lastFrame}
          />
        </section>
      )}
    </main>
  );
}
