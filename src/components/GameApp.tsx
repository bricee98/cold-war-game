"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatInWorldDate, formatIsoDateTime } from "@/lib/format";
import { getAIResponses, useGameStore } from "@/lib/gameStore";
import { Message, Thread, Turn } from "@/types/game";

function TurnList({
  turns,
  selectedTurnId,
  onSelect,
  showGmDeskLink
}: {
  turns: Turn[];
  selectedTurnId: string;
  onSelect: (turnId: string) => void;
  showGmDeskLink: boolean;
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
      {showGmDeskLink ? (
        <Link href="/gm" className="navButton">
          Open Newspaper Desk
        </Link>
      ) : null}
    </aside>
  );
}

function ChannelControl({
  channels,
  selectedChannelId,
  onSelectChannel,
  isReadOnlyTurn
}: {
  channels: Thread[];
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  isReadOnlyTurn: boolean;
}) {
  return (
    <section className="panel controlPanel">
      <div className="controlStrip single">
        <label>
          Private Channel
          <select
            value={selectedChannelId ?? ""}
            onChange={(event) => onSelectChannel(event.target.value)}
            disabled={!channels.length}
          >
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isReadOnlyTurn ? <p className="muted">Past turns are read-only.</p> : null}
    </section>
  );
}

function MessageCard({
  message,
  replies,
  isReadOnly,
  currentUserId,
  onReact,
  onReply
}: {
  message: Message;
  replies: Message[];
  isReadOnly: boolean;
  currentUserId: string;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (parentMessageId: string, body: string) => void;
}) {
  const [showThread, setShowThread] = useState(replies.length > 0);
  const [replyDraft, setReplyDraft] = useState("");

  const submitReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = replyDraft.trim();
    if (!trimmed || isReadOnly) {
      return;
    }
    onReply(message.id, trimmed);
    setReplyDraft("");
    setShowThread(true);
  };

  return (
    <article key={message.id} className={message.authorId === currentUserId ? "message mine" : "message"}>
      <p>{message.body}</p>
      <footer>
        <small>{formatIsoDateTime(message.createdAt)}</small>
        <div className="messageActions">
          <button type="button" className="threadToggle" onClick={() => setShowThread((prev) => !prev)}>
            {replies.length ? `Thread (${replies.length})` : "Start Thread"}
          </button>
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
        </div>
      </footer>

      {showThread ? (
        <section className="threadReplies">
          {replies.length ? (
            <div className="replyList">
              {replies.map((reply) => (
                <div key={reply.id} className={reply.authorId === currentUserId ? "replyMessage mine" : "replyMessage"}>
                  <p>{reply.body}</p>
                  <small>{formatIsoDateTime(reply.createdAt)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No replies yet.</p>
          )}

          <form className="compose replyCompose" onSubmit={submitReply}>
            <input
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.target.value)}
              placeholder={isReadOnly ? "Past turn is read-only" : "Reply in thread"}
              disabled={isReadOnly}
            />
            <button type="submit" disabled={isReadOnly || !replyDraft.trim()}>
              Reply
            </button>
          </form>
        </section>
      ) : null}
    </article>
  );
}

function MessageFeed({
  messages,
  isReadOnly,
  currentUserId,
  onReact,
  onReply
}: {
  messages: Message[];
  isReadOnly: boolean;
  currentUserId: string;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (parentMessageId: string, body: string) => void;
}) {
  const topLevel = useMemo(() => messages.filter((message) => !message.parentMessageId), [messages]);

  const repliesByParent = useMemo(() => {
    const map = new Map<string, Message[]>();
    for (const message of messages) {
      if (!message.parentMessageId) {
        continue;
      }
      const current = map.get(message.parentMessageId) ?? [];
      current.push(message);
      map.set(message.parentMessageId, current);
    }
    return map;
  }, [messages]);

  return (
    <div className="messages">
      {topLevel.map((message) => (
        <MessageCard
          key={message.id}
          message={message}
          replies={repliesByParent.get(message.id) ?? []}
          isReadOnly={isReadOnly}
          currentUserId={currentUserId}
          onReact={onReact}
          onReply={onReply}
        />
      ))}
      {!topLevel.length ? <p className="muted">No messages yet in this channel.</p> : null}
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
    <details className="panel aiPanel">
      <summary>Private AI Assistant</summary>
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
    </details>
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

  const channels = useMemo(() => {
    if (!turn) {
      return [];
    }
    return getThreadsForUser(currentUser.id, turn.id).sort((a, b) => a.title.localeCompare(b.title));
  }, [currentUser.id, getThreadsForUser, turn]);

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedChannelId(null);
  }, [selectedTurnId, currentUser.id]);

  const activeChannelId = useMemo(() => {
    if (selectedChannelId && channels.some((thread) => thread.id === selectedChannelId)) {
      return selectedChannelId;
    }
    return channels[0]?.id ?? null;
  }, [selectedChannelId, channels]);

  const messages = activeChannelId ? getMessagesForThread(activeChannelId) : [];
  const isReadOnlyTurn = turn?.status !== "active";

  const [draft, setDraft] = useState("");

  const submitTopLevelMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeChannelId) {
      return;
    }
    addMessage(activeChannelId, currentUser.id, draft);
    setDraft("");
  };

  const replyInThread = (parentMessageId: string, body: string) => {
    if (!activeChannelId) {
      return;
    }
    addMessage(activeChannelId, currentUser.id, body, parentMessageId);
  };

  return (
    <main className="appShell">
      <header className="topBar panel">
        <div>
          <h1>{state.game.title}</h1>
          <p className="muted">Threads are optional under each message, with channel-first conversation flow.</p>
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
        <TurnList
          turns={state.turns}
          selectedTurnId={selectedTurnId}
          onSelect={setSelectedTurnId}
          showGmDeskLink={currentUser.role === "gm"}
        />

        <section className="mainColumn">
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

                <ChannelControl
                  channels={channels}
                  selectedChannelId={activeChannelId}
                  onSelectChannel={setSelectedChannelId}
                  isReadOnlyTurn={isReadOnlyTurn}
                />

                <MessageFeed
                  messages={messages}
                  isReadOnly={isReadOnlyTurn}
                  onReact={(messageId, emoji) => addReaction(messageId, currentUser.id, emoji)}
                  onReply={replyInThread}
                  currentUserId={currentUser.id}
                />

                <form onSubmit={submitTopLevelMessage} className="compose">
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={isReadOnlyTurn ? "Past turn is read-only" : "Type a message"}
                    disabled={isReadOnlyTurn || !activeChannelId}
                  />
                  <button type="submit" disabled={isReadOnlyTurn || !activeChannelId || !draft.trim()}>
                    Send
                  </button>
                </form>
              </>
            ) : (
              <p>No turn selected.</p>
            )}
          </section>

          {currentUser.role === "player" ? <AIPrivatePanel userId={currentUser.id} /> : null}
        </section>
      </section>
    </main>
  );
}
