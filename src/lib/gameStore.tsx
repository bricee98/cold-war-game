"use client";

import {
  collection,
  doc,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  writeBatch
} from "firebase/firestore";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { getFirebase } from "@/lib/firebase";
import { initialState } from "@/lib/mockData";
import { type AIMessage, type GameState, type Message, type Reaction, type Thread, type Turn, type User } from "@/types/game";

interface PublishTurnInput {
  inWorldDate: string;
  body: string;
}

interface StoreContextValue {
  state: GameState;
  currentUser: User;
  addMessage: (threadId: string, authorId: string, body: string, parentMessageId?: string) => void;
  addReaction: (messageId: string, userId: string, emoji: string) => void;
  deleteMessage: (messageId: string, userId: string) => { ok: true } | { ok: false; reason: string };
  addAIMessage: (userId: string, role: "user" | "assistant", body: string) => void;
  publishTurn: (input: PublishTurnInput) => void;
  getThreadsForUser: (userId: string, turnId: string) => Thread[];
  getMessagesForThread: (threadId: string) => Message[];
  getTurnById: (turnId: string) => Turn | undefined;
}

const GameStoreContext = createContext<StoreContextValue | undefined>(undefined);
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
  const membersCol = collection(db, "games", GAME_ID, "members");
  return { gameRef, turnsCol, threadsCol, messagesCol, membersCol };
}

function aiMessagesCol(db: Firestore, userId: string) {
  return collection(db, "games", GAME_ID, "aiConversations", userId, "messages");
}

