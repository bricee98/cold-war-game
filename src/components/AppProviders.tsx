"use client";

import { ReactNode } from "react";
import { GameStoreProvider } from "@/lib/gameStore";

export function AppProviders({ children }: { children: ReactNode }) {
  return <GameStoreProvider>{children}</GameStoreProvider>;
}
