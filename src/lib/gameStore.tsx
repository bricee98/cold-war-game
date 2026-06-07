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
import {
  type AIMessage,
  type AITurnSummary,
  type GameState,
  type Message,
  type Reaction,
  type Thread,
  type Turn,
  type User
} from "@/types/game";

interface PublishTurnInput {
  inWorldDate: string;
  body: string;
  whatPublicWouldntKnow?: string;
}

interface TurnSummaryContextThread {
  id: string;
  title: string;
  kind: Thread["kind"];
  participants: Array<{ id: string; displayName: string; role: User["role"] }>;
  messages: Array<{
    id: string;
    parentMessageId?: string;
    authorId: string;
    authorName: string;
    authorRole: User["role"];
    body: string;
    createdAt: string;
    reactions: Reaction[];
  }>;
}

interface TurnSummaryRequest {
  gameTitle: string;
  player: { id: string; displayName: string };
  turn: { id: string; number: number; inWorldDate: string };
  threads: TurnSummaryContextThread[];
}

interface PlayerSummaryResult {
  playerId: string;
  ok: boolean;
  usedFallback: boolean;
  error?: string;
}

interface StoreContextValue {
  state: GameState;
  currentUser: User;
  addMessage: (threadId: string, authorId: string, body: string, parentMessageId?: string) => void;
  editMessage: (messageId: string, userId: string, body: string) => { ok: true } | { ok: false; reason: string };
  addReaction: (messageId: string, userId: string, emoji: string) => void;
  deleteMessage: (messageId: string, userId: string) => { ok: true } | { ok: false; reason: string };
  addAIMessage: (userId: string, role: "user" | "assistant", body: string) => void;
  publishTurn: (input: PublishTurnInput) => void;
  updateTurnGmNote: (turnId: string, body: string) => { ok: true } | { ok: false; reason: string };
  updateMessageGmNote: (messageId: string, body: string) => { ok: true } | { ok: false; reason: string };
  generateLatestArchivedTurnSummaries: () => Promise<{ ok: true; reason?: string } | { ok: false; reason: string }>;
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

function isNewspaperBody(body: string): boolean {
  return /^NEWSPAPER\s*-/i.test(body.trim());
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

function aiSummariesCol(db: Firestore, userId: string) {
  return collection(db, "games", GAME_ID, "aiConversations", userId, "summaries");
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
    status: data.status === "archived" ? "archived" : "active",
    whatPublicWouldntKnow: typeof data.whatPublicWouldntKnow === "string" ? data.whatPublicWouldntKnow : ""
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
  const editedAt = "editedAt" in data ? asIsoString(data.editedAt) : undefined;

  return {
    id: messageId,
    threadId: typeof data.threadId === "string" ? data.threadId : "",
    parentMessageId,
    authorId: typeof data.authorId === "string" ? data.authorId : "",
    body: typeof data.body === "string" ? data.body : "",
    createdAt: asIsoString(data.createdAt),
    editedAt,
    whatPlayerWouldntKnow: typeof data.whatPlayerWouldntKnow === "string" ? data.whatPlayerWouldntKnow : "",
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

function mapAITurnSummaryFromDoc(summaryId: string, userId: string, data: Record<string, unknown>): AITurnSummary {
  return {
    id: summaryId,
    userId,
    turnId: typeof data.turnId === "string" ? data.turnId : "",
    turnNumber: typeof data.turnNumber === "number" ? data.turnNumber : 0,
    inWorldDate: typeof data.inWorldDate === "string" ? data.inWorldDate : "",
    summary: typeof data.summary === "string" ? data.summary : "",
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

      unsubscribes.push(
        onSnapshot(
          query(aiSummariesCol(db, currentUser.id), orderBy("turnNumber", "asc")),
          (snapshot) => {
            const aiTurnSummaries = snapshot.docs.map((snap) =>
              mapAITurnSummaryFromDoc(snap.id, currentUser.id, snap.data() as Record<string, unknown>)
            );
            setState((prev) => ({ ...prev, aiTurnSummaries }));
          },
          (error) => {
            console.error("AI turn summaries listener error", error);
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

  const editMessage = (messageId: string, userId: string, body: string): { ok: true } | { ok: false; reason: string } => {
    const trimmed = body.trim();
    if (!trimmed) {
      return { ok: false, reason: "Message cannot be empty." };
    }

    const message = state.messages.find((entry) => entry.id === messageId);
    if (!message) {
      return { ok: false, reason: "Message not found." };
    }

    if (message.authorId !== userId) {
      return { ok: false, reason: "You can only edit your own messages." };
    }

    if (message.body.trim() === trimmed) {
      return { ok: true };
    }

    const thread = state.threads.find((entry) => entry.id === message.threadId);
    const activeTurn = state.turns.find((turn) => turn.status === "active");
    if (!thread || !activeTurn || thread.turnId !== activeTurn.id || !thread.participantIds.includes(userId)) {
      return { ok: false, reason: "Only messages in the active turn can be edited." };
    }

    let db: Firestore;
    try {
      db = getFirebase().db;
    } catch {
      return { ok: false, reason: "Firestore unavailable." };
    }

    const { messagesCol } = refs(db);
    const messageRef = doc(messagesCol, messageId);

    void runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(messageRef);
      if (!snapshot.exists()) {
        return;
      }
      const data = snapshot.data() as Record<string, unknown>;
      if (typeof data.authorId !== "string" || data.authorId !== userId) {
        return;
      }
      transaction.update(messageRef, {
        body: trimmed,
        editedAt: new Date().toISOString()
      });
    }).catch((error) => {
      console.error("Failed to edit message", error);
    });

    return { ok: true };
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

  const buildTurnSummaryContext = (playerId: string, turn: Turn): TurnSummaryRequest | null => {
    const player = state.users.find((entry) => entry.id === playerId);
    if (!player) {
      return null;
    }

    const threads = state.threads
      .filter((thread) => thread.turnId === turn.id && thread.participantIds.includes(playerId))
      .map((thread) => {
        const participants = thread.participantIds.map((participantId) => {
          const participant = state.users.find((entry) => entry.id === participantId);
          return {
            id: participantId,
            displayName: participant?.displayName ?? participantId,
            role: participant?.role ?? "player"
          };
        });

        const messages = state.messages
          .filter((message) => message.threadId === thread.id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((message) => {
            const author = state.users.find((entry) => entry.id === message.authorId);
            return {
              id: message.id,
              parentMessageId: message.parentMessageId,
              authorId: message.authorId,
              authorName: author?.displayName ?? message.authorId,
              authorRole: author?.role ?? "player",
              body: message.body,
              createdAt: message.createdAt,
              reactions: message.reactions
            };
          });

        return {
          id: thread.id,
          title: thread.title,
          kind: thread.kind,
          participants,
          messages
        };
      });

    return {
      gameTitle: state.game.title,
      player: {
        id: player.id,
        displayName: player.displayName
      },
      turn: {
        id: turn.id,
        number: turn.number,
        inWorldDate: turn.inWorldDate
      },
      threads
    };
  };

  const buildFallbackTurnSummary = (context: TurnSummaryRequest): string => {
    const totalMessages = context.threads.reduce((count, thread) => count + thread.messages.length, 0);
    const authoredMessages = context.threads.reduce(
      (count, thread) => count + thread.messages.filter((message) => message.authorId === context.player.id).length,
      0
    );
    const latestMessage = context.threads
      .flatMap((thread) => thread.messages)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    const latestThreadTitle = latestMessage
      ? context.threads.find((thread) => thread.messages.some((message) => message.id === latestMessage.id))?.title ??
        "Active channels"
      : "Active channels";
    const latestSnippet = latestMessage ? latestMessage.body.trim().replace(/\s+/g, " ").slice(0, 220) : "";

    return [
      "## What Happened",
      `Turn ${context.turn.number} (${context.turn.inWorldDate}) covered ${context.threads.length} visible channels and ${totalMessages} messages for ${context.player.displayName}.`,
      "",
      "## Strategy Read",
      `${context.player.displayName} authored ${authoredMessages} messages. Priorities should be inferred from channel choice, reaction patterns, and final messages in each thread.`,
      "",
      "## Commitments And Constraints",
      "Track promises made to GM and other players in visible threads. Preserve consistency with prior turn summaries and keep plausible deniability where useful.",
      "",
      "## Priorities For Next Turn",
      latestSnippet
        ? `Revisit latest development from ${latestThreadTitle}: "${latestSnippet}". Build a response plan with one diplomatic action, one information action, and one contingency.`
        : "Open next turn by clarifying immediate objectives with GM, then coordinate discreetly with relevant player channels."
    ].join("\n");
  };

  const generateTurnSummaryForPlayer = async (
    db: Firestore,
    playerId: string,
    turn: Turn,
    generatedAt: string
  ): Promise<PlayerSummaryResult> => {
    const context = buildTurnSummaryContext(playerId, turn);
    if (!context) {
      return { playerId, ok: false, usedFallback: false, error: "No turn context available." };
    }

    let response: Response;
    try {
      response = await fetch("/api/ai/turn-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(context)
      });
    } catch (error) {
      console.error(`Failed requesting turn summary for ${playerId}`, error);
      const fallback = buildFallbackTurnSummary(context);
      try {
        await setDoc(
          doc(aiSummariesCol(db, playerId), turn.id),
          {
            userId: playerId,
            turnId: turn.id,
            turnNumber: turn.number,
            inWorldDate: turn.inWorldDate,
            summary: fallback,
            model: "fallback-local",
            createdAt: generatedAt
          },
          { merge: true }
        );
        return { playerId, ok: true, usedFallback: true };
      } catch (writeError) {
        return { playerId, ok: false, usedFallback: false, error: String(writeError) };
      }
    }

    let payload: { summary?: string; model?: string; error?: string } = {};
    try {
      payload = (await response.json()) as { summary?: string; model?: string; error?: string };
    } catch (error) {
      console.error(`Invalid summary response JSON for ${playerId}`, error);
    }

    const useFallback = !response.ok || !payload.summary?.trim();
    const summaryBody = useFallback ? buildFallbackTurnSummary(context) : payload.summary!.trim();
    const modelName = useFallback ? "fallback-local" : payload.model ?? null;

    const summaryRef = doc(aiSummariesCol(db, playerId), turn.id);
    try {
      await setDoc(
        summaryRef,
        {
          userId: playerId,
          turnId: turn.id,
          turnNumber: turn.number,
          inWorldDate: turn.inWorldDate,
          summary: summaryBody,
          model: modelName,
          createdAt: generatedAt
        },
        { merge: true }
      );
    } catch (error) {
      return { playerId, ok: false, usedFallback: false, error: String(error) };
    }

    if (useFallback) {
      console.warn(`Turn summary AI fallback used for ${playerId}`, payload.error ?? response.statusText);
    }
    return { playerId, ok: true, usedFallback: useFallback };
  };

  const generateTurnSummariesForArchivedTurn = async (
    db: Firestore,
    turn: Turn,
    playerIds: string[],
    generatedAt: string
  ): Promise<PlayerSummaryResult[]> => {
    const tasks = playerIds.map((playerId) => generateTurnSummaryForPlayer(db, playerId, turn, generatedAt));
    return Promise.all(tasks);
  };

  const generateLatestArchivedTurnSummaries = async (): Promise<
    { ok: true; reason?: string } | { ok: false; reason: string }
  > => {
    if (currentUser.role !== "gm") {
      return { ok: false, reason: "Only GM can generate turn summaries." };
    }

    const latestArchivedTurn = state.turns
      .filter((turn) => turn.status === "archived")
      .sort((a, b) => b.number - a.number)[0];

    if (!latestArchivedTurn) {
      return { ok: false, reason: "No archived turn found yet." };
    }

    const playerIds = state.users.filter((user) => user.role === "player").map((user) => user.id);
    if (!playerIds.length) {
      return { ok: false, reason: "No players found to summarize." };
    }

    let db: Firestore;
    try {
      db = getFirebase().db;
    } catch {
      return { ok: false, reason: "Firestore unavailable." };
    }

    const results = await generateTurnSummariesForArchivedTurn(db, latestArchivedTurn, playerIds, new Date().toISOString());
    const failed = results.filter((result) => !result.ok);
    if (failed.length) {
      const names = failed
        .map((result) => state.users.find((user) => user.id === result.playerId)?.displayName ?? result.playerId)
        .join(", ");
      return { ok: false, reason: `Failed for: ${names}. Check console logs.` };
    }

    const fallbackCount = results.filter((result) => result.usedFallback).length;
    if (fallbackCount > 0) {
      return {
        ok: true,
        reason: `Summaries saved for all players (${fallbackCount} used fallback because AI generation failed).`
      };
    }

    return { ok: true, reason: "Summaries generated for all players." };
  };

  const updateTurnGmNote = (turnId: string, body: string): { ok: true } | { ok: false; reason: string } => {
    if (currentUser.role !== "gm") {
      return { ok: false, reason: "Only GM can edit hidden turn notes." };
    }

    const turn = state.turns.find((entry) => entry.id === turnId);
    if (!turn) {
      return { ok: false, reason: "Turn not found." };
    }

    const nextBody = body.trim();
    if ((turn.whatPublicWouldntKnow ?? "").trim() === nextBody) {
      return { ok: true };
    }

    let db: Firestore;
    try {
      db = getFirebase().db;
    } catch {
      return { ok: false, reason: "Firestore unavailable." };
    }

    const { turnsCol } = refs(db);
    void setDoc(doc(turnsCol, turnId), { whatPublicWouldntKnow: nextBody }, { merge: true }).catch((error) => {
      console.error("Failed to update hidden turn note", error);
    });

    return { ok: true };
  };

  const updateMessageGmNote = (messageId: string, body: string): { ok: true } | { ok: false; reason: string } => {
    if (currentUser.role !== "gm") {
      return { ok: false, reason: "Only GM can edit hidden memo notes." };
    }

    const message = state.messages.find((entry) => entry.id === messageId);
    if (!message) {
      return { ok: false, reason: "Message not found." };
    }

    if (message.authorId !== currentUser.id || isNewspaperBody(message.body)) {
      return { ok: false, reason: "Hidden player-knowledge notes can only be attached to GM memos." };
    }

    const nextBody = body.trim();
    if ((message.whatPlayerWouldntKnow ?? "").trim() === nextBody) {
      return { ok: true };
    }

    let db: Firestore;
    try {
      db = getFirebase().db;
    } catch {
      return { ok: false, reason: "Firestore unavailable." };
    }

    const { messagesCol } = refs(db);
    void setDoc(doc(messagesCol, messageId), { whatPlayerWouldntKnow: nextBody }, { merge: true }).catch((error) => {
      console.error("Failed to update hidden memo note", error);
    });

    return { ok: true };
  };

  const publishTurn = ({ inWorldDate, body, whatPublicWouldntKnow }: PublishTurnInput) => {
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
      status: "active",
      whatPublicWouldntKnow: whatPublicWouldntKnow?.trim() ?? ""
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

    void batch
      .commit()
      .then(() => {
        void generateTurnSummariesForArchivedTurn(db, activeTurn, playerIds, nowIso).then((results) => {
          const failed = results.filter((result) => !result.ok);
          if (failed.length) {
            console.error("One or more turn summaries failed after publish", failed);
          }
        });
      })
      .catch((error) => {
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
    editMessage,
    addReaction,
    deleteMessage,
    addAIMessage,
    publishTurn,
    updateTurnGmNote,
    updateMessageGmNote,
    generateLatestArchivedTurnSummaries,
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
