"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

export type MicStatus = "listening" | "paused" | "unavailable";

export type VoiceHandle = {
  unlock: () => void;
  speak: (text: string) => void;
};

type RecognitionResultEvent = Event & {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type RecognitionErrorEvent = Event & { error: string };

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => Recognition;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}

const triggerPattern =
  /\b(next|what(?:'s| is)? next|does this look good|look good|done|finished|am i done)\b/i;

type VoiceControllerProps = {
  active: boolean;
  busy: boolean;
  onTrigger: (utterance: string) => void;
  onStatus: (status: MicStatus) => void;
};

export const VoiceController = forwardRef<VoiceHandle, VoiceControllerProps>(
  function VoiceController({ active, busy, onTrigger, onStatus }, ref) {
    const recognitionRef = useRef<Recognition | null>(null);
    const shouldListenRef = useRef(false);
    const speakingRef = useRef(false);
    const busyRef = useRef(busy);
    const activeRef = useRef(active);
    const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

    useEffect(() => {
      busyRef.current = busy;
    }, [busy]);

    useEffect(() => {
      activeRef.current = active;
      shouldListenRef.current = active;
      if (!active) {
        try {
          recognitionRef.current?.stop();
        } catch {}
        onStatus("paused");
      }
    }, [active, onStatus]);

    useEffect(() => {
      if (!("speechSynthesis" in window)) return;
      const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
      loadVoices();
      window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
      return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    }, []);

    const startRecognition = useCallback(() => {
      const recognition = recognitionRef.current;
      if (!recognition || !shouldListenRef.current || speakingRef.current || busyRef.current) return;
      try {
        recognition.start();
        onStatus("listening");
      } catch {
        // Calling start while already listening throws in Chromium; it is harmless.
      }
    }, [onStatus]);

    const ensureRecognition = useCallback(() => {
      if (recognitionRef.current) return recognitionRef.current;
      const RecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!RecognitionApi) {
        onStatus("unavailable");
        return null;
      }

      const recognition = new RecognitionApi();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (!result?.isFinal) continue;
          const utterance = result[0]?.transcript?.trim();
          if (utterance && triggerPattern.test(utterance) && !busyRef.current) onTrigger(utterance);
        }
      };
      recognition.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          shouldListenRef.current = false;
          onStatus("unavailable");
        } else {
          onStatus("paused");
        }
      };
      recognition.onend = () => {
        if (!shouldListenRef.current || speakingRef.current || busyRef.current) return;
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(startRecognition, 300);
      };
      recognitionRef.current = recognition;
      return recognition;
    }, [onStatus, onTrigger, startRecognition]);

    useEffect(() => {
      if (!active || busy) {
        try {
          recognitionRef.current?.stop();
        } catch {}
        if (active && busy) onStatus("paused");
        return;
      }
      shouldListenRef.current = true;
      ensureRecognition();
      startRecognition();
    }, [active, busy, ensureRecognition, onStatus, startRecognition]);

    useImperativeHandle(
      ref,
      () => ({
        unlock() {
          if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            const ready = new SpeechSynthesisUtterance("Ready");
            ready.volume = 0.35;
            window.speechSynthesis.speak(ready);
          }
          shouldListenRef.current = true;
          ensureRecognition();
          startRecognition();
        },
        speak(message: string) {
          if (!("speechSynthesis" in window)) return;
          speakingRef.current = true;
          shouldListenRef.current = false;
          try {
            recognitionRef.current?.stop();
          } catch {}
          onStatus("paused");
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(message);
          utterance.rate = 1;
          utterance.lang = "en-US";
          const englishVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith("en"));
          if (englishVoice) utterance.voice = englishVoice;
          utterance.onend = utterance.onerror = () => {
            speakingRef.current = false;
            shouldListenRef.current = activeRef.current;
            if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
            restartTimerRef.current = setTimeout(startRecognition, 300);
          };
          window.speechSynthesis.speak(utterance);
        },
      }),
      [ensureRecognition, startRecognition, voices, onStatus],
    );

    useEffect(
      () => () => {
        shouldListenRef.current = false;
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        try {
          recognitionRef.current?.stop();
        } catch {}
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      },
      [],
    );

    return null;
  },
);
