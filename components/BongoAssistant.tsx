"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
  SlidersHorizontal,
  Pause,
  Play,
  Globe,
  RotateCcw,
  History,
  ChevronDown,
  ChevronUp,
  Hand,
} from "lucide-react";
import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import PlasmaOrb, { type AssistantPhase } from "./PlasmaOrb";
import BongoMascot from "./BongoMascot";
import SettingsDialog, { type BongoSettings } from "./SettingsDialog";
import PlatformGuideDialog, { type GuideTopic } from "./PlatformGuideDialog";
import {
  LIVE_TOOL_DECLARATIONS,
  arrayBufferToBase64,
  formatCallDuration,
  pcm24kBase64ToFloat32,
} from "@/lib/live-voice-client";
import type { VisitedSite } from "@/lib/web-browser";

interface Turn {
  id: string;
  userText: string;
  aiText: string;
  spokenText: string;
  language: "bn" | "en";
  visitedSites: VisitedSite[];
  usedTools: string[];
  mode: "gemini-live" | "gemini" | "live-web";
  timestamp: string;
}

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionResultItem;
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResult>;
  resultIndex: number;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const DEFAULT_SETTINGS: BongoSettings = {
  language: "auto",
  voiceEnabled: true,
  speechRate: 1.0,
  geminiApiKey: "",
  elevenLabsKey: "",
};

const QUICK_PROMPTS = [
  { label: "আজকের নিউজ বলো", prompt: "আজকের নিউজ বলো" },
  {
    label: "BBC বাংলা ভিজিট করো",
    prompt: "https://www.bbc.com/bengali ভিজিট করে প্রধান খবরগুলো বলো",
  },
  { label: "ঢাকার আবহাওয়া", prompt: "ঢাকার আবহাওয়া কেমন?" },
  {
    label: "Latest Tech News",
    prompt: "Tell me today's latest AI and technology news",
  },
];

function AppleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="w-3.5 h-3.5">
      <path fill="#f25022" d="M2 3h9.2v9.2H2z" />
      <path fill="#7fba00" d="M12.8 3H22v9.2h-9.2z" />
      <path fill="#00a4ef" d="M2 13.8h9.2V23H2z" />
      <path fill="#ffb900" d="M12.8 13.8H22V23h-9.2z" />
    </svg>
  );
}