async function ensureMembership(db: Firestore, firebaseUid: string, currentUser: User) {
  const { membersCol } = refs(db);
  await setDoc(
    doc(membersCol, firebaseUid),
    {
      mappedUserId: currentUser.id,
      role: currentUser.role,
      displayName: currentUser.displayName,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );
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

function mapAIMessageFromDoc(messageId: string, userId: string, data: Record<string, unknown>): AIMessage {
  const role = data.role === "assistant" ? "assistant" : "user";
  return {
    id: messageId,
    userId,
    role,
    body: typeof data.body === "string" ? data.body : "",
    createdAt: asIsoString(data.createdAt)
  };
}

export function GameStoreProvider({
  children,
  currentUserId,
  firebaseUid
}: {
  children: ReactNode;
  currentUserId: string;
  firebaseUid: string;
}) {
  const [state, setState] = useState<GameState>(initialState);

  const currentUser = state.users.find((user) => user.id === currentUserId) ?? state.users[0];

  useEffect(() => {
    let cancelled = false;
    const unsubscribes: Array<() => void> = [];

    async function startRealtime() {
      let db: Firestore;
      try {
        db = getFirebase().db;
      } catch (error) {
        console.error("Firestore unavailable; using local state.", error);
        return;
      }

      try {
        await ensureMembership(db, firebaseUid, currentUser);
      } catch (error) {
        console.error("Failed to register membership.", error);
      }

      if (currentUser.role === "gm") {
        try {
          await seedInitialGame(db);
        } catch (error) {
          console.error("Failed seeding game state.", error);
        }
      }

      if (cancelled) {
        return;
      }

      const { gameRef, turnsCol, threadsCol, messagesCol } = refs(db);

      unsubscribes.push(
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
        )
      );

      unsubscribes.push(
        onSnapshot(
          query(turnsCol, orderBy("number", "asc")),
          (snapshot) => {
            const turns = snapshot.docs.map((snap) => mapTurnFromDoc(snap.id, snap.data() as Record<string, unknown>));
            setState((prev) => ({ ...prev, turns }));
          },
          (error) => {
            console.error("Turns listener error", error);
          }
        )
      );

      unsubscribes.push(
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
        )
      );

      unsubscribes.push(
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
      );

      unsubscribes.push(
        onSnapshot(
          query(aiMessagesCol(db, currentUser.id), orderBy("createdAt", "asc")),
          (snapshot) => {
            const aiMessages = snapshot.docs.map((snap) =>
              mapAIMessageFromDoc(snap.id, currentUser.id, snap.data() as Record<string, unknown>)
            );
            setState((prev) => ({ ...prev, aiMessages }));
          },
          (error) => {
            console.error("AI messages listener error", error);
          }
        )
      );
    }

    void startRealtime();

    return () => {
      cancelled = true;
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }, [currentUser, firebaseUid]);

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
    const message = state.messages.find((entry) => entry.id === messageId);
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

  const deleteMessage = (messageId: string, userId: string): { ok: true } | { ok: false; reason: string } => {
    const message = state.messages.find((entry) => entry.id === messageId);
    if (!message) {
      return { ok: false, reason: "Message not found." };
    }

    if (message.authorId !== userId) {
      return { ok: false, reason: "You can only delete your own messages." };
    }

    const thread = state.threads.find((entry) => entry.id === message.threadId);
    const activeTurn = state.turns.find((turn) => turn.status === "active");
    if (!thread || !activeTurn || thread.turnId !== activeTurn.id || !thread.participantIds.includes(userId)) {
      return { ok: false, reason: "Only messages in the active turn can be deleted." };
    }

    const byParentId = new Map<string, Message[]>();
    for (const candidate of state.messages) {
      if (!candidate.parentMessageId) {
        continue;
      }
      const bucket = byParentId.get(candidate.parentMessageId) ?? [];
      bucket.push(candidate);
      byParentId.set(candidate.parentMessageId, bucket);
    }

    const queue: Message[] = [message];
    const toDelete = new Set<string>([message.id]);
    while (queue.length) {
      const current = queue.shift();
      if (!current) {
        break;
      }
      const children = byParentId.get(current.id) ?? [];
      for (const child of children) {
        if (child.authorId !== userId) {
          return {
            ok: false,
            reason: "Delete blocked because this message has thread replies from other players."
          };
        }
        if (!toDelete.has(child.id)) {
          toDelete.add(child.id);
          queue.push(child);
        }
      }
    }

    let db: Firestore;
    try {
      db = getFirebase().db;
    } catch {
      return { ok: false, reason: "Firestore unavailable." };
    }

    const { messagesCol } = refs(db);
    const batch = writeBatch(db);
    for (const idToDelete of toDelete) {
      batch.delete(doc(messagesCol, idToDelete));
    }
    void batch.commit().catch((error) => {
      console.error("Failed to delete message", error);
    });

    return { ok: true };
  };

  const addAIMessage = (userId: string, role: "user" | "assistant", body: string) => {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    if (userId !== currentUser.id) {
      return;
    }

    let db: Firestore;
    try {
      db = getFirebase().db;
    } catch {
      return;
    }

    const messageRef = doc(aiMessagesCol(db, userId));
    void setDoc(messageRef, {
      userId,
      role,
      body: trimmed,
      createdAt: new Date().toISOString()
    }).catch((error) => {
      console.error("Failed to save AI message", error);
    });
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
    const nowIso = new Date().toISOString();

    const newTurnRef = doc(turnsCol);
    const newTurnId = newTurnRef.id;

    const newGMThreads: Array<{ ref: DocumentReference<DocumentData>; data: Record<string, unknown> }> = playerIds.map(
      (playerId) => {
        const playerName = state.users.find((user) => user.id === playerId)?.displayName ?? playerId;
        const threadRef = doc(threadsCol);
        return {
          ref: threadRef,
          data: {
            gameId: GAME_ID,
            turnId: newTurnId,
            kind: "gm_player",
            participantIds: [gmId, playerId],
            title: `GM ↔ ${playerName}`,
            createdAt: nowIso
          }
        };
      }
    );

    const pairThreads: Array<{ ref: DocumentReference<DocumentData>; data: Record<string, unknown> }> = [];
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
            createdAt: nowIso
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
      publishedAt: nowIso,
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
        createdAt: nowIso,
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
    state.messages
      .filter((message) => message.threadId === threadId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const getTurnById = (turnId: string) => state.turns.find((turn) => turn.id === turnId);

  const value: StoreContextValue = {
    state,
    currentUser,
    addMessage,
    addReaction,
    deleteMessage,
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
