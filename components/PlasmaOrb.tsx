"use client";

import React, { useEffect, useRef } from "react";
import { Mic, PhoneOff, Globe, Square } from "lucide-react";

export type AssistantPhase = "idle" | "listening" | "visiting" | "speaking";

interface PlasmaOrbProps {
  phase: AssistantPhase;
  audioLevel: number;
  spectrum?: Uint8Array | null;
  motionPaused: boolean;
  onPrimaryAction: () => void;
  statusLabel: string;
  language: "bn" | "en";
  compact?: boolean;
  liveActive?: boolean;
}

interface FilamentConfig {
  seed: number;
  speedMult: number;
  color: string;
  lineWidth: number;
  blur: number;
  amp: number;
}

const FILAMENTS: FilamentConfig[] = [
  { seed: 0.7, speedMult: 0.85, color: "rgba(126, 34, 206, 0.34)", lineWidth: 8.5, blur: 32, amp: 1.15 },
  { seed: 1.9, speedMult: -1.05, color: "rgba(168, 85, 247, 0.55)", lineWidth: 4.5, blur: 20, amp: 0.95 },
  { seed: 3.1, speedMult: 1.18, color: "rgba(217, 70, 239, 0.68)", lineWidth: 2.6, blur: 15, amp: 0.9 },
  { seed: 4.4, speedMult: -1.32, color: "rgba(232, 121, 249, 0.75)", lineWidth: 1.6, blur: 10, amp: 0.82 },
  { seed: 5.8, speedMult: 1.45, color: "rgba(245, 208, 254, 0.82)", lineWidth: 1.15, blur: 7, amp: 0.7 },
  { seed: 7.2, speedMult: -0.92, color: "rgba(255, 255, 255, 0.92)", lineWidth: 0.95, blur: 5, amp: 0.48 },
  { seed: 8.9, speedMult: 1.62, color: "rgba(255, 255, 255, 0.72)", lineWidth: 0.75, blur: 4, amp: 0.62 },
];

