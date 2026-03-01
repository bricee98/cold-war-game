"use client";

import { useEffect, useState } from "react";

type CopyState = "idle" | "copied" | "failed";

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to execCommand path.
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  const tempTextArea = document.createElement("textarea");
  tempTextArea.value = text;
  tempTextArea.setAttribute("readonly", "true");
  tempTextArea.style.position = "fixed";
  tempTextArea.style.opacity = "0";
  tempTextArea.style.pointerEvents = "none";

  document.body.appendChild(tempTextArea);
  tempTextArea.focus();
  tempTextArea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  document.body.removeChild(tempTextArea);
  return copied;
}

export function CopyButton({ text, ariaLabel, className }: { text: string; ariaLabel: string; className?: string }) {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") {
      return;
    }
    const timer = window.setTimeout(() => setState("idle"), 1200);
    return () => window.clearTimeout(timer);
  }, [state]);

  const onClick = async () => {
    const copied = await copyTextToClipboard(text);
    setState(copied ? "copied" : "failed");
  };

  const glyph = state === "idle" ? "⧉" : state === "copied" ? "✓" : "!";

  return (
    <button
      type="button"
      className={className ?? "copyButton"}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
    >
      <span aria-hidden>{glyph}</span>
    </button>
  );
}
