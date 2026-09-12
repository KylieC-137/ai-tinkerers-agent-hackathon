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
  }
}

const triggerPattern = /\b(next|what(?:'s| is)? next|does this look good|look good|done|finished|am i done)\b/i;
const CLIENT_TIMEOUT_MS = 20_000;

// 20ms of silence. Playing it on the shared <audio> element inside the Start or
// Replay gesture is what unlocks that element, so every later turn can play the
// OpenRouter MP3 without a gesture of its own. Web Audio cannot do this job on a
// phone: mobile Safari interrupts an AudioContext whenever speech synthesis or
// the microphone takes the audio session, and an interrupted context only
// resumes from inside a gesture — which is why mobile used to fall back to the
// browser voice on every turn. A media element survives those interruptions.
const SILENT_CLIP =
  "data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

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
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef<string | null>(null);
    const audioUnlockedRef = useRef(false);
    const synthesisPrimedRef = useRef(false);
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

    const ensureAudioElement = useCallback(() => {
      if (audioRef.current) return audioRef.current;
      if (typeof window === "undefined" || typeof window.Audio === "undefined") return null;
      const element = new window.Audio();
      element.preload = "auto";
      // Detached audio still needs playsinline on iOS to avoid the media overlay.
      element.setAttribute("playsinline", "");
      audioRef.current = element;
      return element;
    }, []);

    const releaseAudio = useCallback(() => {
      const element = audioRef.current;
      if (element) {
        element.onended = null;
        element.onerror = null;
        try { element.pause(); } catch {}
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    }, []);

    const stopPlayback = useCallback(() => {
      requestRef.current?.abort();
      requestRef.current = null;
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
      releaseAudio();
      if (utteranceRef.current) {
        utteranceRef.current.onend = null;
        utteranceRef.current.onerror = null;
        utteranceRef.current = null;
      }
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    }, [releaseAudio]);

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
        const element = ensureAudioElement();
        if (!element) throw new Error("Audio playback is unavailable.");
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
        const blob = await response.blob();
        clearTimeout(timeout);
        if (turn !== turnRef.current) return;
        if (!blob.size) throw new Error("Speech service returned empty audio.");

        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        element.onended = null;
        element.onerror = null;
        element.src = url;
        element.load();
        element.onended = () => finish(turn);

        await element.play();
        if (turn !== turnRef.current) return;
        element.onerror = () => {
          if (turn !== turnRef.current) return;
          speakInBrowser(text, turn, "Natural voice stopped playing; using browser voice.");
        };

        const latency = Number(response.headers.get("x-speech-latency-ms"));
        report({ source: "openrouter", phase: "speaking",
          model: response.headers.get("x-speech-model") || "OpenRouter TTS",
          voice: response.headers.get("x-speech-voice") || "Configured voice",
          latencyMs: Number.isFinite(latency) ? latency : null, error: null });

        const duration = Number.isFinite(element.duration) ? element.duration : 0;
        watchdogRef.current = setTimeout(
          () => finish(turn),
          duration > 0 ? Math.ceil(duration * 1000) + 3000 : Math.max(20_000, text.length * 120),
        );
      } catch (error) {
        if (turn !== turnRef.current) return;
        const reason = controller.signal.aborted ? "Speech generation timed out; using browser voice."
          : `${error instanceof Error ? error.message : "Speech generation failed."} Using browser voice.`;
        speakInBrowser(text, turn, reason);
      } finally {
        clearTimeout(timeout);
        if (requestRef.current === controller) requestRef.current = null;
      }
    }, [ensureAudioElement, finish, pauseRecognition, report, speakInBrowser, stopPlayback]);

    // Primes speech synthesis so the fallback path is still allowed later on iOS,
    // without letting it hold the audio session: a muted, one-space utterance
    // satisfies the gesture requirement and ends immediately.
    const primeSpeechSynthesis = useCallback(() => {
      if (synthesisPrimedRef.current || !("speechSynthesis" in window)) return;
      try {
        const primer = new SpeechSynthesisUtterance(" ");
        primer.volume = 0;
        primer.rate = 2;
        window.speechSynthesis.speak(primer);
        synthesisPrimedRef.current = true;
      } catch {}
    }, []);

    const unlockAudio = useCallback(() => {
      primeSpeechSynthesis();
      const element = ensureAudioElement();
      if (!element || audioUnlockedRef.current) return;
      try {
        element.src = SILENT_CLIP;
        element.load();
        const played = element.play();
        if (played && typeof played.then === "function") {
          played.then(() => { audioUnlockedRef.current = true; }, () => {});
        } else {
          audioUnlockedRef.current = true;
        }
      } catch {}
    }, [ensureAudioElement, primeSpeechSynthesis]);

    useImperativeHandle(ref, () => ({
      unlock() {
        activeRef.current = true;
        unlockAudio();
        ensureRecognition();
        // "Ready" runs the real speech path, so the natural voice is proven
        // working — and audible — before the first coaching turn.
        void speak("Ready");
      },
      speak(text) {
        unlockAudio();
        void speak(text);
      },
    }), [ensureRecognition, speak, unlockAudio]);

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
      audioRef.current = null;
      audioUnlockedRef.current = false;
    }, [stopPlayback]);

    return null;
  },
);
