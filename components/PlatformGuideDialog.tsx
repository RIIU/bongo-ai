"use client";

import React, { useEffect, useId, useRef } from "react";
import { X, Globe, Mic, AudioLines, Smartphone, Laptop } from "lucide-react";

export type GuideTopic = "iOS" | "MAC" | "Windows" | "Help" | null;

export default function PlatformGuideDialog({
  topic,
  onClose,
  onTryCommand,
}: {
  topic: GuideTopic;
  onClose: () => void;
  onTryCommand: (prompt: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (topic && !dialog.open) {
      dialog.showModal();
    } else if (!topic && dialog.open) {
      dialog.close();
    }
  }, [topic]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if ("closedBy" in HTMLDialogElement.prototype) return;
    let pressedOutside = false;
    const outside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };
    const onDown = (e: PointerEvent) => {
      pressedOutside = outside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && outside(e)) dialog.close();
    };
    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, []);

  const isHelp = topic === "Help";

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: "any" } as Record<string, string>)}
      aria-labelledby={titleId}
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = "";
        onClose();
      }}
      className="m-auto w-[min(92vw,460px)] rounded-2xl border border-white/12 bg-[#09090d]/95 text-zinc-100 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.85)]"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.06] border border-white/10 text-zinc-200">
            {isHelp ? (
              <AudioLines className="w-4 h-4" aria-hidden="true" />
            ) : topic === "iOS" ? (
              <Smartphone className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Laptop className="w-4 h-4" aria-hidden="true" />
            )}
          </span>
          <div>
            <h1 id={titleId} className="text-base font-semibold text-white tracking-tight">
              {isHelp
                ? "Capabilities & Voice Commands"
                : `Bongo on ${topic || "Web"}`}
            </h1>
            <p className="text-xs text-zinc-400">
              {isHelp
                ? "বাংলা ও ইংরেজিতে সরাসরি কথা বলুন বা লাইভ ওয়েব তথ্য নিন"
                : "ইনস্টল ও শর্টকাট নির্দেশনা"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close guide dialog"
          className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.1] cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {isHelp ? (
        <div className="space-y-3 text-sm text-zinc-300">
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3.5 flex items-start gap-3">
            <Mic className="w-4 h-4 text-zinc-300 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium text-white text-xs">Natural Voice Interaction</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                কথা বলতে মাঝখানের বাটনে ক্লিক করুন অথবা কিবোর্ডে{" "}
                <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[11px] text-zinc-200">Space</kbd> চাপুন।
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3.5 flex items-start gap-3">
            <Globe className="w-4 h-4 text-zinc-300 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium text-white text-xs">Real-Time Web &amp; News Reader</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                &ldquo;আজকের নিউজ বলো&rdquo; বা &ldquo;bbc.com/bengali ভিজিট করো&rdquo; বললেই লাইভ ওয়েবসাইট পড়ে শোনাবে।
              </p>
            </div>
          </div>

          <div className="pt-2">
            <p className="text-[11px] font-medium text-zinc-400 mb-2">
              Quick Prompts
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                "আজকের নিউজ বলো",
                "ঢাকার আবহাওয়া কেমন?",
                "bbc.com/bengali ভিজিট করো",
                "Latest Tech News",
              ].map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => {
                    dialogRef.current?.close();
                    onTryCommand(cmd);
                  }}
                  className="px-3 py-1.5 rounded-full border border-white/12 bg-white/[0.04] text-xs text-zinc-200 hover:bg-white/[0.1] cursor-pointer"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-zinc-300">
          <p className="text-zinc-300 leading-relaxed text-[13px]">
            {topic === "iOS"
              ? "iPhone বা iPad-এ Safari দিয়ে খুলে Share → 'Add to Home Screen' চাপলেই Bongo পূর্ণাঙ্গ ভয়েস অ্যাপ হিসেবে চলবে।"
              : topic === "MAC"
                ? "macOS Safari বা Chrome থেকে 'Add to Dock' / 'Install App' করলে সরাসরি Mac অ্যাপ হিসেবে ব্যবহার করতে পারবেন।"
                : "Windows Edge বা Chrome-এর অ্যাড্রেস বারে 'Install App' আইকনে ক্লিক করলেই এটি ডেস্কটপ অ্যাপ হিসেবে চলবে।"}
          </p>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-zinc-400">
            ভয়েস ও লাইভ ওয়েবসাইট রিডার সব প্ল্যাটফর্মেই একইভাবে রিয়েল-টাইমে কাজ করে।
          </div>
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          autoFocus
          onClick={() => dialogRef.current?.close()}
          className="px-4 py-2 rounded-xl bg-white text-zinc-950 text-xs font-semibold hover:bg-zinc-200 cursor-pointer"
        >
          Close
        </button>
      </div>
    </dialog>
  );
}
