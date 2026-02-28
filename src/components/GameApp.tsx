"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatInWorldDate, formatIsoDateTime } from "@/lib/format";
import { getAIResponses, useCurrentTurn, useGameStore } from "@/lib/gameStore";
import { Message, Thread, Turn } from "@/types/game";

function TurnList({
  turns,
  selectedTurnId,
  onSelect
}: {
  turns: Turn[];
  selectedTurnId: string;
  onSelect: (turnId: string) => void;
}) {
  return (
    <aside className="panel turnList">
      <h2>Turns</h2>
      <div className="turnItems">
        {turns
          .sort((a, b) => b.number - a.number)
          .map((turn) => (
            <button
              key={turn.id}
              type="button"
              className={turn.id === selectedTurnId ? "turnItem active" : "turnItem"}
              onClick={() => onSelect(turn.id)}
            >
              <strong>Turn {turn.number}</strong>
              <span>{formatInWorldDate(turn.inWorldDate)}</span>
              <small>{turn.status === "active" ? "Active" : "Read-only"}</small>
            </button>
          ))}
      </div>
    </aside>
  );
}

function ThreadList({
  threads,
  selectedThreadId,
  onSelect
}: {
  threads: Thread[];
  selectedThreadId: string | null;
  onSelect: (threadId: string) => void;
}) {
  return (
    <section className="panel">
      <h3>Private Channels</h3>
      <div className="threadItems">
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            className={thread.id === selectedThreadId ? "threadItem active" : "threadItem"}
            onClick={() => onSelect(thread.id)}
          >
            <span>{thread.title}</span>
            <small>{thread.kind === "gm_player" ? "GM" : "Player"}</small>
          </button>
        ))}
        {!threads.length ? <p className="muted">No threads on this turn.</p> : null}
      </div>
    </section>
  );
}

function MessageList({
  messages,
  isReadOnly,
  onReact,
  currentUserId
}: {
  messages: Message[];
  isReadOnly: boolean;
  onReact: (messageId: string, emoji: string) => void;
  currentUserId: string;
}) {
  return (
    <div className="messages">
      {messages.map((message) => (
        <article key={message.id} className={message.authorId === currentUserId ? "message mine" : "message"}>
          <p>{message.body}</p>
          <footer>
            <small>{formatIsoDateTime(message.createdAt)}</small>
            <div className="reactions">
              {message.reactions.map((reaction) => (
                <button
                  key={`${reaction.emoji}-${reaction.userId}`}
                  type="button"
                  className={reaction.userId === currentUserId ? "react active" : "react"}
                  onClick={() => !isReadOnly && onReact(message.id, reaction.emoji)}
                  disabled={isReadOnly}
                >
                  {reaction.emoji}
                </button>
              ))}
              {!isReadOnly ? (
                <>
                  <button type="button" className="react" onClick={() => onReact(message.id, "👍")}>
                    👍
                  </button>
                  <button type="button" className="react" onClick={() => onReact(message.id, "👀")}>
                    👀
                  </button>
                </>
              ) : null}
            </div>
          </footer>
        </article>
      ))}
      {!messages.length ? <p className="muted">No messages yet.</p> : null}
    </div>
  );
}

function AIPrivatePanel({ userId }: { userId: string }) {
  const { state, addAIMessage } = useGameStore();
  const [draft, setDraft] = useState("");

  const aiMessages = state.aiMessages.filter((msg) => msg.userId === userId);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }
    addAIMessage(userId, "user", trimmed);
    addAIMessage(userId, "assistant", getAIResponses(trimmed));
    setDraft("");
  };

  return (
    <section className="panel aiPanel">
      <h3>Private AI</h3>
      <p className="muted">Only visible to this player. GM cannot view this panel.</p>
      <div className="aiMessages">
        {aiMessages.map((msg) => (
          <div key={msg.id} className={msg.role === "assistant" ? "aiMessage assistant" : "aiMessage user"}>
            <strong>{msg.role === "assistant" ? "AI" : "You"}</strong>
            <p>{msg.body}</p>
          </div>
        ))}
      </div>
      <form onSubmit={onSubmit} className="compose">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask your private strategy question"
        />
        <button type="submit">Send</button>
      </form>
    </section>
  );
}

