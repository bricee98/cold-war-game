const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_GM_EMAILS",
  "NEXT_PUBLIC_USA_EMAILS",
  "NEXT_PUBLIC_USSR_EMAILS",
  "NEXT_PUBLIC_FINLAND_EMAILS",
  "NEXT_PUBLIC_GM_UIDS",
  "NEXT_PUBLIC_USA_UIDS",
  "NEXT_PUBLIC_USSR_UIDS",
  "NEXT_PUBLIC_FINLAND_UIDS"
] as const;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const payload: Record<string, string> = {};

  for (const key of PUBLIC_ENV_KEYS) {
    payload[key] = process.env[key] ?? "";
  }

  const body = `window.__RUNTIME_CONFIG__ = Object.assign(window.__RUNTIME_CONFIG__ || {}, ${JSON.stringify(payload)});`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
