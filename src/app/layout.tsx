import type { Metadata } from "next";
import Script from "next/script";
import { AppProviders } from "@/components/AppProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cold War Game",
  description: "Turn-based GM-player private channels"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Script src="/runtime-config.js" strategy="beforeInteractive" />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