function GmTurnPublisher() {
  const { publishTurn } = useGameStore();
  const currentTurn = useCurrentTurn();
  const [inWorldDate, setInWorldDate] = useState(currentTurn?.inWorldDate ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inWorldDate || !title.trim() || !body.trim()) {
      return;
    }
    publishTurn({ inWorldDate, title: title.trim(), body: body.trim() });
    setTitle("");
    setBody("");
  };

  return (
    <section className="panel">
      <h3>Publish Newspaper / Start Next Turn</h3>
      <form onSubmit={onSubmit} className="stack">
        <label>
          In-world date
          <input type="date" value={inWorldDate} onChange={(event) => setInWorldDate(event.target.value)} />
        </label>
        <label>
          Headline
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Global Bulletin title" />
        </label>
        <label>
          Body
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            placeholder="What all players receive for this turn"
          />
        </label>
        <button type="submit">Publish & Advance Turn</button>
      </form>
    </section>
  );
}

export function GameApp() {
  const {
    state,
    currentUser,
    setCurrentUserId,
    addMessage,
    addReaction,
    getThreadsForUser,
    getMessagesForThread,
    getTurnById
  } = useGameStore();

  const [selectedTurnId, setSelectedTurnId] = useState(state.game.activeTurnId);
  const turn = getTurnById(selectedTurnId);
  useEffect(() => {
    setSelectedTurnId(state.game.activeTurnId);
  }, [state.game.activeTurnId]);

  const threads = useMemo(() => {
    if (!turn) {
      return [];
    }
    return getThreadsForUser(currentUser.id, turn.id).sort((a, b) => a.title.localeCompare(b.title));
  }, [currentUser.id, getThreadsForUser, turn]);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedThreadId(null);
  }, [selectedTurnId, currentUser.id]);

  const activeThreadId = useMemo(() => {
    if (selectedThreadId && threads.some((thread) => thread.id === selectedThreadId)) {
      return selectedThreadId;
    }
    return threads[0]?.id ?? null;
  }, [selectedThreadId, threads]);

  const messages = activeThreadId ? getMessagesForThread(activeThreadId) : [];
  const isReadOnlyTurn = turn?.status !== "active";

  const [draft, setDraft] = useState("");

  const submitMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeThreadId) {
      return;
    }
    addMessage(activeThreadId, currentUser.id, draft);
    setDraft("");
  };

  return (
    <main className="appShell">
      <header className="topBar panel">
        <div>
          <h1>{state.game.title}</h1>
          <p className="muted">Private turn-based channels with GM newspaper turn control.</p>
        </div>
        <label>
          View as
          <select value={currentUser.id} onChange={(event) => setCurrentUserId(event.target.value)}>
            {state.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName} ({user.role})
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="contentGrid">
        <TurnList turns={state.turns} selectedTurnId={selectedTurnId} onSelect={setSelectedTurnId} />

        <section className="panel conversationPanel">
          {turn ? (
            <>
              <div className="turnHeader">
                <h2>
                  Turn {turn.number}: {turn.newspaperTitle}
                </h2>
                <p>
                  <strong>Date:</strong> {formatInWorldDate(turn.inWorldDate)}
                </p>
                <p>{turn.newspaperBody}</p>
                <small>Published {formatIsoDateTime(turn.publishedAt)}</small>
              </div>

              <ThreadList
                threads={threads}
                selectedThreadId={activeThreadId}
                onSelect={(threadId) => setSelectedThreadId(threadId)}
              />

              <MessageList
                messages={messages}
                isReadOnly={isReadOnlyTurn}
                onReact={(messageId, emoji) => addReaction(messageId, currentUser.id, emoji)}
                currentUserId={currentUser.id}
              />

              <form onSubmit={submitMessage} className="compose">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={isReadOnlyTurn ? "Past turn is read-only" : "Type a message"}
                  disabled={isReadOnlyTurn || !activeThreadId}
                />
                <button type="submit" disabled={isReadOnlyTurn || !activeThreadId}>
                  Send
                </button>
              </form>
            </>
          ) : (
            <p>No turn selected.</p>
          )}
        </section>

        <section className="rightRail">
          {currentUser.role === "gm" ? <GmTurnPublisher /> : null}
          {currentUser.role === "player" ? <AIPrivatePanel userId={currentUser.id} /> : null}
        </section>
      </section>
    </main>
  );
}
