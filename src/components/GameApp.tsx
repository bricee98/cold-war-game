"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { MarkdownText } from "@/components/MarkdownText";
import { useAuth } from "@/lib/auth";
import { formatInWorldDate, formatIsoDateTime, formatShortInWorldDate } from "@/lib/format";
import { getAIResponses, useGameStore } from "@/lib/gameStore";
import { Message, Role, Thread, Turn } from "@/types/game";

const REACTION_OPTIONS = [
  { emoji: "👍", label: "Thumbs Up" },
  { emoji: "👎", label: "Thumbs Down" },
  { emoji: "✅", label: "Checkmark" },
  { emoji: "👀", label: "Eyes" },
  { emoji: "🇺🇸", label: "USA" },
  { emoji: "🇨🇳", label: "China" },
  { emoji: "☭", label: "USSR" },
  { emoji: "🇫🇮", label: "Finland" }
] as const;

function ReactionGlyph({ symbol }: { symbol: string }) {
  if (symbol === "☭") {
    return (
      <span className="sovietGlyph" aria-label="Soviet flag reaction">
        ☭
      </span>
    );
  }
  return <span>{symbol}</span>;
}

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
              <strong>
                Turn {turn.number} - {formatShortInWorldDate(turn.inWorldDate)}
              </strong>
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
        <select
          aria-label="Channel picker"
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
  roleByUserId,
  onReact,
  onReply
}: {
  message: Message;
  replies: Message[];
  isReadOnly: boolean;
  currentUserId: string;
  roleByUserId: Map<string, Role>;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (parentMessageId: string, body: string) => void;
}) {
  const [showThread, setShowThread] = useState(replies.length > 0);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");

  const reactionBuckets = useMemo(() => {
    const buckets = new Map<string, { emoji: string; role: Role; count: number; currentUserReacted: boolean }>();

    for (const reaction of message.reactions) {
      const role = roleByUserId.get(reaction.userId) ?? "player";
      const key = `${reaction.emoji}-${role}`;
      const bucket = buckets.get(key);
      if (!bucket) {
        buckets.set(key, {
          emoji: reaction.emoji,
          role,
          count: 1,
          currentUserReacted: reaction.userId === currentUserId
        });
      } else {
        bucket.count += 1;
        if (reaction.userId === currentUserId) {
          bucket.currentUserReacted = true;
        }
      }
    }

    return Array.from(buckets.values());
  }, [currentUserId, message.reactions, roleByUserId]);

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
      <div className="messageBodyRow">
        <MarkdownText content={message.body} className="messageBodyText markdownContent" />
        <CopyButton text={message.body} ariaLabel="Copy message text" />
      </div>
      <footer>
        <small>{formatIsoDateTime(message.createdAt)}</small>
        <div className="messageActions">
          <button type="button" className="threadToggle" onClick={() => setShowThread((prev) => !prev)}>
            {replies.length ? `↩ (${replies.length})` : "↩"}
          </button>
          <div className="reactionArea">
            <div className="reactionTray">
              {reactionBuckets.map((bucket) => (
                <button
                  key={`${bucket.emoji}-${bucket.role}`}
                  type="button"
                  className={`reactionPill ${bucket.role}${bucket.currentUserReacted ? " active" : ""}`}
                  onClick={() => !isReadOnly && onReact(message.id, bucket.emoji)}
                  disabled={isReadOnly}
                >
                  <ReactionGlyph symbol={bucket.emoji} />
                  <span className="reactionCount">{bucket.count}</span>
                  <span className="reactionRole">{bucket.role === "gm" ? "GM" : "P"}</span>
                </button>
              ))}
            </div>
            {!isReadOnly ? (
              <div className="reactionPickerWrap">
                <button
                  type="button"
                  className="reactLauncher"
                  aria-label="Add reaction"
                  title="Add reaction"
                  onClick={() => setShowReactionPicker((prev) => !prev)}
                >
                  🙂 ➕
                </button>
                {showReactionPicker ? (
                  <div className="reactionPicker">
                    {REACTION_OPTIONS.map((option) => (
                      <button
                        key={option.emoji}
                        type="button"
                        className="reactionOption"
                        title={option.label}
                        onClick={() => {
                          onReact(message.id, option.emoji);
                          setShowReactionPicker(false);
                        }}
                      >
                        <ReactionGlyph symbol={option.emoji} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
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
                  <div className="replyBodyRow">
                    <MarkdownText content={reply.body} className="replyBodyText markdownContent" />
                    <CopyButton text={reply.body} ariaLabel="Copy thread reply text" />
                  </div>
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
  roleByUserId,
  onReact,
  onReply
}: {
  messages: Message[];
  isReadOnly: boolean;
  currentUserId: string;
  roleByUserId: Map<string, Role>;
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
          roleByUserId={roleByUserId}
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
  const { user, signOutUser } = useAuth();
  const {
    state,
    currentUser,
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
  }, [selectedTurnId]);

  const activeChannelId = useMemo(() => {
    if (selectedChannelId && channels.some((thread) => thread.id === selectedChannelId)) {
      return selectedChannelId;
    }
    return channels[0]?.id ?? null;
  }, [selectedChannelId, channels]);

  const messages = activeChannelId ? getMessagesForThread(activeChannelId) : [];
  const isReadOnlyTurn = turn?.status !== "active";
  const roleByUserId = useMemo(() => new Map(state.users.map((user) => [user.id, user.role])), [state.users]);

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
          <p className="muted">Threads are optional under each message. Newspaper text appears as the first post per channel.</p>
        </div>
        <div className="authInfo">
          <p>
            <strong>{currentUser.displayName}</strong> ({currentUser.role})
          </p>
          <small className="muted">{user?.email}</small>
          <button type="button" className="secondaryButton" onClick={() => void signOutUser()}>
            Sign Out
          </button>
        </div>
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
                    Turn {turn.number} - {formatInWorldDate(turn.inWorldDate)}
                  </h2>
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
                  roleByUserId={roleByUserId}
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