export default function PlasmaOrb({
  phase,
  audioLevel,
  spectrum,
  motionPaused,
  onPrimaryAction,
  statusLabel,
  language,
  compact = false,
  liveActive = false,
}: PlasmaOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<AssistantPhase>(phase);
  const levelRef = useRef<number>(audioLevel);
  const spectrumRef = useRef<Uint8Array | null | undefined>(spectrum);
  const pausedRef = useRef<boolean>(motionPaused);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    levelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    spectrumRef.current = spectrum;
  }, [spectrum]);

  useEffect(() => {
    pausedRef.current = motionPaused;
  }, [motionPaused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let rafId = 0;
    let time = 0;
    let smoothedEnergy = 0;

    const motes = Array.from({ length: 28 }, (_, i) => ({
      angle: (i / 28) * Math.PI * 2,
      speed: (0.002 + Math.random() * 0.005) * (i % 2 === 0 ? 1 : -1),
      offset: (Math.random() - 0.5) * 16,
      size: 0.65 + Math.random() * 1.15,
      phase: Math.random() * Math.PI * 2,
    }));

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = Math.min(parent.clientWidth, parent.clientHeight);
      canvas.width = Math.max(280, Math.floor(size * dpr));
      canvas.height = Math.max(280, Math.floor(size * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) {
      ro.observe(canvas.parentElement);
    }

    const drawOpticalStrand = (
      cx: number,
      cy: number,
      baseR: number,
      t: number,
      energy: number,
      cfg: FilamentConfig,
      curPhase: AssistantPhase,
      freqData: Uint8Array | null | undefined
    ) => {
      const steps = 220;
      const scale = Math.min(1.0, Math.max(0.52, baseR / 185));
      const phaseTempo =
        curPhase === "visiting" ? 1.55 : curPhase === "speaking" ? 1.25 : 1.0;

      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = cfg.lineWidth * (0.78 + scale * 0.22);
      ctx.shadowColor = cfg.color;
      ctx.shadowBlur = cfg.blur * scale;

      for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        const bin = freqData
          ? Math.floor(((i % steps) / steps) * Math.min(48, freqData.length))
          : 0;
        const fft = freqData ? (freqData[bin] || 0) / 255 : 0;

        // Smooth harmonic silk waves hugging the circular ring closely
        const h1 = Math.sin(theta * 3 + t * 1.15 * cfg.speedMult * phaseTempo + cfg.seed);
        const h2 = Math.cos(theta * 5 - t * 1.65 * cfg.speedMult * phaseTempo + cfg.seed * 2.1);
        const h3 = Math.sin(theta * 8 + t * 2.3 * phaseTempo + cfg.seed * 3.4);

        const envelope = (0.58 + energy * 1.05 + fft * 0.45) * cfg.amp * scale;
        const radialWave = (h1 * 3.4 + h2 * 2.2 + h3 * 1.1) * envelope;
        const reactiveBreath =
          energy * 5.5 * scale * Math.sin(theta * 2 + t * 1.8) +
          fft * 6.5 * scale * (curPhase === "listening" || curPhase === "speaking" ? 1 : 0.15);

        const r = baseR + radialWave + reactiveBreath;
        const x = cx + Math.cos(theta) * r;
        const y = cy + Math.sin(theta) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    };

    const renderFrame = (singleStatic = false) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const cx = w / 2;
      const cy = h / 2;
      const baseR = Math.min(w, h) * 0.385;

      const curPhase = phaseRef.current;
      smoothedEnergy += (levelRef.current - smoothedEnergy) * 0.15;

      if (!singleStatic && !pausedRef.current) {
        const dt =
          curPhase === "visiting"
            ? 0.026
            : curPhase === "speaking"
              ? 0.021
              : curPhase === "listening"
                ? 0.019
                : 0.011;
        time += dt;
      }

      ctx.clearRect(0, 0, w, h);

      // Soft studio corona bloom
      const bloom = ctx.createRadialGradient(
        cx,
        cy,
        baseR * 0.7,
        cx,
        cy,
        baseR * 1.42
      );
      bloom.addColorStop(0, "rgba(126, 34, 206, 0.02)");
      bloom.addColorStop(
        0.58,
        curPhase === "visiting"
          ? "rgba(56, 189, 248, 0.14)"
          : `rgba(168, 85, 247, ${0.15 + smoothedEnergy * 0.14})`
      );
      bloom.addColorStop(
        0.78,
        `rgba(217, 70, 239, ${0.08 + smoothedEnergy * 0.1})`
      );
      bloom.addColorStop(1, "rgba(2, 2, 5, 0)");
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      const freqData = spectrumRef.current;
      for (const cfg of FILAMENTS) {
        drawOpticalStrand(cx, cy, baseR, time, smoothedEnergy, cfg, curPhase, freqData);
      }

      if (curPhase === "visiting") {
        drawOpticalStrand(
          cx,
          cy,
          baseR,
          time * 1.35,
          smoothedEnergy + 0.25,
          {
            seed: 9.5,
            speedMult: 1.5,
            color: "rgba(125, 211, 252, 0.52)",
            lineWidth: 1.4,
            blur: 10,
            amp: 0.85,
          },
          curPhase,
          freqData
        );
      }

      // Subtle drifting light dust around the ring
      for (const m of motes) {
        if (!singleStatic && !pausedRef.current) {
          m.angle += m.speed * (1 + smoothedEnergy * 1.6);
          m.phase += 0.03;
        }
        const mr = baseR + m.offset * (baseR / 185);
        const mx = cx + Math.cos(m.angle) * mr;
        const my = cy + Math.sin(m.angle) * mr;
        const alpha = 0.2 + 0.45 * (0.5 + 0.5 * Math.sin(m.phase));

        ctx.beginPath();
        ctx.fillStyle = `rgba(245, 208, 254, ${alpha})`;
        ctx.arc(mx, my, m.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Deep pure inner void for crisp typography contrast
      const innerVoid = ctx.createRadialGradient(
        cx,
        cy,
        baseR * 0.45,
        cx,
        cy,
        baseR * 0.92
      );
      innerVoid.addColorStop(0, "rgba(2, 2, 5, 0.96)");
      innerVoid.addColorStop(0.75, "rgba(2, 2, 5, 0.68)");
      innerVoid.addColorStop(1, "rgba(2, 2, 5, 0)");
      ctx.fillStyle = innerVoid;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 0.93, 0, Math.PI * 2);
      ctx.fill();

      if (!singleStatic && !pausedRef.current && !prefersReduced) {
        rafId = requestAnimationFrame(() => renderFrame(false));
      }
    };

    if (prefersReduced || pausedRef.current) {
      renderFrame(true);
    } else {
      rafId = requestAnimationFrame(() => renderFrame(false));
    }

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [motionPaused]);

  const bars = [0.38, 0.72, 0.5, 0.94, 0.62, 0.86, 0.44, 0.74, 0.4];

  const ctaLabel = liveActive
    ? language === "bn"
      ? "কল শেষ করুন"
      : "End Live"
    : phase === "listening"
      ? language === "bn"
        ? "শুনছি · থামান"
        : "Listening · Stop"
      : phase === "visiting"
        ? language === "bn"
          ? "তথ্য খোঁজা হচ্ছে"
          : "Browsing web"
        : phase === "speaking"
          ? language === "bn"
            ? "থামান"
            : "Stop speaking"
          : language === "bn"
            ? "কথা বলুন"
            : "Start Live";

  return (
    <div
      className={`relative flex items-center justify-center select-none transition-all duration-500 ease-out shrink-0 ${
        compact
          ? "w-[min(72vw,230px)] h-[min(72vw,230px)] sm:w-[245px] sm:h-[245px]"
          : "w-[min(92vw,470px)] h-[min(92vw,470px)] sm:w-[490px] sm:h-[490px]"
      }`}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      <div
        className={`relative z-10 flex flex-col items-center justify-center text-center px-5 ${
          compact ? "max-w-[230px]" : "max-w-[330px]"
        }`}
      >
        {/* Minimalist precision acoustic equalizer bars */}
        <div
          aria-hidden="true"
          className={`flex items-center justify-center gap-[3.5px] ${
            compact ? "h-4 mb-2" : "h-6 mb-3.5"
          }`}
        >
          {bars.map((baseH, idx) => {
            const dynamicScale =
              phase === "speaking" || phase === "listening"
                ? Math.min(1.4, baseH + audioLevel * (idx % 2 === 0 ? 0.85 : 0.5))
                : phase === "visiting"
                  ? 0.4 + 0.4 * Math.abs(Math.sin(idx * 0.9))
                  : baseH * 0.65;

            return (
              <span
                key={idx}
                className="w-[2px] rounded-full bg-white/90 transition-transform duration-150"
                style={{
                  height: compact ? "15px" : "21px",
                  transform: `scaleY(${dynamicScale})`,
                  opacity: phase === "idle" ? 0.72 : 1,
                }}
              />
            );
          })}
        </div>

        {/* Crisp studio typography */}
        <h1
          className={`tracking-tight text-white leading-[1.15] ${
            compact
              ? "text-[1.2rem] sm:text-[1.35rem]"
              : "text-[1.75rem] sm:text-[2.1rem]"
          }`}
        >
          <span className="font-semibold text-white">Bongo</span>{" "}
          <span className="font-light text-zinc-200">Voice Assistant</span>
        </h1>

        <p
          className={`font-normal tracking-normal text-zinc-400 min-h-[18px] flex items-center gap-1.5 ${
            compact ? "mt-1 mb-3 text-[11px]" : "mt-2 mb-5 text-xs sm:text-[13px]"
          }`}
        >
          {phase === "visiting" && (
            <Globe className="w-3.5 h-3.5 text-sky-300 animate-spin" aria-hidden="true" />
          )}
          <span>{statusLabel}</span>
        </p>

        {/* Clean architectural white pill CTA matching uploaded design */}
        <div className="relative inline-flex flex-col items-center">
          <button
            type="button"
            onClick={onPrimaryAction}
            aria-pressed={liveActive || phase === "listening" || phase === "speaking"}
            className={`group relative inline-flex items-center gap-2 rounded-full font-medium transition-all duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-4 ${
              compact ? "px-4 py-2 text-xs" : "px-5 py-2.5 text-[13px]"
            } ${
              liveActive
                ? "bg-rose-500/95 text-white shadow-[0_0_26px_rgba(244,63,94,0.5)] hover:bg-rose-500"
                : phase === "listening"
                  ? "bg-fuchsia-500 text-white shadow-[0_0_28px_rgba(217,70,239,0.65)]"
                  : phase === "speaking"
                    ? "bg-zinc-100 text-zinc-950 shadow-[0_0_28px_rgba(255,255,255,0.4)]"
                    : phase === "visiting"
                      ? "bg-zinc-800 text-white border border-white/20"
                      : "bg-white text-zinc-950 shadow-[0_8px_30px_rgba(0,0,0,0.5),0_0_24px_rgba(255,255,255,0.2)] hover:scale-[1.03] hover:bg-zinc-100"
            }`}
          >
            {liveActive ? (
              <PhoneOff className="w-3.5 h-3.5" aria-hidden="true" />
            ) : phase === "listening" || phase === "speaking" ? (
              <Square className="w-3 h-3 fill-current" aria-hidden="true" />
            ) : phase === "visiting" ? (
              <Globe className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />
            ) : (
              <Mic className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{ctaLabel}</span>
          </button>

          <span
            aria-hidden="true"
            className={`-mt-[1px] w-2.5 h-2 transition-colors duration-200 ${
              liveActive
                ? "bg-rose-500/95"
                : phase === "listening"
                  ? "bg-fuchsia-500"
                  : phase === "visiting"
                    ? "bg-zinc-800"
                    : "bg-white"
            }`}
            style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
          />
        </div>
      </div>
    </div>
  );
}
