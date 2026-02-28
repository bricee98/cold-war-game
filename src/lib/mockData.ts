import { GameState } from "@/types/game";

const now = new Date();

export const initialState: GameState = {
  game: {
    id: "game-1",
    title: "Cold War Campaign",
    activeTurnId: "turn-2"
  },
  users: [
    { id: "u-gm", displayName: "GM", role: "gm" },
    { id: "u-1", displayName: "Alex", role: "player" },
    { id: "u-2", displayName: "Sam", role: "player" },
    { id: "u-3", displayName: "Riley", role: "player" }
  ],
  turns: [
    {
      id: "turn-1",
      gameId: "game-1",
      number: 1,
      inWorldDate: "1962-10-14",
      newspaperTitle: "U-2 Recon Flights Intensify",
      newspaperBody: "Intelligence reports indicate accelerated missile site construction.",
      publishedAt: new Date(now.getTime() - 86_400_000).toISOString(),
      status: "archived"
    },
    {
      id: "turn-2",
      gameId: "game-1",
      number: 2,
      inWorldDate: "1962-10-15",
      newspaperTitle: "Naval Movements Detected",
      newspaperBody: "Multiple fleets alter course in the Atlantic as negotiations stall.",
      publishedAt: now.toISOString(),
      status: "active"
    }
  ],
  threads: [
    {
      id: "t-gm-u1-2",
      gameId: "game-1",
      turnId: "turn-2",
      kind: "gm_player",
      participantIds: ["u-gm", "u-1"],
      title: "GM ↔ Alex",
      createdAt: now.toISOString()
    },
    {
      id: "t-gm-u2-2",
      gameId: "game-1",
      turnId: "turn-2",
      kind: "gm_player",
      participantIds: ["u-gm", "u-2"],
      title: "GM ↔ Sam",
      createdAt: now.toISOString()
    },
    {
      id: "t-gm-u3-2",
      gameId: "game-1",
      turnId: "turn-2",
      kind: "gm_player",
      participantIds: ["u-gm", "u-3"],
      title: "GM ↔ Riley",
      createdAt: now.toISOString()
    },
    {
      id: "t-u1-u2-2",
      gameId: "game-1",
      turnId: "turn-2",
      kind: "player_player",
      participantIds: ["u-1", "u-2"],
      title: "Alex ↔ Sam",
      createdAt: now.toISOString()
    }
  ],
  messages: [
    {
      id: "m-1",
      threadId: "t-gm-u1-2",
      authorId: "u-gm",
      body: "Your intel contact says rail traffic increased overnight near the harbor.",
      createdAt: now.toISOString(),
      reactions: [{ emoji: "👀", userId: "u-1" }]
    },
    {
      id: "m-2",
      threadId: "t-u1-u2-2",
      authorId: "u-2",
      body: "I can move two brigades if you secure fuel.",
      createdAt: now.toISOString(),
      reactions: []
    }
  ],
  aiMessages: [
    {
      id: "ai-1",
      userId: "u-1",
      role: "assistant",
      body: "I can help you evaluate next-turn diplomatic and military options.",
      createdAt: now.toISOString()
    }
  ]
};
