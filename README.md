# Cold War Game (Web MVP)

A laptop-first web app for your turn-based Cold War game:

- GM publishes a newspaper update with an in-world date.
- Publishing starts a new turn and locks previous turns to read-only.
- Primary interaction is private channels (`GM ↔ Player`) per turn.
- Optional player-to-player private channels exist per turn.
- AI chat is private per player.

## Stack

- Next.js (App Router) + TypeScript
- Firebase-ready wiring (Auth + Firestore)
- In-memory mock store for immediate local iteration

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

- Role switcher lets you view as GM or any player.
- GM can navigate to `/gm` to publish newspaper updates that auto-advance the turn.
- Channel selection is a compact control above the message feed.
- Threads are optional and live under each message (Slack-style replies).
- Messaging/reactions are allowed only on the active turn.
- Past turns are read-only.
- Player AI panel is private by role context.

## Firebase handoff plan

1. Replace the in-memory store (`src/lib/gameStore.tsx`) with Firestore listeners/writes.
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
- `src/lib/gameStore.tsx`: mock realtime domain logic.
- `src/lib/firebase.ts`: Firebase initialization helper.
- `src/types/game.ts`: domain model types.
- `firestore.rules`: starter access-control draft.
- `.env.example`: Firebase env vars.

## Notes

- `firestore.rules` is a starter draft; validate and refine with the Firebase emulator before production.
- AI responses are currently simulated in `getAIResponses`.
