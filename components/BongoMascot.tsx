"use client";

import React from "react";

/**
 * Minimalist geometric acoustic mark (replaces cartoon robot mascot).
 */
export default function BongoMascot({ active }: { active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex items-center justify-center w-8 h-8 rounded-full border border-white/15 bg-white/[0.04]"
    >
      <span
        className={`w-4 h-4 rounded-full border border-purple-300/60 flex items-center justify-center ${
          active ? "shadow-[0_0_12px_rgba(192,132,252,0.45)]" : ""
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-white" />
      </span>
    </span>
  );
}
