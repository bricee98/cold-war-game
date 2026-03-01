"use client";

import {
  collection,
  doc,
  Firestore,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  writeBatch
} from "firebase/firestore";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { getFirebase } from "@/lib/firebase";
import { initialState } from "@/lib/mockData";
import { GameState, Message, Reaction, Thread, Turn, User } from "@/types/game";

interface PublishTurnInput {
  inWorldDate: string;
  body: string;
}

interface StoreContextValue {
  state: GameState;
  currentUser: User;
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

const GAME_ID = initialState.game.id;

function asIsoString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return new Date().toISOString();
}

function refs(db: Firestore) {
  const gameRef = doc(db, "games", GAME_ID);
  const turnsCol = collection(db, "games", GAME_ID, "turns");
  const threadsCol = collection(db, "games", GAME_ID, "threads");
  const messagesCol = collection(db, "games", GAME_ID, "messages");
  return { gameRef, turnsCol, threadsCol, messagesCol };
}

async function seedInitialGame(db: Firestore) {
  const { gameRef, turnsCol, threadsCol, messagesCol } = refs(db);
  const gameSnap = await getDoc(gameRef);
  if (gameSnap.exists()) {
    return;
  }

  const batch = writeBatch(db);
  batch.set(gameRef, {
    title: initialState.game.title,
    activeTurnId: initialState.game.activeTurnId
  });

  for (const turn of initialState.turns) {
    batch.set(doc(turnsCol, turn.id), {
      gameId: turn.gameId,
      number: turn.number,
      inWorldDate: turn.inWorldDate,
      publishedAt: turn.publishedAt,
      status: turn.status
    });
  }

  for (const thread of initialState.threads) {
    batch.set(doc(threadsCol, thread.id), {
      gameId: thread.gameId,
      turnId: thread.turnId,
      kind: thread.kind,
      participantIds: thread.participantIds,
      title: thread.title,
      createdAt: thread.createdAt
    });
  }

  for (const message of initialState.messages) {
    const payload: Record<string, unknown> = {
      threadId: message.threadId,
      authorId: message.authorId,
      body: message.body,
      createdAt: message.createdAt,
      reactions: message.reactions
    };
    if (message.parentMessageId) {
      payload.parentMessageId = message.parentMessageId;
    }
    batch.set(doc(messagesCol, message.id), payload);
  }

  await batch.commit();
}

function mapTurnFromDoc(turnId: string, data: Record<string, unknown>): Turn {
  return {
    id: turnId,
    gameId: typeof data.gameId === "string" ? data.gameId : GAME_ID,
    number: typeof data.number === "number" ? data.number : 0,
    inWorldDate: typeof data.inWorldDate === "string" ? data.inWorldDate : "",
    publishedAt: asIsoString(data.publishedAt),
    status: data.status === "archived" ? "archived" : "active"
  };
}

function mapThreadFromDoc(threadId: string, data: Record<string, unknown>): Thread {
  const rawParticipants = Array.isArray(data.participantIds) ? data.participantIds : [];
  const participantIds = rawParticipants.filter((entry): entry is string => typeof entry === "string");

  return {
    id: threadId,
    gameId: typeof data.gameId === "string" ? data.gameId : GAME_ID,
    turnId: typeof data.turnId === "string" ? data.turnId : "",
    kind: data.kind === "player_player" ? "player_player" : "gm_player",
    participantIds,
    title: typeof data.title === "string" ? data.title : "Untitled Channel",
    createdAt: asIsoString(data.createdAt)
  };
}

function mapReactions(value: unknown): Reaction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const maybeEmoji = "emoji" in entry ? entry.emoji : null;
      const maybeUserId = "userId" in entry ? entry.userId : null;
      if (typeof maybeEmoji !== "string" || typeof maybeUserId !== "string") {
        return null;
      }

      return { emoji: maybeEmoji, userId: maybeUserId };
    })
    .filter((entry): entry is Reaction => Boolean(entry));
}

