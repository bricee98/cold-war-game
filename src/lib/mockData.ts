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
    { id: "u-1", displayName: "USA", role: "player" },
    { id: "u-2", displayName: "USSR", role: "player" },
    { id: "u-3", displayName: "Finland", role: "player" }
  ],
  turns: [
    {
      id: "turn-1",
      gameId: "game-1",
      number: 1,
      inWorldDate: "1962-10-14",
      publishedAt: new Date(now.getTime() - 86_400_000).toISOString(),
      status: "archived"
    },
    {
      id: "turn-2",
      gameId: "game-1",
      number: 2,
      inWorldDate: "1962-10-15",
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
      title: "GM ↔ USA",
      createdAt: now.toISOString()
    },
    {
      id: "t-gm-u2-2",
      gameId: "game-1",
      turnId: "turn-2",
      kind: "gm_player",
      participantIds: ["u-gm", "u-2"],
      title: "GM ↔ USSR",
      createdAt: now.toISOString()
    },
    {
      id: "t-gm-u3-2",
      gameId: "game-1",
      turnId: "turn-2",
      kind: "gm_player",
      participantIds: ["u-gm", "u-3"],
      title: "GM ↔ Finland",
      createdAt: now.toISOString()
    },
    {
      id: "t-u1-u2-2",
      gameId: "game-1",
      turnId: "turn-2",
      kind: "player_player",
      participantIds: ["u-1", "u-2"],
      title: "USA ↔ USSR",
      createdAt: now.toISOString()
    }
  ],
  messages: [
    {
      id: "m-news-u1",
      threadId: "t-gm-u1-2",
      authorId: "u-gm",
      body: "NEWSPAPER - October 15, 1962: Multiple fleets alter course in the Atlantic as negotiations stall.",
      createdAt: new Date(now.getTime() - 300_000).toISOString(),
      reactions: []
    },
    {
      id: "m-news-u2",
      threadId: "t-gm-u2-2",
      authorId: "u-gm",
      body: "NEWSPAPER - October 15, 1962: Multiple fleets alter course in the Atlantic as negotiations stall.",
      createdAt: new Date(now.getTime() - 300_000).toISOString(),
      reactions: []
    },
    {
      id: "m-news-u3",
      threadId: "t-gm-u3-2",
      authorId: "u-gm",
      body: "NEWSPAPER - October 15, 1962: Multiple fleets alter course in the Atlantic as negotiations stall.",
      createdAt: new Date(now.getTime() - 300_000).toISOString(),
      reactions: []
    },
    {
      id: "m-1",
      threadId: "t-gm-u1-2",
      authorId: "u-gm",
      body: "Your intel contact says rail traffic increased overnight near the harbor.",
      createdAt: new Date(now.getTime() - 180_000).toISOString(),
      reactions: [{ emoji: "👀", userId: "u-1" }]
    },
    {
      id: "m-2",
      threadId: "t-gm-u1-2",
      parentMessageId: "m-1",
      authorId: "u-1",
      body: "Can I divert logistics inspection teams without alerting local command?",
      createdAt: new Date(now.getTime() - 120_000).toISOString(),
      reactions: []
    },
    {
      id: "m-3",
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
  ],
  aiTurnSummaries: []
};
