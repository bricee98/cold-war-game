# Cold War Game (Web MVP)

A laptop-first web app for your turn-based Cold War game:

- GM publishes a newspaper update with an in-world date.
- Publishing starts a new turn and locks previous turns to read-only.
- Primary interaction is private channels (`GM ↔ Player`) per turn.
- Optional player-to-player private channels exist per turn.
- AI chat is private per player.

## Stack

- Next.js (App Router) + TypeScript
- Firebase Auth + Firestore realtime sync
- Local seed data used only to initialize a new Firestore game on first run

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If file updates are not triggering refresh in your environment, run:

```bash
npm run dev:poll
```

## Current behavior

- Firebase Auth gate with Google sign-in.
- Signed-in accounts map to `GM`, `USA`, `USSR`, or `Finland` by env-configured email/UID rules.
- Turns, channels, messages, replies, reactions, and newspapers are persisted in Firestore.
- Private AI chats are persisted in Firestore and survive refresh/login.
- On publish, the app auto-generates a private per-player turn summary for long-term AI planning context.
- GM can navigate to `/gm` to publish newspaper updates that auto-advance the turn.
- GM desk includes a one-click action to regenerate summaries for the latest archived turn.
- Turns store date/state only (no title or description fields).
- The first message in each new `GM ↔ player` channel is the newspaper body for that turn.
- Channel selection is a compact control above the message feed.
- Threads are optional and live under each message (Slack-style replies).
- Newspaper and message bodies support Markdown rendering.
- Messaging/reactions are allowed only on the active turn.
- Past turns are read-only.
- Player AI panel is private by role context.

## Firebase handoff plan

1. Replace role/env mapping with Firestore-backed membership + server-side role checks.
2. Use this Firestore layout:

- `games/{gameId}`
- `games/{gameId}/members/{userId}`
- `games/{gameId}/turns/{turnId}`
- `games/{gameId}/threads/{threadId}`
- `games/{gameId}/messages/{messageId}`
- `games/{gameId}/aiConversations/{userId}/messages/{messageId}`
- `games/{gameId}/aiConversations/{userId}/summaries/{turnId}`

3. Keep turn lock server-side with security rules + Cloud Function for `publishTurn`.
4. Keep AI private by user-scoped docs and backend checks.

## Files

- `src/components/GameApp.tsx`: main UI and turn/channel workflow.
- `src/lib/auth.tsx`: Firebase auth state + role mapping.
- `src/lib/gameStore.tsx`: mock realtime domain logic.
- `src/lib/firebase.ts`: Firebase initialization helper.
- `src/types/game.ts`: domain model types.
- `firestore.rules`: starter access-control draft.
- `.env.example`: Firebase env vars.
- `src/app/api/ai/respond/route.ts`: server-side AI proxy for private assistant replies.
- `src/app/api/ai/turn-summary/route.ts`: server-side turn-summary generator per player.

## Notes

- Configure role mapping values in `.env.local` based on `.env.example` before first login.
- Create a Firestore Database in Firebase Console before first app run.
- `firestore.rules` is a starter draft; validate and refine with the Firebase emulator before production.
- Add `OPENAI_API_KEY` (and optionally `OPENAI_MODEL` / `OPENAI_SUMMARY_MODEL` / `OPENAI_REASONING_EFFORT` / `OPENAI_MAX_OUTPUT_TOKENS` / `OPENAI_MAX_CONTINUATIONS`) to `.env.local` for live AI replies and turn summaries.

## Cloud Run build-time Firebase config

This app reads Firebase client config from `NEXT_PUBLIC_FIREBASE_*` variables. In Next.js, those values are embedded into the browser bundle at build time.

For Cloud Build + Cloud Run:

- `Dockerfile` accepts Firebase `NEXT_PUBLIC_*` values as `ARG` in the builder stage.
- `cloudbuild.yaml` passes those values via `docker build --build-arg ...`.
- Configure the following trigger substitutions in Cloud Build:
  - `_NEXT_PUBLIC_FIREBASE_API_KEY`
  - `_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `_NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `_NEXT_PUBLIC_FIREBASE_APP_ID`

After updating substitutions, run a new build so Next.js rebakes the client bundle with the correct Firebase values.

The app also serves `/runtime-config.js` and uses it as a client-side fallback for `NEXT_PUBLIC_*` values. This helps when runtime env vars are present but build-time substitutions were missed.
