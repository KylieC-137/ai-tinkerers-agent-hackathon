"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { chooseBrowserVoice, initialSpeechInfo, type SpeechInfo } from "@/lib/speech";

export type MicStatus = "listening" | "paused" | "unavailable";
export type VoiceHandle = { unlock: () => void; speak: (text: string) => void };

type RecognitionResultEvent = Event & {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  start: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => Recognition;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
    webkitAudioContext?: typeof AudioContext;
  }
}

const triggerPattern = /\b(next|what(?:'s| is)? next|does this look good|look good|done|finished|am i done)\b/i;
const CLIENT_TIMEOUT_MS = 15_000;

type VoiceControllerProps = {
  active: boolean;
  busy: boolean;
  onTrigger: (utterance: string) => void;
  onStatus: (status: MicStatus) => void;
  onSpeech: (info: SpeechInfo) => void;
};

export const VoiceController = forwardRef<VoiceHandle, VoiceControllerProps>(
  function VoiceController({ active, busy, onTrigger, onStatus, onSpeech }, ref) {
    const recognitionRef = useRef<Recognition | null>(null);
    const recognitionRunningRef = useRef(false);
    const recognitionBlockedRef = useRef(false);
    const speakingRef = useRef(false);
    const activeRef = useRef(active);
    const busyRef = useRef(busy);
    const triggerRef = useRef(onTrigger);
    const speechInfoRef = useRef<SpeechInfo>(initialSpeechInfo);
    const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const requestRef = useRef<AbortController | null>(null);
    const turnRef = useRef(0);
    const resumeAtRef = useRef(0);
    const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { triggerRef.current = onTrigger; }, [onTrigger]);

    const report = useCallback((info: SpeechInfo) => {
      speechInfoRef.current = info;
      onSpeech(info);
    }, [onSpeech]);

    const pauseRecognition = useCallback(() => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
      try { recognitionRef.current?.abort(); } catch {}
      onStatus(recognitionBlockedRef.current ? "unavailable" : "paused");
    }, [onStatus]);

    const startRecognition = useCallback(() => {
      if (!activeRef.current || busyRef.current || speakingRef.current ||
          recognitionBlockedRef.current || recognitionRunningRef.current ||
          Date.now() < resumeAtRef.current) return;
      try {
        recognitionRef.current?.start();
        if (recognitionRef.current) recognitionRunningRef.current = true;
      } catch {
        // A still-ending recognition session will restart from onend.
      }
    }, []);

    const scheduleRecognition = useCallback(() => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = setTimeout(() => {
        resumeTimerRef.current = null;
        startRecognition();
      }, Math.max(300, resumeAtRef.current - Date.now()));
    }, [startRecognition]);

    const ensureRecognition = useCallback(() => {
      if (recognitionRef.current) return;
      const RecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!RecognitionApi) {
        recognitionBlockedRef.current = true;
        onStatus("unavailable");
        return;
      }
      const recognition = new RecognitionApi();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognition.onstart = () => {
        if (speakingRef.current || busyRef.current || !activeRef.current) {
          pauseRecognition();
          return;
        }
        onStatus("listening");
      };
      recognition.onresult = (event) => {
        if (!activeRef.current || busyRef.current || speakingRef.current ||
            Date.now() < resumeAtRef.current) return;
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const utterance = result?.[0]?.transcript?.trim();
          if (result?.isFinal && utterance && triggerPattern.test(utterance)) {
            pauseRecognition();
            triggerRef.current(utterance);
            break;
          }
        }
      };
      recognition.onerror = (event) => {
        if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error)) {
          recognitionBlockedRef.current = true;
        }
        onStatus(recognitionBlockedRef.current ? "unavailable" : "paused");
      };
      recognition.onend = () => {
        recognitionRunningRef.current = false;
        if (activeRef.current && !speakingRef.current && !busyRef.current &&
            !recognitionBlockedRef.current) scheduleRecognition();
      };
      recognitionRef.current = recognition;
    }, [onStatus, pauseRecognition, scheduleRecognition]);

    const stopPlayback = useCallback(() => {
      requestRef.current?.abort();
      requestRef.current = null;
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
      const source = sourceRef.current;
      sourceRef.current = null;
      if (source) {
        source.onended = null;
        try { source.stop(); } catch {}
        source.disconnect();
      }
      if (utteranceRef.current) {
        utteranceRef.current.onend = null;
        utteranceRef.current.onerror = null;
        utteranceRef.current = null;
      }
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    }, []);

    const finish = useCallback((turn: number) => {
      if (turn !== turnRef.current) return;
      stopPlayback();
      speakingRef.current = false;
      resumeAtRef.current = Date.now() + 300;
      if (speechInfoRef.current.phase !== "unavailable") {
        report({ ...speechInfoRef.current, phase: "ready" });
      }
      scheduleRecognition();
    }, [report, scheduleRecognition, stopPlayback]);

    const speakInBrowser = useCallback((text: string, turn: number, reason: string | null) => {
      if (turn !== turnRef.current) return;
      stopPlayback();
      if (!("speechSynthesis" in window)) {
        report({ ...initialSpeechInfo, phase: "unavailable", error: "Audio unavailable. Follow the caption." });
        finish(turn);
        return;
      }
      const available = window.speechSynthesis.getVoices();
      const voice = chooseBrowserVoice(available.length ? available : voicesRef.current);
      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.lang = voice?.lang || "en-US";
      if (voice) utterance.voice = voice;
      report({ source: "browser", phase: "speaking", model: "Browser speech",
        voice: voice?.name || "System default", latencyMs: null, error: reason });
      utterance.onend = () => finish(turn);
      const fail = () => {
        if (turn !== turnRef.current) return;
        report({ ...speechInfoRef.current, phase: "unavailable", error: "Audio could not play. Follow the caption and tap Replay voice." });
        finish(turn);
      };
      utterance.onerror = fail;
      // Some mobile engines omit completion events. Never leave the mic locked.
      watchdogRef.current = setTimeout(fail, Math.min(90_000, Math.max(20_000, text.length * 120)));
      try { window.speechSynthesis.speak(utterance); } catch { fail(); }
    }, [finish, report, stopPlayback]);

    const speak = useCallback(async (text: string) => {
      const turn = ++turnRef.current;
      stopPlayback();
      speakingRef.current = true;
      pauseRecognition();
      report({ ...initialSpeechInfo, source: "openrouter", phase: "generating" });
      const controller = new AbortController();
      requestRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
      try {
        const response = await fetch("/api/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Speech service returned HTTP ${response.status}.`);
        if (!response.headers.get("content-type")?.startsWith("audio/mpeg")) {
          throw new Error("Speech service returned invalid audio.");
        }
        const bytes = await response.arrayBuffer();
        clearTimeout(timeout);
        if (turn !== turnRef.current) return;
        const context = audioContextRef.current;
        if (!context || context.state === "closed") throw new Error("Tap Replay voice to enable audio.");
        if (context.state !== "running") {
          // A browser may revoke autoplay while the phone is backgrounded.
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Tap Replay voice to enable audio.")), 1500);
            context.resume().then(() => { clearTimeout(timer); resolve(); }, (error) => { clearTimeout(timer); reject(error); });
          });
        }
        const buffer = await context.decodeAudioData(bytes);
        if (turn !== turnRef.current) return;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        sourceRef.current = source;
        source.onended = () => finish(turn);
        const latency = Number(response.headers.get("x-speech-latency-ms"));
        report({ source: "openrouter", phase: "speaking",
          model: response.headers.get("x-speech-model") || "OpenRouter TTS",
          voice: response.headers.get("x-speech-voice") || "Configured voice",
          latencyMs: Number.isFinite(latency) ? latency : null, error: null });
        source.start();
        watchdogRef.current = setTimeout(() => finish(turn), Math.ceil(buffer.duration * 1000) + 3000);
      } catch (error) {
        if (turn !== turnRef.current) return;
        const reason = controller.signal.aborted ? "Speech generation timed out; using browser voice."
          : `${error instanceof Error ? error.message : "Speech generation failed."} Using browser voice.`;
        speakInBrowser(text, turn, reason);
      } finally {
        clearTimeout(timeout);
        if (requestRef.current === controller) requestRef.current = null;
      }
    }, [finish, pauseRecognition, report, speakInBrowser, stopPlayback]);

    const unlockAudio = useCallback(() => {
      try {
        const AudioApi = window.AudioContext || window.webkitAudioContext;
        if (!AudioApi) return;
        const context = audioContextRef.current ?? new AudioApi();
        audioContextRef.current = context;
        // Start a silent sample synchronously inside the Start/Replay gesture.
        void context.resume().catch(() => {});
        const source = context.createBufferSource();
        source.buffer = context.createBuffer(1, 1, 22050);
        source.connect(context.destination);
        source.onended = () => source.disconnect();
        source.start();
      } catch {}
    }, []);

    useImperativeHandle(ref, () => ({
      unlock() {
        activeRef.current = true;
        unlockAudio();
        ensureRecognition();
        const turn = ++turnRef.current;
        stopPlayback();
        speakingRef.current = true;
        pauseRecognition();
        // Immediate local utterance preserves the iOS speech user gesture.
        speakInBrowser("Ready", turn, null);
      },
      speak(text) {
        unlockAudio();
        void speak(text);
      },
    }), [ensureRecognition, pauseRecognition, speak, speakInBrowser, stopPlayback, unlockAudio]);

    useEffect(() => {
      if (!("speechSynthesis" in window)) return;
      const load = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
      load();
      window.speechSynthesis.addEventListener("voiceschanged", load);
      return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
    }, []);

    useEffect(() => {
      activeRef.current = active;
      busyRef.current = busy;
      if (!active || busy) {
        pauseRecognition();
        if (!active) {
          ++turnRef.current;
          stopPlayback();
          speakingRef.current = false;
        }
        return;
      }
      ensureRecognition();
      if (!speakingRef.current) scheduleRecognition();
    }, [active, busy, ensureRecognition, pauseRecognition, scheduleRecognition, stopPlayback]);

    useEffect(() => () => {
      activeRef.current = false;
      ++turnRef.current;
      stopPlayback();
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onend = null;
        recognition.onresult = null;
        recognition.onstart = null;
        recognition.onerror = null;
        try { recognition.abort(); } catch {}
      }
      recognitionRef.current = null;
      recognitionRunningRef.current = false;
      const context = audioContextRef.current;
      audioContextRef.current = null;
      void context?.close().catch(() => {});
    }, [stopPlayback]);

    return null;
  },
);