function splitSentencesForSpeech(text: string): string[] {
  const parts = text
    .split(/(?<=[।.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

export default function BongoAssistant() {
  const [phase, setPhase] = useState<AssistantPhase>("idle");
  const [liveActive, setLiveActive] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [liveCaptionUser, setLiveCaptionUser] = useState("");
  const [liveCaptionAi, setLiveCaptionAi] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [spectrum, setSpectrum] = useState<Uint8Array | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [motionPaused, setMotionPaused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideTopic, setGuideTopic] = useState<GuideTopic>(null);
  const [settings, setSettings] = useState<BongoSettings>(DEFAULT_SETTINGS);
  const [serverGeminiConfigured, setServerGeminiConfigured] = useState(false);

  const hasGemini = Boolean(
    settings.geminiApiKey.trim() || serverGeminiConfigured
  );

  const inputId = useId();
  const promptInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const inAnalyserRef = useRef<AnalyserNode | null>(null);
  const outAnalyserRef = useRef<AnalyserNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const scriptProcRef = useRef<ScriptProcessorNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextPlayTimeRef = useRef(0);
  const liveSessionRef = useRef<Session | null>(null);
  const liveActiveRef = useRef(false);
  const micMutedRef = useRef(false);
  const liveToolBusyRef = useRef(false);
  const liveReconnectCountRef = useRef(0);
  const continuousFallbackRef = useRef(false);
  const liveUserBufRef = useRef("");
  const liveAiBufRef = useRef("");
  const liveSitesBufRef = useRef<VisitedSite[]>([]);

  const micRafRef = useRef<number>(0);
  const speakAnimRef = useRef<number>(0);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechSessionRef = useRef(0);
  const interimRef = useRef("");
  const phaseRef = useRef<AssistantPhase>("idle");
  const voiceEnabledRef = useRef(settings.voiceEnabled);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted]);

  useEffect(() => {
    voiceEnabledRef.current = settings.voiceEnabled;
  }, [settings.voiceEnabled]);

  // Call duration clock during continuous voice call
  useEffect(() => {
    if (!liveActive) {
      setCallSeconds(0);
      return;
    }
    const id = window.setInterval(() => {
      setCallSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [liveActive]);

  // Load saved settings and detect server Gemini configuration
  useEffect(() => {
    try {
      const raw = localStorage.getItem("bongo-ai-settings-v1");
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<BongoSettings>;
        setSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore storage errors
    }

    fetch("/api/assistant")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.geminiConfigured) {
          setServerGeminiConfigured(true);
        }
      })
      .catch(() => {});
  }, []);

  const saveSettings = (next: BongoSettings) => {
    setSettings(next);
    try {
      localStorage.setItem("bongo-ai-settings-v1", JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
    setAnnouncement("Settings saved.");
  };

  const stopLiveAudioPlayback = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // ignore
      }
    }
    activeSourcesRef.current.clear();
    if (outCtxRef.current) {
      nextPlayTimeRef.current = outCtxRef.current.currentTime;
    }
  }, []);

  const cleanupMicAudio = useCallback(() => {
    cancelAnimationFrame(micRafRef.current);
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      workletNodeRef.current = null;
    }
    if (scriptProcRef.current) {
      try {
        scriptProcRef.current.disconnect();
      } catch {
        // ignore
      }
      scriptProcRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    inAnalyserRef.current = null;
    setAudioLevel(0);
    setSpectrum(null);
  }, []);

  const stopSpeaking = useCallback(() => {
    speechSessionRef.current += 1;
    cancelAnimationFrame(speakAnimRef.current);
    stopLiveAudioPlayback();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.src = "";
      activeAudioRef.current = null;
    }
    setAudioLevel(0);
    setSpectrum(null);
    if (phaseRef.current === "speaking") {
      setPhase(liveActiveRef.current ? "listening" : "idle");
    }
  }, [stopLiveAudioPlayback]);

  const endLiveCall = useCallback(() => {
    liveActiveRef.current = false;
    continuousFallbackRef.current = false;
    liveToolBusyRef.current = false;
    setLiveActive(false);
    setMicMuted(false);
    setLiveCaptionUser("");
    setLiveCaptionAi("");
    setInterimTranscript("");

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    if (liveSessionRef.current) {
      try {
        liveSessionRef.current.close();
      } catch {
        // ignore
      }
      liveSessionRef.current = null;
    }

    stopSpeaking();
    cleanupMicAudio();

    if (outCtxRef.current && outCtxRef.current.state !== "closed") {
      outCtxRef.current.close().catch(() => {});
      outCtxRef.current = null;
    }
    outAnalyserRef.current = null;

    // Commit any unfinished live captions cleanly
    const partialAi = liveAiBufRef.current.trim();
    const partialUser = liveUserBufRef.current.trim();
    if (partialAi) {
      const lang = /[\u0980-\u09FF]/.test(partialAi) ? "bn" : "en";
      setTurns((prev) => [
        ...prev,
        {
          id: `${Date.now()}`,
          userText: partialUser || "Voice Conversation",
          aiText: partialAi,
          spokenText: partialAi,
          language: lang,
          visitedSites: liveSitesBufRef.current,
          usedTools: [],
          mode: "gemini-live",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    }
    liveUserBufRef.current = "";
    liveAiBufRef.current = "";
    liveSitesBufRef.current = [];
    setPhase("idle");
    setAnnouncement("Live voice call ended.");
  }, [cleanupMicAudio, stopSpeaking]);

  useEffect(() => {
    return () => {
      endLiveCall();
    };
  }, [endLiveCall]);

  const startSyntheticSpeakPulse = useCallback((sessionId: number) => {
    let t = 0;
    const freqBuffer = new Uint8Array(64);
    const tick = () => {
      if (speechSessionRef.current !== sessionId) return;
      t += 0.14;
      const envelope =
        0.34 +
        0.26 * Math.abs(Math.sin(t * 1.9)) +
        0.18 * Math.abs(Math.cos(t * 3.7));
      setAudioLevel(Math.min(0.95, envelope));
      for (let i = 0; i < freqBuffer.length; i++) {
        const wave = Math.sin(i * 0.25 + t * 2.4) * 0.5 + 0.5;
        freqBuffer[i] = Math.floor(
          Math.min(255, (envelope * 170 + wave * 85) * (1 - i / 90))
        );
      }
      setSpectrum(new Uint8Array(freqBuffer));
      speakAnimRef.current = requestAnimationFrame(tick);
    };
    speakAnimRef.current = requestAnimationFrame(tick);
  }, []);

  const speakReply = useCallback(
    async (text: string, lang: "bn" | "en") => {
      if (!settings.voiceEnabled || !text.trim()) {
        setPhase(liveActiveRef.current ? "listening" : "idle");
        return;
      }

      stopSpeaking();
      const sessionId = speechSessionRef.current;
      setPhase("speaking");

      if (settings.elevenLabsKey.trim() || hasGemini) {
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              elevenLabsKey: settings.elevenLabsKey.trim() || undefined,
              geminiApiKey: settings.geminiApiKey.trim() || undefined,
            }),
          });
          if (res.ok && speechSessionRef.current === sessionId) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.playbackRate = settings.speechRate;
            activeAudioRef.current = audio;

            try {
              const ctx = new AudioContext();
              if (ctx.state === "suspended") {
                await ctx.resume().catch(() => {});
              }
              const src = ctx.createMediaElementSource(audio);
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 256;
              src.connect(analyser);
              analyser.connect(ctx.destination);
              const data = new Uint8Array(analyser.frequencyBinCount);

              const pump = () => {
                if (
                  speechSessionRef.current !== sessionId ||
                  audio.paused ||
                  audio.ended
                ) {
                  ctx.close().catch(() => {});
                  return;
                }
                analyser.getByteFrequencyData(data);
                let sum = 0;
                for (let i = 0; i < 36; i++) sum += data[i];
                setAudioLevel(Math.min(1, sum / (36 * 155)));
                setSpectrum(new Uint8Array(data));
                speakAnimRef.current = requestAnimationFrame(pump);
              };

              audio.onplay = () => {
                speakAnimRef.current = requestAnimationFrame(pump);
              };
            } catch {
              startSyntheticSpeakPulse(sessionId);
            }

            await new Promise<void>((resolve) => {
              audio.onended = () => {
                URL.revokeObjectURL(url);
                resolve();
              };
              audio.onerror = () => {
                URL.revokeObjectURL(url);
                resolve();
              };
              audio.play().catch(() => resolve());
            });

            if (speechSessionRef.current === sessionId) {
              setAudioLevel(0);
              setSpectrum(null);
              setPhase(liveActiveRef.current ? "listening" : "idle");
            }
            return;
          }
        } catch {
          // Fall back smoothly to browser speech
        }
      }

      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setPhase(liveActiveRef.current ? "listening" : "idle");
        return;
      }

      const synth = window.speechSynthesis;
      const voices = synth.getVoices();
      const targetVoice =
        lang === "bn"
          ? voices.find((v) => v.lang.toLowerCase().startsWith("bn-bd")) ||
            voices.find((v) => v.lang.toLowerCase().startsWith("bn"))
          : voices.find(
              (v) =>
                v.lang.toLowerCase().startsWith("en") &&
                /natural|google|aria|jenny|samantha/i.test(v.name)
            ) || voices.find((v) => v.lang.toLowerCase().startsWith("en"));

      const sentences = splitSentencesForSpeech(text);
      startSyntheticSpeakPulse(sessionId);

      for (let i = 0; i < sentences.length; i++) {
        if (speechSessionRef.current !== sessionId) break;
        await new Promise<void>((resolve) => {
          const u = new SpeechSynthesisUtterance(sentences[i]);
          u.lang = lang === "bn" ? "bn-BD" : "en-US";
          if (targetVoice) u.voice = targetVoice;
          u.rate = settings.speechRate;
          u.pitch = 1.02;
          u.onboundary = () => {
            if (speechSessionRef.current === sessionId) {
              setAudioLevel((prev) => Math.min(1, Math.max(0.55, prev + 0.25)));
            }
          };
          u.onend = () => resolve();
          u.onerror = () => resolve();
          synth.speak(u);
        });
      }

      if (speechSessionRef.current === sessionId) {
        cancelAnimationFrame(speakAnimRef.current);
        setAudioLevel(0);
        setSpectrum(null);
        setPhase(liveActiveRef.current ? "listening" : "idle");
      }
    },
    [
      hasGemini,
      settings.elevenLabsKey,
      settings.geminiApiKey,
      settings.speechRate,
      settings.voiceEnabled,
      startSyntheticSpeakPulse,
      stopSpeaking,
    ]
  );

  // Continuous SpeechRecognition fallback loop (when Live WebSocket isn't active)
  const startFallbackListenTurn = useCallback(
    async (runAsk: (text: string) => Promise<void>) => {
      if (!continuousFallbackRef.current) return;
      const SpeechRec =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        setErrorMsg(
          "এই ব্রাউজারে সরাসরি Speech Recognition নেই—নিচের ইনপুট বক্সে লিখে কথা বলতে পারেন।"
        );
        endLiveCall();
        return;
      }

      try {
        if (!micStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          micStreamRef.current = stream;
          const ctx = new AudioContext();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          inAnalyserRef.current = analyser;
        }

        const analyser = inAnalyserRef.current;
        if (analyser) {
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const pump = () => {
            if (!continuousFallbackRef.current) return;
            if (phaseRef.current === "listening" && !micMutedRef.current) {
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < 42; i++) sum += dataArray[i];
              setAudioLevel(Math.min(1, sum / (42 * 135)));
              setSpectrum(new Uint8Array(dataArray));
            }
            micRafRef.current = requestAnimationFrame(pump);
          };
          micRafRef.current = requestAnimationFrame(pump);
        }

        setPhase("listening");
        setInterimTranscript("");
        interimRef.current = "";

        const recognition = new SpeechRec();
        recognitionRef.current = recognition;
        recognition.lang = settings.language === "en" ? "en-US" : "bn-BD";
        recognition.interimResults = true;
        recognition.continuous = false;
        recognition.maxAlternatives = 1;

        let finalTranscript = "";
        let handled = false;

        recognition.onresult = (event) => {
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const chunk = event.results[i][0]?.transcript || "";
            if (event.results[i].isFinal) {
              finalTranscript += `${chunk} `;
            } else {
              interim += chunk;
            }
          }
          const combined = (finalTranscript + interim).trim();
          interimRef.current = combined;
          setInterimTranscript(combined);
          setLiveCaptionUser(combined);
        };

        recognition.onerror = (ev) => {
          if (ev.error === "not-allowed") {
            setErrorMsg(
              "মাইক্রোফোন অনুমতি দেওয়া হয়নি—নিচের ইনপুট বক্সে লিখে কথা বলতে পারেন।"
            );
            endLiveCall();
          }
        };

        recognition.onend = async () => {
          recognitionRef.current = null;
          if (!continuousFallbackRef.current) return;
          const spoken = (finalTranscript || interimRef.current).trim();
          if (spoken && !handled) {
            handled = true;
            await runAsk(spoken);
            await new Promise((r) => setTimeout(r, 260));
          }
          // Auto-resume listening continuously until user ends call
          if (continuousFallbackRef.current) {
            startFallbackListenTurn(runAsk);
          }
        };

        recognition.start();
      } catch {
        setErrorMsg(
          "মাইক্রোফোন চালু করা যায়নি। নিচের ইনপুট বক্সে লিখে সরাসরি প্রশ্ন করতে পারেন।"
        );
        endLiveCall();
      }
    },
    [endLiveCall, settings.language]
  );

  const askBongoAI = useCallback(
    async (promptText: string) => {
      const cleaned = promptText.trim();
      if (!cleaned) return;

      // If a real-time Gemini Live call is active, inject text straight into the open Live session!
      if (liveActiveRef.current && liveSessionRef.current) {
        setErrorMsg(null);
        liveUserBufRef.current = cleaned;
        setLiveCaptionUser(cleaned);
        liveSessionRef.current.sendClientContent({
          turns: cleaned,
          turnComplete: true,
        });
        return;
      }

      stopSpeaking();
      setErrorMsg(null);
      setInterimTranscript("");
      setPhase("visiting");
      setAnnouncement("Bongo is checking live sources.");

      try {
        const history = turns.slice(-4).flatMap((t) => [
          { role: "user" as const, content: t.userText },
          { role: "assistant" as const, content: t.aiText },
        ]);

        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: cleaned,
            history,
            languagePreference: settings.language,
            geminiApiKey: settings.geminiApiKey || undefined,
          }),
          signal: AbortSignal.timeout(30000),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Assistant request failed");
        }

        const replyTurn: Turn = {
          id: `${Date.now()}`,
          userText: cleaned,
          aiText: data.displayText,
          spokenText: data.spokenText || data.displayText,
          language: data.language === "en" ? "en" : "bn",
          visitedSites: Array.isArray(data.visitedSites)
            ? data.visitedSites
            : [],
          usedTools: Array.isArray(data.usedTools) ? data.usedTools : [],
          mode: data.mode === "gemini" ? "gemini" : "live-web",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };

        setTurns((prev) => [...prev, replyTurn]);
        setAnnouncement("Bongo answered.");
        await speakReply(replyTurn.spokenText, replyTurn.language);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not connect to Bongo.";
        setErrorMsg(msg);
        setPhase(liveActiveRef.current ? "listening" : "idle");
        setAnnouncement(msg);
      }
    },
    [settings.geminiApiKey, settings.language, speakReply, stopSpeaking, turns]
  );

  // Start True Real-Time Full-Duplex Gemini Live Call (ChatGPT Voice / Gemini Live style)
  const startLiveCall = useCallback(async () => {
    stopSpeaking();
    setErrorMsg(null);
    setLiveCaptionUser("");
    setLiveCaptionAi("");
    liveUserBufRef.current = "";
    liveAiBufRef.current = "";
    liveSitesBufRef.current = [];
    liveReconnectCountRef.current = 0;
    setLiveActive(true);
    liveActiveRef.current = true;
    setMicMuted(false);
    micMutedRef.current = false;
    setPhase("visiting");
    setAnnouncement("Connecting real-time voice session.");

    if (!hasGemini) {
      continuousFallbackRef.current = true;
      await startFallbackListenTurn(askBongoAI);
      return;
    }

    try {
      // 1. Open mic & playback AudioContexts immediately inside user gesture
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      if (!liveActiveRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      micStreamRef.current = stream;

      const inCtx = new AudioContext();
      if (inCtx.state === "suspended") await inCtx.resume().catch(() => {});
      audioCtxRef.current = inCtx;

      const inSource = inCtx.createMediaStreamSource(stream);
      const inAnalyser = inCtx.createAnalyser();
      inAnalyser.fftSize = 256;
      inAnalyser.smoothingTimeConstant = 0.78;
      inSource.connect(inAnalyser);
      inAnalyserRef.current = inAnalyser;

      const outCtx = new AudioContext({ sampleRate: 24000 });
      if (outCtx.state === "suspended") await outCtx.resume().catch(() => {});
      outCtxRef.current = outCtx;
      nextPlayTimeRef.current = outCtx.currentTime;

      const outAnalyser = outCtx.createAnalyser();
      outAnalyser.fftSize = 256;
      outAnalyser.smoothingTimeConstant = 0.78;
      outAnalyser.connect(outCtx.destination);
      outAnalyserRef.current = outAnalyser;

      // 2. Mint short-lived ephemeral token on server
      const tokenRes = await fetch("/api/live-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geminiApiKey: settings.geminiApiKey.trim() || undefined,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!tokenRes.ok) {
        throw new Error("Live voice token unavailable");
      }
      const { token, model, fallbackModels } = (await tokenRes.json()) as {
        token: string;
        model: string;
        fallbackModels?: string[];
      };
      if (!liveActiveRef.current) return;

      const liveModelPool = [model, ...(fallbackModels || [])];

      const langRule =
        settings.language === "bn"
          ? "Always speak in warm, natural, accurate Bengali (বাংলা)."
          : settings.language === "en"
            ? "Always speak in crisp, articulate, natural English."
            : "Speak in natural fluent Bengali (বাংলা) when the user speaks Bangla/Banglish, or crisp English when they speak English.";

      const systemInstruction = `You are Bongo, a world-class real-time conversational voice assistant on a live call.
${langRule}
Rules for best output:
1. Give accurate, helpful, well-structured answers like a thoughtful human expert on a voice call (2-4 concise sentences unless asked for deeper detail).
2. Never say markdown asterisks or raw URLs out loud.
3. Whenever asked for today's news, live prices/scores, current events, weather, facts, or to visit a website, ALWAYS call your live tools (get_live_news, search_web, visit_website, get_live_weather, search_wikipedia) before answering.`;

      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: "v1alpha" },
      });

      const handleLiveMessage = async (msg: LiveServerMessage) => {
        if (!liveActiveRef.current) return;

        // Real-time barge-in interruption
        if (msg.serverContent?.interrupted) {
          stopLiveAudioPlayback();
          liveAiBufRef.current = "";
          setLiveCaptionAi("");
          if (!liveToolBusyRef.current) {
            setPhase("listening");
          }
          return;
        }

        // Streaming user speech transcription
        if (msg.serverContent?.inputTranscription?.text) {
          liveUserBufRef.current += msg.serverContent.inputTranscription.text;
          setLiveCaptionUser(liveUserBufRef.current.trim());
        }

        // Streaming AI speech transcription
        if (msg.serverContent?.outputTranscription?.text) {
          liveAiBufRef.current += msg.serverContent.outputTranscription.text;
          setLiveCaptionAi(liveAiBufRef.current.trim());
        }

        // Live tool call execution with guaranteed sendToolResponse
        if (msg.toolCall?.functionCalls?.length) {
          const calls = msg.toolCall.functionCalls;
          liveToolBusyRef.current = true;
          setPhase("visiting");
          let responded = false;
          try {
            const toolRes = await fetch("/api/tools", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ functionCalls: calls }),
              signal: AbortSignal.timeout(14000),
            });
            if (toolRes.ok) {
              const toolData = (await toolRes.json()) as {
                functionResponses: Array<{
                  id?: string;
                  name: string;
                  response: Record<string, unknown>;
                }>;
                visitedSites: VisitedSite[];
              };
              if (Array.isArray(toolData.visitedSites)) {
                liveSitesBufRef.current = [
                  ...liveSitesBufRef.current,
                  ...toolData.visitedSites,
                ].slice(0, 6);
              }
              liveSessionRef.current?.sendToolResponse({
                functionResponses: toolData.functionResponses,
              });
              responded = true;
            }
          } catch {
            // handled below
          } finally {
            if (!responded) {
              try {
                liveSessionRef.current?.sendToolResponse({
                  functionResponses: calls.map((c) => ({
                    id: c.id,
                    name: c.name || "tool",
                    response: {
                      error: "Live source timed out; answer briefly without fabricating facts.",
                    },
                  })),
                });
              } catch {
                // ignore if socket already closed
              }
            }
            liveToolBusyRef.current = false;
          }
        }

        // Incoming 24kHz PCM16 audio chunks -> gapless Web Audio scheduling
        const parts = msg.serverContent?.modelTurn?.parts || [];
        for (const p of parts) {
          const b64 = p.inlineData?.data;
          if (b64 && outCtxRef.current && outAnalyserRef.current) {
            if (!voiceEnabledRef.current) continue;
            const floats = pcm24kBase64ToFloat32(b64);
            if (floats.length === 0) continue;

            const audioBuffer = outCtxRef.current.createBuffer(
              1,
              floats.length,
              24000
            );
            audioBuffer.getChannelData(0).set(floats);

            const src = outCtxRef.current.createBufferSource();
            src.buffer = audioBuffer;
            src.connect(outAnalyserRef.current);

            const startAt = Math.max(
              outCtxRef.current.currentTime + 0.02,
              nextPlayTimeRef.current
            );
            nextPlayTimeRef.current = startAt + audioBuffer.duration;
            activeSourcesRef.current.add(src);
            setPhase("speaking");

            src.onended = () => {
              activeSourcesRef.current.delete(src);
              if (
                activeSourcesRef.current.size === 0 &&
                liveActiveRef.current &&
                !liveToolBusyRef.current
              ) {
                setPhase("listening");
              }
            };
            src.start(startAt);
          }
        }

        // Turn completed -> save into conversation history while keeping call active!
        if (msg.serverContent?.turnComplete) {
          const userFinal = liveUserBufRef.current.trim();
          const aiFinal = liveAiBufRef.current.trim();
          const sitesFinal = [...liveSitesBufRef.current];

          if (aiFinal) {
            const lang = /[\u0980-\u09FF]/.test(aiFinal) ? "bn" : "en";
            setTurns((prev) => [
              ...prev,
              {
                id: `${Date.now()}`,
                userText: userFinal || "Voice Query",
                aiText: aiFinal,
                spokenText: aiFinal,
                language: lang,
                visitedSites: sitesFinal,
                usedTools: sitesFinal.length > 0 ? ["live_web"] : [],
                mode: "gemini-live",
                timestamp: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              },
            ]);
          }
          liveUserBufRef.current = "";
          liveAiBufRef.current = "";
          liveSitesBufRef.current = [];
          setLiveCaptionUser("");
          setLiveCaptionAi("");
        }
      };

      const connectLiveWithPool = async (pool: string[]): Promise<Session> => {
        let lastErr: unknown;
        for (const candidateModel of pool) {
          if (!liveActiveRef.current) throw new Error("Call ended");
          try {
            const s = await new Promise<Session>((resolve, reject) => {
              let settled = false;
              let setupReady = false;
              let pendingSession: Session | null = null;
              const tm = window.setTimeout(() => {
                if (!settled) {
                  settled = true;
                  try {
                    pendingSession?.close();
                  } catch {
                    // ignore
                  }
                  reject(new Error(`Timeout connecting to ${candidateModel}`));
                }
              }, 7000);

              ai.live
                .connect({
                  model: candidateModel,
                  config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    speechConfig: {
                      voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: "Kore" },
                      },
                    },
                    systemInstruction,
                    tools: [{ functionDeclarations: LIVE_TOOL_DECLARATIONS }],
                  },
                  callbacks: {
                    onmessage: (m) => {
                      if (m.setupComplete) {
                        setupReady = true;
                        if (!settled && pendingSession) {
                          settled = true;
                          window.clearTimeout(tm);
                          resolve(pendingSession);
                        }
                      }
                      void handleLiveMessage(m);
                    },
                    onerror: () => {
                      if (!settled) {
                        settled = true;
                        window.clearTimeout(tm);
                        reject(new Error(`Live socket error on ${candidateModel}`));
                        return;
                      }
                      if (liveActiveRef.current) {
                        liveSessionRef.current = null;
                        stopLiveAudioPlayback();
                        if (liveReconnectCountRef.current < 1) {
                          liveReconnectCountRef.current += 1;
                          setPhase("visiting");
                          void connectLiveWithPool(pool.slice(1).length ? pool.slice(1) : pool)
                            .then((nextSession) => {
                              if (liveActiveRef.current) {
                                liveSessionRef.current = nextSession;
                                setPhase("listening");
                              } else {
                                nextSession.close();
                              }
                            })
                            .catch(() => {
                              if (liveActiveRef.current && !continuousFallbackRef.current) {
                                continuousFallbackRef.current = true;
                                void startFallbackListenTurn(askBongoAI);
                              }
                            });
                        } else if (!continuousFallbackRef.current) {
                          continuousFallbackRef.current = true;
                          void startFallbackListenTurn(askBongoAI);
                        }
                      }
                    },
                    onclose: () => {
                      if (!settled) {
                        settled = true;
                        window.clearTimeout(tm);
                        reject(new Error(`Live socket closed on ${candidateModel}`));
                        return;
                      }
                      if (liveActiveRef.current && liveSessionRef.current === pendingSession) {
                        liveSessionRef.current = null;
                        stopLiveAudioPlayback();
                        if (!continuousFallbackRef.current) {
                          continuousFallbackRef.current = true;
                          void startFallbackListenTurn(askBongoAI);
                        }
                      }
                    },
                  },
                })
                .then((opened) => {
                  pendingSession = opened;
                  if (setupReady && !settled) {
                    settled = true;
                    window.clearTimeout(tm);
                    resolve(opened);
                  }
                })
                .catch((err) => {
                  if (!settled) {
                    settled = true;
                    window.clearTimeout(tm);
                    reject(err);
                  }
                });
            });
            return s;
          } catch (err) {
            lastErr = err;
          }
        }
        throw lastErr || new Error("No live model connected");
      };

      const session = await connectLiveWithPool(liveModelPool);

      if (!liveActiveRef.current) {
        session.close();
        return;
      }
      liveSessionRef.current = session;
      setPhase("listening");

      // 3. Stream 16kHz PCM mic frames continuously via AudioWorklet
      const sendPcmFrame = (pcmBuffer: ArrayBuffer) => {
        if (
          !liveActiveRef.current ||
          !liveSessionRef.current ||
          micMutedRef.current
        ) {
          return;
        }
        try {
          liveSessionRef.current.sendRealtimeInput({
            audio: {
              data: arrayBufferToBase64(pcmBuffer),
              mimeType: "audio/pcm;rate=16000",
            },
          });
        } catch {
          // ignore transient send errors
        }
      };

      try {
        await inCtx.audioWorklet.addModule("/pcm-processor.js");
        if (!liveActiveRef.current) return;
        const worklet = new AudioWorkletNode(inCtx, "pcm-capture-processor");
        worklet.port.onmessage = (ev) => {
          if (ev.data instanceof ArrayBuffer) {
            sendPcmFrame(ev.data);
          }
        };
        inSource.connect(worklet);
        workletNodeRef.current = worklet;
      } catch {
        // Fallback if AudioWorklet is unavailable
        const proc = inCtx.createScriptProcessor(4096, 1, 1);
        proc.onaudioprocess = (ev) => {
          const input = ev.inputBuffer.getChannelData(0);
          const ratio = inCtx.sampleRate / 16000;
          const outLen = Math.floor(input.length / ratio);
          const pcm = new Int16Array(outLen);
          for (let i = 0; i < outLen; i++) {
            const sample = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)]));
            pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          }
          sendPcmFrame(pcm.buffer);
        };
        inSource.connect(proc);
        proc.connect(inCtx.destination);
        scriptProcRef.current = proc;
      }

      // 4. Unified 60fps spectrum pump (shows mic spectrum while listening, AI spectrum while speaking!)
      const freqData = new Uint8Array(128);
      const pumpLiveSpectrum = () => {
        if (!liveActiveRef.current) return;
        const activeAnalyser =
          activeSourcesRef.current.size > 0
            ? outAnalyserRef.current
            : micMutedRef.current
              ? null
              : inAnalyserRef.current;

        if (activeAnalyser) {
          activeAnalyser.getByteFrequencyData(freqData);
          let sum = 0;
          for (let i = 0; i < 42; i++) sum += freqData[i];
          setAudioLevel(Math.min(1, sum / (42 * 135)));
          setSpectrum(new Uint8Array(freqData));
        } else {
          setAudioLevel(0);
          setSpectrum(null);
        }
        micRafRef.current = requestAnimationFrame(pumpLiveSpectrum);
      };
      micRafRef.current = requestAnimationFrame(pumpLiveSpectrum);
    } catch {
      // Seamless automatic failover to continuous SpeechRecognition loop!
      if (!liveActiveRef.current) return;
      cleanupMicAudio();
      continuousFallbackRef.current = true;
      await startFallbackListenTurn(askBongoAI);
    }
  }, [
    askBongoAI,
    cleanupMicAudio,
    endLiveCall,
    hasGemini,
    settings.geminiApiKey,
    settings.language,
    startFallbackListenTurn,
    stopLiveAudioPlayback,
    stopSpeaking,
  ]);

  const handlePrimaryOrbAction = useCallback(() => {
    if (liveActiveRef.current) {
      endLiveCall();
      return;
    }
    if (phase === "speaking") {
      stopSpeaking();
      return;
    }
    void startLiveCall();
  }, [endLiveCall, phase, startLiveCall, stopSpeaking]);

  // Global Spacebar shortcut to start/end Live Call when not typing in inputs or dialogs
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (settingsOpen || guideTopic) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        tag === "button"
      ) {
        return;
      }
      e.preventDefault();
      handlePrimaryOrbAction();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [guideTopic, handlePrimaryOrbAction, settingsOpen]);

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim() || phase === "visiting") return;
    const text = inputValue;
    setInputValue("");
    void askBongoAI(text);
  };

  // IME-safe Enter submit per modern-web-guidance
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        e.preventDefault();
        return;
      }
    }
  };

  const latestTurn = turns.length > 0 ? turns[turns.length - 1] : null;
  const uiLanguage: "bn" | "en" = settings.language === "en" ? "en" : "bn";

  const orbStatusLabel = liveActive
    ? phase === "visiting"
      ? uiLanguage === "bn"
        ? "লাইভ ওয়েব থেকে তথ্য আনা হচ্ছে..."
        : "Reading live sources..."
      : phase === "speaking"
        ? uiLanguage === "bn"
          ? "বলছি · কথা বলে থামাতে পারেন"
          : "Speaking · Speak anytime to interrupt"
        : micMuted
          ? uiLanguage === "bn"
            ? "মাইক মিউট করা আছে"
            : "Microphone muted"
          : interimTranscript ||
            (uiLanguage === "bn"
              ? "লাইভ কল চালু · কথা বলুন"
              : "Live · Speak naturally")
    : phase === "visiting"
      ? uiLanguage === "bn"
        ? "লাইভ ওয়েব থেকে তথ্য আনা হচ্ছে..."
        : "Reading live sources..."
      : phase === "speaking"
        ? uiLanguage === "bn"
          ? "কথা বলছি..."
          : "Speaking..."
        : uiLanguage === "bn"
          ? "রিয়েল-টাইম বাংলা ও ইংরেজি ভয়েস"
          : "Real-Time Voice & Web Intelligence";

  return (
    <div className="studio-backdrop relative min-h-dvh md:h-dvh md:overflow-hidden flex flex-col justify-between overflow-x-hidden">
      {/* Centralized accessible live status region */}
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Top Navigation Header — flagship studio minimalism */}
      <header className="relative z-20 shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-8 pt-3.5 pb-1">
        <nav aria-label="Supported Platforms" className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setGuideTopic("iOS")}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/30 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
          >
            <AppleIcon />
            <span>iOS</span>
          </button>
          <button
            type="button"
            onClick={() => setGuideTopic("MAC")}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/30 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
          >
            <AppleIcon />
            <span>MAC</span>
          </button>
          <button
            type="button"
            onClick={() => setGuideTopic("Windows")}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/30 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
          >
            <WindowsIcon />
            <span>Windows</span>
          </button>

          <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border border-white/10 bg-white/[0.025] text-zinc-300">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                liveActive
                  ? "bg-rose-400 animate-pulse"
                  : hasGemini
                    ? "bg-emerald-400"
                    : "bg-zinc-400"
              }`}
            />
            {liveActive
              ? `Live Call · ${formatCallDuration(callSeconds)}`
              : hasGemini
                ? "Gemini Live · Web Ready"
                : "Live Web"}
          </span>
        </nav>

        <div className="flex items-center gap-2 sm:gap-2.5 ml-auto">
          <button
            type="button"
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                voiceEnabled: !prev.voiceEnabled,
              }))
            }
            aria-label={
              settings.voiceEnabled ? "Mute voice output" : "Unmute voice output"
            }
            aria-pressed={!settings.voiceEnabled}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-white/12 bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 transition-colors cursor-pointer"
          >
            {settings.voiceEnabled ? (
              <Volume2 className="w-4 h-4 text-zinc-100" aria-hidden="true" />
            ) : (
              <VolumeX className="w-4 h-4 text-zinc-500" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMotionPaused((p) => !p)}
            aria-label={
              motionPaused
                ? "Play plasma ring animation"
                : "Pause plasma ring animation"
            }
            className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-white/12 bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 transition-colors cursor-pointer"
          >
            {motionPaused ? (
              <Play className="w-3.5 h-3.5 text-zinc-100" aria-hidden="true" />
            ) : (
              <Pause className="w-3.5 h-3.5 text-zinc-300" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open Bongo AI settings"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-white/12 bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setGuideTopic("Help")}
            className="group inline-flex items-center gap-2.5 pl-3 pr-1 py-1 rounded-full hover:bg-white/[0.05] transition-colors cursor-pointer"
          >
            <span className="text-xs sm:text-sm font-normal text-zinc-300 tracking-tight">
              How Can I{" "}
              <span className="relative text-white font-medium">
                Help
                <span
                  aria-hidden="true"
                  className="absolute left-0 right-0 -bottom-1 h-[1.5px] rounded-full bg-gradient-to-r from-purple-400 via-fuchsia-400 to-purple-400"
                />
              </span>{" "}
              You?
            </span>
            <BongoMascot active={!motionPaused} />
          </button>
        </div>
      </header>

      {/* Main Hero Stage */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-4 py-1 sm:py-2">
        <PlasmaOrb
          phase={phase}
          audioLevel={audioLevel}
          spectrum={spectrum}
          motionPaused={motionPaused}
          onPrimaryAction={handlePrimaryOrbAction}
          statusLabel={orbStatusLabel}
          language={uiLanguage}
          compact={Boolean(latestTurn || liveActive)}
          liveActive={liveActive}
        />

        {/* Continuous Live Call Controls & Real-Time Streaming Captions */}
        {liveActive && (
          <div className="mt-1.5 flex flex-col items-center gap-2 max-w-2xl w-full shrink-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[#0b0b10]/90 backdrop-blur-xl px-3 py-1.5 shadow-lg">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-200 px-1.5 tabular-nums">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span>{formatCallDuration(callSeconds)}</span>
              </span>

              <span className="h-3.5 w-px bg-white/10" aria-hidden="true" />

              <button
                type="button"
                onClick={() => setMicMuted((m) => !m)}
                aria-pressed={micMuted}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  micMuted
                    ? "bg-amber-500/20 text-amber-200 border border-amber-400/30"
                    : "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.12]"
                }`}
              >
                {micMuted ? (
                  <MicOff className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>{micMuted ? "Unmute" : "Mute"}</span>
              </button>

              {phase === "speaking" && (
                <button
                  type="button"
                  onClick={stopLiveAudioPlayback}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
                >
                  <Hand className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Interrupt</span>
                </button>
              )}

              <button
                type="button"
                onClick={endLiveCall}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/90 hover:bg-rose-500 text-xs font-medium text-white transition-colors cursor-pointer"
              >
                <PhoneOff className="w-3.5 h-3.5" aria-hidden="true" />
                <span>End</span>
              </button>
            </div>

            {(liveCaptionUser || liveCaptionAi) && (
              <div className="w-full max-w-xl rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl px-4 py-2 text-xs text-zinc-200 space-y-1 text-center">
                {liveCaptionUser && (
                  <p className="text-zinc-400 truncate">
                    আপনি: <span className="text-zinc-100">{liveCaptionUser}</span>
                  </p>
                )}
                {liveCaptionAi && (
                  <p className="text-zinc-100 line-clamp-2">{liveCaptionAi}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Inline error / guidance banner */}
        {errorMsg && (
          <div
            role="status"
            className="mt-2 max-w-xl rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-2 text-xs text-amber-200 text-center shrink-0"
          >
            {errorMsg}
          </div>
        )}

        {/* Latest Response & Visited Websites Live Panel */}
        {latestTurn && (
          <section
            aria-label="Bongo AI Response and Visited Websites"
            className="mt-2 w-full max-w-3xl flex-1 min-h-0 max-h-[320px] flex flex-col rounded-2xl border border-white/[0.1] bg-[#09090d]/85 backdrop-blur-2xl p-3.5 sm:p-4 shadow-[0_20px_60px_rgba(0,0,0,0.65)] space-y-2"
          >
            <div className="flex items-start justify-between gap-3 shrink-0">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-zinc-400">
                  আপনি: <span className="text-zinc-100">{latestTurn.userText}</span>
                </p>
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" aria-hidden="true" />
                  <span>
                    Bongo ·{" "}
                    {latestTurn.mode === "gemini-live"
                      ? "Gemini Live"
                      : latestTurn.mode === "gemini"
                        ? "Gemini 3.8"
                        : "Live Web"}{" "}
                    · {latestTurn.timestamp}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    void speakReply(latestTurn.spokenText, latestTurn.language)
                  }
                  aria-label="Replay spoken answer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/12 bg-white/[0.04] hover:bg-white/[0.1] text-xs text-zinc-200 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span>আবার শুনুন</span>
                </button>
                {turns.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowHistory((s) => !s)}
                    aria-expanded={showHistory}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-white/12 bg-white/[0.04] hover:bg-white/[0.1] text-xs text-zinc-200 transition-colors cursor-pointer"
                  >
                    <History className="w-3 h-3" aria-hidden="true" />
                    <span>{turns.length}</span>
                    {showHistory ? (
                      <ChevronUp className="w-3 h-3" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-3 h-3" aria-hidden="true" />
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="text-sm leading-[1.6] text-zinc-200 whitespace-pre-line flex-1 min-h-0 overflow-y-auto bongo-scroll pr-1">
              {latestTurn.aiText.split(/(\*\*[^*]+\*\*)/g).map((part, idx) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <strong key={idx} className="font-semibold text-white">
                    {part.slice(2, -2)}
                  </strong>
                ) : (
                  <React.Fragment key={idx}>{part}</React.Fragment>
                )
              )}
            </div>

            {/* Visited Websites / Live News Cards */}
            {latestTurn.visitedSites.length > 0 && (
              <div className="pt-2 border-t border-white/[0.08] shrink-0">
                <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-400 mb-1.5">
                  <Globe className="w-3.5 h-3.5 text-zinc-300" aria-hidden="true" />
                  <span>ভিজিট করা ওয়েবসাইট ও সোর্স ({latestTurn.visitedSites.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-24 overflow-y-auto bongo-scroll pr-1">
                  {latestTurn.visitedSites.map((site, idx) => (
                    <a
                      key={`${site.url}-${idx}`}
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/20 p-2.5 transition-colors"
                    >
                      <img
                        src={site.favicon}
                        alt=""
                        className="w-4 h-4 rounded mt-0.5 shrink-0 bg-white/10"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-zinc-400 truncate">
                            {site.siteName}
                          </span>
                          <ArrowUpRight
                            className="w-3.5 h-3.5 text-zinc-500 group-hover:text-white shrink-0 transition-colors"
                            aria-hidden="true"
                          />
                        </div>
                        <p className="text-xs font-medium text-zinc-100 line-clamp-2 mt-0.5">
                          {site.title}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Expandable Conversation History */}
            {showHistory && turns.length > 1 && (
              <div className="pt-2 border-t border-white/[0.08] space-y-2 max-h-32 overflow-y-auto bongo-scroll pr-1 shrink-0">
                {turns
                  .slice(0, -1)
                  .reverse()
                  .map((t) => (
                    <div
                      key={t.id}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-xs space-y-1"
                    >
                      <p className="text-zinc-300 font-medium">
                        আপনি: {t.userText}
                      </p>
                      <p className="text-zinc-400 line-clamp-2">{t.aiText}</p>
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Bottom Command Dock & Quick Queries */}
      <footer className="relative z-20 shrink-0 w-full max-w-3xl mx-auto px-4 pb-3.5 pt-1.5 space-y-2">
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {QUICK_PROMPTS.map((item) => (
            <button
              key={item.prompt}
              type="button"
              disabled={phase === "visiting"}
              onClick={() => void askBongoAI(item.prompt)}
              className="px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.025] hover:bg-white/[0.08] hover:border-white/20 text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleFormSubmit}
          className="relative flex items-center gap-2 rounded-full border border-white/[0.12] bg-[#0a0a0e]/90 backdrop-blur-2xl p-1.5 pl-4 shadow-[0_12px_40px_rgba(0,0,0,0.65)] focus-within:border-white/30 transition-colors"
        >
          <label htmlFor={inputId} className="visually-hidden">
            Ask Bongo anything or enter a website URL
          </label>
          <input
            ref={promptInputRef}
            id={inputId}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={
              liveActive
                ? uiLanguage === "bn"
                  ? "লাইভ কল চালু আছে — সরাসরি কথা বলুন অথবা এখানে লিখুন..."
                  : "Live call active — speak naturally or type here..."
                : uiLanguage === "bn"
                  ? "যেকোনো প্রশ্ন লিখুন বা বলুন 'আজকের নিউজ বলো'..."
                  : "Ask anything or say 'Tell me today's news'..."
            }
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none min-w-0"
          />

          <button
            type="button"
            onClick={handlePrimaryOrbAction}
            aria-label={liveActive ? "End live voice call" : "Start live voice call"}
            className={`inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors cursor-pointer ${
              liveActive
                ? "bg-rose-500 text-white hover:bg-rose-400"
                : "bg-white/[0.05] hover:bg-white/[0.12] text-zinc-300"
            }`}
          >
            {liveActive ? (
              <PhoneOff className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Mic className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          <button
            type="submit"
            disabled={!inputValue.trim() || phase === "visiting"}
            aria-label="Send message to Bongo"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white text-zinc-950 hover:bg-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <ArrowUp className="w-4 h-4" aria-hidden="true" />
          </button>
        </form>
      </footer>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={saveSettings}
        serverGeminiConfigured={serverGeminiConfigured}
      />

      <PlatformGuideDialog
        topic={guideTopic}
        onClose={() => setGuideTopic(null)}
        onTryCommand={(cmd) => void askBongoAI(cmd)}
      />
    </div>
  );
}
