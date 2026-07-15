import * as React from "react";
import { cn } from "./utils";

type BadgeTone = "neutral" | "mint" | "yellow" | "lavender" | "blue" | "blush" | "dark";

const tones: Record<BadgeTone, string> = {
  neutral: "border-[#d9dfde] bg-[#eef2f1] text-[#53605e]",
  mint: "border-[#a7d3cb] bg-[#d8f0eb] text-[#21594f]",
  yellow: "border-[#e9ca62] bg-[#fff0b6] text-[#684f00]",
  lavender: "border-[#c9b4e7] bg-[#e7dcf7] text-[#50386d]",
  blue: "border-[#a7cddd] bg-[#d9edf5] text-[#2a5262]",
  blush: "border-[#e5b9ca] bg-[#f7dce6] text-[#6b3147]",
  dark: "border-[#161616] bg-[#161616] text-white",
};

export function Badge({ className, tone = "neutral", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn("inline-flex min-h-6 items-center rounded-[5px] border px-2 py-0.5 text-[11px] font-bold leading-4", tones[tone], className)} {...props} />;
}

