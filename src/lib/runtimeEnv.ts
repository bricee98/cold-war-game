"use client";

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: Record<string, string | undefined>;
  }
}

export function getPublicEnv(name: string): string | undefined {
  const buildValue = process.env[name];
  if (buildValue && buildValue.trim()) {
    return buildValue;
  }

  if (typeof window === "undefined") {
    return buildValue;
  }

  const runtimeValue = window.__RUNTIME_CONFIG__?.[name];
  if (runtimeValue && runtimeValue.trim()) {
    return runtimeValue;
  }

  return buildValue;
}