function mapMessageFromDoc(messageId: string, data: Record<string, unknown>): Message {
  const parentMessageId = typeof data.parentMessageId === "string" ? data.parentMessageId : undefined;

  return {
    id: messageId,
    threadId: typeof data.threadId === "string" ? data.threadId : "",
    parentMessageId,
    authorId: typeof data.authorId === "string" ? data.authorId : "",
    body: typeof data.body === "string" ? data.body : "",
    createdAt: asIsoString(data.createdAt),
    reactions: mapReactions(data.reactions)
  };
}

export function GameStoreProvider({
  children,
  currentUserId
}: {
  children: ReactNode;
  currentUserId: string;
}) {
  const [state, setState] = useState<GameState>(initialState);

  const currentUser = state.users.find((u) => u.id === currentUserId) ?? state.users[0];

  useEffect(() => {
    let cancelled = false;
    let unsubscribes: Array<() => void> = [];

    async function startRealtime() {
      let db: Firestore;
      try {
        db = getFirebase().db;
      } catch (error) {
        console.error("Firestore unavailable; using in-memory state.", error);
        return;
      }

      try {
        await seedInitialGame(db);
      } catch (error) {
        console.error("Failed seeding game state.", error);
      }

      if (cancelled) {
        return;
      }

      const { gameRef, turnsCol, threadsCol, messagesCol } = refs(db);

      unsubscribes = [
        onSnapshot(
          gameRef,
          (snapshot) => {
            if (!snapshot.exists()) {
              return;
            }
            const data = snapshot.data() as Record<string, unknown>;
            setState((prev) => ({
              ...prev,
              game: {
                ...prev.game,
                title: typeof data.title === "string" ? data.title : prev.game.title,
                activeTurnId:
                  typeof data.activeTurnId === "string" ? data.activeTurnId : prev.game.activeTurnId
              }
            }));
          },
          (error) => {
            console.error("Game listener error", error);
          }
        ),
        onSnapshot(
          query(turnsCol, orderBy("number", "asc")),
          (snapshot) => {
            const turns = snapshot.docs.map((snap) => mapTurnFromDoc(snap.id, snap.data() as Record<string, unknown>));
            setState((prev) => ({ ...prev, turns }));
          },
          (error) => {
            console.error("Turns listener error", error);
          }
        ),
        onSnapshot(
          query(threadsCol, orderBy("createdAt", "asc")),
          (snapshot) => {
            const threads = snapshot.docs.map((snap) =>
              mapThreadFromDoc(snap.id, snap.data() as Record<string, unknown>)
            );
            setState((prev) => ({ ...prev, threads }));
          },
          (error) => {
            console.error("Threads listener error", error);
          }
        ),
        onSnapshot(
          query(messagesCol, orderBy("createdAt", "asc")),
          (snapshot) => {
            const messages = snapshot.docs.map((snap) =>
              mapMessageFromDoc(snap.id, snap.data() as Record<string, unknown>)
            );
            setState((prev) => ({ ...prev, messages }));
          },
          (error) => {
            console.error("Messages listener error", error);
          }
        )
      ];
    }

    void startRealtime();

    return () => {
      cancelled = true;
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }, []);

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

    let db: Firestore;
    try {
      db = getFirebase().db;
    } catch {
      return;
    }

    const { messagesCol } = refs(db);
    const messageRef = doc(messagesCol);
    const payload: Record<string, unknown> = {
      threadId,
      authorId,
      body: trimmed,
      createdAt: new Date().toISOString(),
      reactions: []
    };
    if (parentMessageId) {
      payload.parentMessageId = parentMessageId;
    }

    void setDoc(messageRef, payload).catch((error) => {
      console.error("Failed to send message", error);
    });
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

    let db: Firestore;
    try {
      db = getFirebase().db;
    } catch {
      return;
    }

    const { messagesCol } = refs(db);
    const messageRef = doc(messagesCol, messageId);

    void runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(messageRef);
      if (!snapshot.exists()) {
        return;
      }
      const data = snapshot.data() as Record<string, unknown>;
      const reactions = mapReactions(data.reactions);
      const already = reactions.find((reaction) => reaction.emoji === emoji && reaction.userId === userId);
      const next = already
        ? reactions.filter((reaction) => !(reaction.emoji === emoji && reaction.userId === userId))
        : [...reactions, { emoji, userId }];
      transaction.update(messageRef, { reactions: next });
    }).catch((error) => {
      console.error("Failed to update reaction", error);
    });
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

  const publishTurn = ({ inWorldDate, body }: PublishTurnInput) => {
    const activeTurn = state.turns.find((turn) => turn.status === "active");
    const gmId = state.users.find((user) => user.role === "gm")?.id;

    if (!activeTurn || !gmId) {
      return;
    }

    const newspaperBody = body.trim();
    if (!newspaperBody) {
      return;
    }

    let db: Firestore;
    try {
      db = getFirebase().db;
    } catch {
      return;
    }

    const { gameRef, turnsCol, threadsCol, messagesCol } = refs(db);
    const playerIds = state.users.filter((user) => user.role === "player").map((user) => user.id);
    const newTurnNumber = Math.max(...state.turns.map((turn) => turn.number)) + 1;

    const newTurnRef = doc(turnsCol);
    const newTurnId = newTurnRef.id;

    const newGMThreads = playerIds.map((playerId) => {
      const playerName = state.users.find((user) => user.id === playerId)?.displayName ?? playerId;
      const threadRef = doc(threadsCol);
      return {
        ref: threadRef,
        data: {
          gameId: GAME_ID,
          turnId: newTurnId,
          kind: "gm_player" as const,
          participantIds: [gmId, playerId],
          title: `GM ↔ ${playerName}`,
          createdAt: new Date().toISOString()
        }
      };
    });

    const pairThreads: Array<{ ref: ReturnType<typeof doc>; data: Omit<Thread, "id"> }> = [];
    for (let i = 0; i < playerIds.length; i += 1) {
      for (let j = i + 1; j < playerIds.length; j += 1) {
        const first = playerIds[i];
        const second = playerIds[j];
        const firstName = state.users.find((user) => user.id === first)?.displayName ?? first;
        const secondName = state.users.find((user) => user.id === second)?.displayName ?? second;
        const threadRef = doc(threadsCol);
        pairThreads.push({
          ref: threadRef,
          data: {
            gameId: GAME_ID,
            turnId: newTurnId,
            kind: "player_player",
            participantIds: [first, second],
            title: `${firstName} ↔ ${secondName}`,
            createdAt: new Date().toISOString()
          }
        });
      }
    }

    const batch = writeBatch(db);

    batch.update(doc(turnsCol, activeTurn.id), { status: "archived" });
    batch.set(newTurnRef, {
      gameId: GAME_ID,
      number: newTurnNumber,
      inWorldDate,
      publishedAt: new Date().toISOString(),
      status: "active"
    });

    for (const thread of [...newGMThreads, ...pairThreads]) {
      batch.set(thread.ref, thread.data);
    }

    for (const gmThread of newGMThreads) {
      const messageRef = doc(messagesCol);
      batch.set(messageRef, {
        threadId: gmThread.ref.id,
        authorId: gmId,
        body: `NEWSPAPER - ${inWorldDate}: ${newspaperBody}`,
        createdAt: new Date().toISOString(),
        reactions: []
      });
    }

    batch.update(gameRef, { activeTurnId: newTurnId });

    void batch.commit().catch((error) => {
      console.error("Failed to publish turn", error);
    });
  };

  const getThreadsForUser = (userId: string, turnId: string) =>
    state.threads.filter((thread) => thread.turnId === turnId && thread.participantIds.includes(userId));

  const getMessagesForThread = (threadId: string) =>
    state.messages.filter((message) => message.threadId === threadId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const getTurnById = (turnId: string) => state.turns.find((turn) => turn.id === turnId);

  const value: StoreContextValue = {
    state,
    currentUser,
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
