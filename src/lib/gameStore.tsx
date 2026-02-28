"use client";

import { createContext, ReactNode, useContext, useState } from "react";
import { initialState } from "@/lib/mockData";
import { GameState, Message, Thread, Turn, User } from "@/types/game";

interface PublishTurnInput {
  inWorldDate: string;
  title: string;
  body: string;
}

interface StoreContextValue {
  state: GameState;
  currentUser: User;
  setCurrentUserId: (id: string) => void;
  addMessage: (threadId: string, authorId: string, body: string, parentMessageId?: string) => void;
  addReaction: (messageId: string, userId: string, emoji: string) => void;
  addAIMessage: (userId: string, role: "user" | "assistant", body: string) => void;
  publishTurn: (input: PublishTurnInput) => void;
  getThreadsForUser: (userId: string, turnId: string) => Thread[];
  getMessagesForThread: (threadId: string) => Message[];
  getTurnById: (turnId: string) => Turn | undefined;
}

const GameStoreContext = createContext<StoreContextValue | undefined>(undefined);

function safeRandomId(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
    return cryptoObject.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

const id = (prefix: string) => `${prefix}-${safeRandomId()}`;

export function GameStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(initialState);
  const [currentUserId, setCurrentUserId] = useState<string>("u-gm");

  const currentUser = state.users.find((u) => u.id === currentUserId) ?? state.users[0];

  const addMessage = (threadId: string, authorId: string, body: string, parentMessageId?: string) => {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }

    const thread = state.threads.find((entry) => entry.id === threadId);
    const activeTurn = state.turns.find((turn) => turn.status === "active");

    if (!thread || !activeTurn || thread.turnId !== activeTurn.id || !thread.participantIds.includes(authorId)) {
      return;
    }

    if (parentMessageId) {
      const parent = state.messages.find((msg) => msg.id === parentMessageId);
      if (!parent || parent.threadId !== threadId) {
        return;
      }
    }

    setState((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        {
          id: id("m"),
          threadId,
          parentMessageId,
          authorId,
          body: trimmed,
          createdAt: new Date().toISOString(),
          reactions: []
        }
      ]
    }));
  };

  const addReaction = (messageId: string, userId: string, emoji: string) => {
    const message = state.messages.find((m) => m.id === messageId);
    if (!message) {
      return;
    }

    const thread = state.threads.find((entry) => entry.id === message.threadId);
    const activeTurn = state.turns.find((turn) => turn.status === "active");
    if (!thread || !activeTurn || thread.turnId !== activeTurn.id || !thread.participantIds.includes(userId)) {
      return;
    }

    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((m) => {
        if (m.id !== messageId) {
          return m;
        }
        const already = m.reactions.find((r) => r.emoji === emoji && r.userId === userId);
        if (already) {
          return {
            ...m,
            reactions: m.reactions.filter((r) => !(r.emoji === emoji && r.userId === userId))
          };
        }
        return {
          ...m,
          reactions: [...m.reactions, { emoji, userId }]
        };
      })
    }));
  };

  const addAIMessage = (userId: string, role: "user" | "assistant", body: string) => {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    setState((prev) => ({
      ...prev,
      aiMessages: [
        ...prev.aiMessages,
        {
          id: id("ai"),
          userId,
          role,
          body: trimmed,
          createdAt: new Date().toISOString()
        }
      ]
    }));
  };

  const publishTurn = ({ inWorldDate, title, body }: PublishTurnInput) => {
    const activeTurn = state.turns.find((t) => t.status === "active");
    if (!activeTurn) {
      return;
    }

    const newTurnNumber = Math.max(...state.turns.map((t) => t.number)) + 1;
    const newTurnId = id("turn");
    const playerIds = state.users.filter((u) => u.role === "player").map((u) => u.id);

    const gmId = state.users.find((u) => u.role === "gm")?.id;
    if (!gmId) {
      return;
    }

    const newGMThreads: Thread[] = playerIds.map((playerId) => {
      const playerName = state.users.find((u) => u.id === playerId)?.displayName ?? playerId;
      return {
        id: id("thread"),
        gameId: state.game.id,
        turnId: newTurnId,
        kind: "gm_player",
        participantIds: [gmId, playerId],
        title: `GM ↔ ${playerName}`,
        createdAt: new Date().toISOString()
      };
    });

    const pairThreads: Thread[] = [];
    for (let i = 0; i < playerIds.length; i += 1) {
      for (let j = i + 1; j < playerIds.length; j += 1) {
        const first = playerIds[i];
        const second = playerIds[j];
        const firstName = state.users.find((u) => u.id === first)?.displayName ?? first;
        const secondName = state.users.find((u) => u.id === second)?.displayName ?? second;
        pairThreads.push({
          id: id("thread"),
          gameId: state.game.id,
          turnId: newTurnId,
          kind: "player_player",
          participantIds: [first, second],
          title: `${firstName} ↔ ${secondName}`,
          createdAt: new Date().toISOString()
        });
      }
    }

    setState((prev) => ({
      ...prev,
      game: {
        ...prev.game,
        activeTurnId: newTurnId
      },
      turns: [
        ...prev.turns.map((turn) => (turn.id === activeTurn.id ? { ...turn, status: "archived" as const } : turn)),
        {
          id: newTurnId,
          gameId: prev.game.id,
          number: newTurnNumber,
          inWorldDate,
          newspaperTitle: title,
          newspaperBody: body,
          publishedAt: new Date().toISOString(),
          status: "active"
        }
      ],
      threads: [...prev.threads, ...newGMThreads, ...pairThreads]
    }));
  };

  const getThreadsForUser = (userId: string, turnId: string) =>
    state.threads.filter((thread) => thread.turnId === turnId && thread.participantIds.includes(userId));

  const getMessagesForThread = (threadId: string) =>
    state.messages.filter((message) => message.threadId === threadId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const getTurnById = (turnId: string) => state.turns.find((turn) => turn.id === turnId);

  const value: StoreContextValue = {
    state,
    currentUser,
    setCurrentUserId,
    addMessage,
    addReaction,
    addAIMessage,
    publishTurn,
    getThreadsForUser,
    getMessagesForThread,
    getTurnById
  };

  return <GameStoreContext.Provider value={value}>{children}</GameStoreContext.Provider>;
}

export function useGameStore() {
  const context = useContext(GameStoreContext);
  if (!context) {
    throw new Error("useGameStore must be used inside GameStoreProvider");
  }
  return context;
}

export function useCurrentTurn() {
  const { state } = useGameStore();
  return state.turns.find((turn) => turn.id === state.game.activeTurnId);
}

export function getAIResponses(prompt: string): string {
  return `Simulated AI response for: ${prompt.slice(0, 120)}`;
}
