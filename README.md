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
- GM can navigate to `/gm` to publish newspaper updates that auto-advance the turn.
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
- `games/{gameId}/aiConversations/{conversationId}`

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

## Notes

- Configure role mapping values in `.env.local` based on `.env.example` before first login.
- Create a Firestore Database in Firebase Console before first app run.
- `firestore.rules` is a starter draft; validate and refine with the Firebase emulator before production.
- AI responses are currently simulated in `getAIResponses`.
