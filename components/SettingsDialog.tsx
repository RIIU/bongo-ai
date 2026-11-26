"use client";

import React, { useEffect, useId, useRef } from "react";
import { X, KeyRound, Volume2, Languages, SlidersHorizontal, Check } from "lucide-react";

export interface BongoSettings {
  language: "auto" | "bn" | "en";
  voiceEnabled: boolean;
  speechRate: number;
  geminiApiKey: string;
  elevenLabsKey: string;
}

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  settings: BongoSettings;
  onSave: (next: BongoSettings) => void;
  serverGeminiConfigured?: boolean;
}

export default function SettingsDialog({
  open,
  onClose,
  settings,
  onSave,
  serverGeminiConfigured = false,
}: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const langId = useId();
  const rateId = useId();
  const geminiId = useId();
  const elevenId = useId();
  const voiceToggleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Fallback for browsers without native dialog closedby="any" support (e.g. Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
    };

    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, []);

  const handleCloseEvent = () => {
    const dialog = dialogRef.current;
    if (dialog) dialog.returnValue = "";
    onClose();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const next: BongoSettings = {
      language: (fd.get("language") as BongoSettings["language"]) || "auto",
      voiceEnabled: fd.get("voiceEnabled") === "on",
      speechRate: Number(fd.get("speechRate")) || 1.0,
      geminiApiKey: String(fd.get("geminiApiKey") || "").trim(),
      elevenLabsKey: String(fd.get("elevenLabsKey") || "").trim(),
    };
    onSave(next);
    dialogRef.current?.close();
  };

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: "any" } as Record<string, string>)}
      aria-labelledby={titleId}
      onClose={handleCloseEvent}
      className="m-auto w-[min(92vw,480px)] rounded-2xl border border-white/12 bg-[#09090d]/95 text-zinc-100 p-0 shadow-[0_24px_80px_rgba(0,0,0,0.85)]"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.06] border border-white/10 text-zinc-200">
              <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
            </span>
            <div>
              <h1 id={titleId} className="text-base font-semibold text-white tracking-tight">
                Preferences
              </h1>
              <p className="text-xs text-zinc-400">
                ভয়েস, ভাষা ও লাইভ মডেল কনফিগারেশন
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close settings"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.1] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor={langId}
              className="flex items-center gap-2 text-xs font-medium text-zinc-300 mb-1.5"
            >
              <Languages className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
              <span>Language</span>
            </label>
            <select
              id={langId}
              name="language"
              defaultValue={settings.language}
              className="w-full rounded-xl border border-white/12 bg-zinc-900/90 px-3.5 py-2.5 text-sm text-white focus:border-white/40 focus:outline-none"
            >
              <option value="auto">Auto Detect (বাংলা + English)</option>
              <option value="bn">বাংলা প্রধান (bn-BD)</option>
              <option value="en">English (en-US)</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3">
            <label
              htmlFor={voiceToggleId}
              className="flex items-center gap-2.5 text-sm text-zinc-200 cursor-pointer"
            >
              <Volume2 className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              <span>Spoken Voice Output</span>
            </label>
            <input
              id={voiceToggleId}
              name="voiceEnabled"
              type="checkbox"
              defaultChecked={settings.voiceEnabled}
              className="w-4 h-4 accent-white cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-zinc-300 mb-1">
              <label htmlFor={rateId}>Speech Speed</label>
              <span className="text-zinc-400 tabular-nums">{settings.speechRate.toFixed(1)}x</span>
            </div>
            <input
              id={rateId}
              name="speechRate"
              type="range"
              min="0.8"
              max="1.4"
              step="0.1"
              defaultValue={settings.speechRate}
              className="w-full accent-white cursor-pointer"
            />
          </div>

          <div className="pt-3 border-t border-white/10 space-y-3">
            {serverGeminiConfigured && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                Server API Key active via `.env.local` — neural voice &amp; live web tools enabled.
              </div>
            )}
            <div>
              <label
                htmlFor={geminiId}
                className="flex items-center gap-2 text-xs font-medium text-zinc-300 mb-1"
              >
                <KeyRound className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                <span>API Key (Optional Override)</span>
              </label>
              <input
                id={geminiId}
                name="geminiApiKey"
                type="password"
                autoComplete="off"
                defaultValue={settings.geminiApiKey}
                placeholder={
                  serverGeminiConfigured
                    ? "সার্ভার key সক্রিয় আছে (পরিবর্তন করতে নতুন key দিন)"
                    : "Enter key..."
                }
                className="w-full rounded-xl border border-white/12 bg-zinc-900/90 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor={elevenId}
                className="flex items-center gap-2 text-xs font-medium text-zinc-300 mb-1"
              >
                <Volume2 className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                <span>ElevenLabs Voice Key (Optional)</span>
              </label>
              <input
                id={elevenId}
                name="elevenLabsKey"
                type="password"
                autoComplete="off"
                defaultValue={settings.elevenLabsKey}
                placeholder="sk_..."
                className="w-full rounded-xl border border-white/12 bg-zinc-900/90 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="px-4 py-2 rounded-xl border border-white/12 text-xs font-medium text-zinc-300 hover:bg-white/[0.06] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            autoFocus
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-zinc-950 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Save</span>
          </button>
        </div>
      </form>
    </dialog>
  );
}
