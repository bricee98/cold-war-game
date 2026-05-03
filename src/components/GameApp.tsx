"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import packageInfo from "../../package.json";
import { CopyButton } from "@/components/CopyButton";
import { MarkdownText } from "@/components/MarkdownText";
import { useAuth } from "@/lib/auth";
import { formatInWorldDate, formatIsoDateTime, formatShortInWorldDate } from "@/lib/format";
import { useGameStore } from "@/lib/gameStore";
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

const APP_VERSION = packageInfo.version;

interface ReactionBucket {
  emoji: string;
  role: Role;
  count: number;
  currentUserReacted: boolean;
}

interface AIPageContext {
  gameTitle: string;
  viewer: {
    id: string;
    displayName: string;
    role: Role;
  };
  selectedTurn: {
    id: string;
    number: number;
    inWorldDate: string;
    status: Turn["status"];
  } | null;
  visibleTurns: Array<{
    number: number;
    inWorldDate: string;
    status: Turn["status"];
  }>;
  selectedChannel: {
    id: string;
    title: string;
    kind: Thread["kind"];
    participantIds: string[];
  } | null;
  visibleChannels: Array<{
    id: string;
    title: string;
    kind: Thread["kind"];
    participantIds: string[];
  }>;
  selectedChannelMessages: Array<{
    id: string;
    parentMessageId?: string;
    authorId: string;
    authorName: string;
    authorRole: Role;
    createdAt: string;
    body: string;
    channelId: string;
    channelTitle: string;
    channelKind: Thread["kind"];
    channelParticipants: string[];
    reactions: Array<{
      emoji: string;
      userId: string;
      role: Role;
    }>;
  }>;
  currentTurnRecentMessages: Array<{
    id: string;
    parentMessageId?: string;
    authorId: string;
    authorName: string;
    authorRole: Role;
    createdAt: string;
    body: string;
    channelId: string;
    channelTitle: string;
    channelKind: Thread["kind"];
    channelParticipants: string[];
    reactions: Array<{
      emoji: string;
      userId: string;
      role: Role;
    }>;
  }>;
  strategicSummaries: Array<{
    turnId: string;
    turnNumber: number;
    inWorldDate: string;
    summary: string;
  }>;
}

function countUnreadInChannel(messages: Message[], currentUserId: string): number {
  const repliesByParent = new Map<string, Message[]>();
  for (const message of messages) {
    if (!message.parentMessageId) {
      continue;
    }
    const bucket = repliesByParent.get(message.parentMessageId) ?? [];
    bucket.push(message);
    repliesByParent.set(message.parentMessageId, bucket);
  }

  let unreadCount = 0;
  const topLevel = messages.filter((message) => !message.parentMessageId);

  for (const message of topLevel) {
    const replies = (repliesByParent.get(message.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const reactedByCurrentUser = message.reactions.some((reaction) => reaction.userId === currentUserId);
    const repliedByCurrentUser = replies.some((reply) => reply.authorId === currentUserId);
    const messageNeedsAttention = message.authorId !== currentUserId && !reactedByCurrentUser && !repliedByCurrentUser;
    if (messageNeedsAttention) {
      unreadCount += 1;
    }

    for (const reply of replies) {
      const replyReactedByCurrentUser = reply.reactions.some((reaction) => reaction.userId === currentUserId);
      const repliedAfterThisReply = replies.some(
        (entry) => entry.authorId === currentUserId && entry.createdAt > reply.createdAt
      );
      const replyNeedsAttention =
        reply.authorId !== currentUserId && !replyReactedByCurrentUser && !repliedAfterThisReply;
      if (replyNeedsAttention) {
        unreadCount += 1;
      }
    }
  }

  return unreadCount;
}

function buildReactionBuckets(
  message: Message,
  currentUserId: string,
  roleByUserId: Map<string, Role>
): ReactionBucket[] {
  const buckets = new Map<string, ReactionBucket>();

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
}

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

function compactForAI(value: string, maxLength = 560): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function TrashGlyph() {
  return (
    <svg
      className="iconGlyph"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
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
      <p className="versionBadge">v{APP_VERSION}</p>
    </aside>
  );
}

function ChannelControl({
  channels,
  selectedChannelId,
  onSelectChannel,
  isReadOnlyTurn,
  unreadByChannel
}: {
  channels: Thread[];
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  isReadOnlyTurn: boolean;
  unreadByChannel: Map<string, number>;
}) {
  const hasUnread = Array.from(unreadByChannel.values()).some((count) => count > 0);

  return (
    <section className="panel controlPanel">
      <div className="controlStrip single">
        <select
          aria-label="Channel picker"
          className={hasUnread ? "hasUnread" : ""}
          value={selectedChannelId ?? ""}
          onChange={(event) => onSelectChannel(event.target.value)}
          disabled={!channels.length}
        >
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.title}
              {(unreadByChannel.get(channel.id) ?? 0) > 0 ? ` (${unreadByChannel.get(channel.id)})` : ""}
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
  onEdit,
  onReact,
  onReply,
  onDelete
}: {
  message: Message;
  replies: Message[];
  isReadOnly: boolean;
  currentUserId: string;
  roleByUserId: Map<string, Role>;
  onEdit: (messageId: string, body: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (parentMessageId: string, body: string) => void;
  onDelete: (messageId: string) => void;
}) {
  const [showThread, setShowThread] = useState(replies.length > 0);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [openReplyPickerId, setOpenReplyPickerId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const seenReplyIdsRef = useRef(new Set(replies.map((reply) => reply.id)));

  const reactionBuckets = useMemo(
    () => buildReactionBuckets(message, currentUserId, roleByUserId),
    [currentUserId, message, roleByUserId]
  );

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

  useEffect(() => {
    const seenReplyIds = seenReplyIdsRef.current;
    const hasNewReply = replies.some((reply) => !seenReplyIds.has(reply.id));
    if (hasNewReply) {
      setShowThread(true);
    }

    seenReplyIds.clear();
    for (const reply of replies) {
      seenReplyIds.add(reply.id);
    }
  }, [replies]);

  const reactedByCurrentUser = message.reactions.some((reaction) => reaction.userId === currentUserId);
  const repliedByCurrentUser = replies.some((reply) => reply.authorId === currentUserId);
  const messageNeedsAttention = message.authorId !== currentUserId && !reactedByCurrentUser && !repliedByCurrentUser;

  const onReplyKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!event.shiftKey && event.key === "Enter") {
      event.preventDefault();
      const trimmed = replyDraft.trim();
      if (!trimmed || isReadOnly) {
        return;
      }
      onReply(message.id, trimmed);
      setReplyDraft("");
      setShowThread(true);
    }
  };

  const confirmDelete = (messageId: string, label: string) => {
    if (isReadOnly) {
      return;
    }
    if (!window.confirm(`Delete this ${label}?`)) {
      return;
    }
    onDelete(messageId);
  };

  const beginEditing = (entry: Message) => {
    if (isReadOnly || entry.authorId !== currentUserId) {
      return;
    }
    setEditingMessageId(entry.id);
    setEditDraft(entry.body);
    if (entry.parentMessageId) {
      setShowThread(true);
    }
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditDraft("");
  };

  const submitEdit = (messageId: string) => {
    const trimmed = editDraft.trim();
    if (!trimmed || isReadOnly) {
      return;
    }
    onEdit(messageId, trimmed);
    setEditingMessageId(null);
    setEditDraft("");
  };

  const onEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, targetId: string) => {
    if (!event.shiftKey && event.key === "Enter") {
      event.preventDefault();
      submitEdit(targetId);
    }
  };

  const getTimestampLabel = (entry: Message) =>
    `${formatIsoDateTime(entry.createdAt)}${entry.editedAt ? " · edited" : ""}`;

  return (
    <article
      key={message.id}
      className={`${message.authorId === currentUserId ? "message mine" : "message"}${
        messageNeedsAttention ? " needsAttention" : ""
      }`}
    >
      <div className="messageBodyRow">
        {editingMessageId === message.id ? (
          <div className="inlineEdit">
            <textarea
              value={editDraft}
              onChange={(event) => setEditDraft(event.target.value)}
              onKeyDown={(event) => onEditKeyDown(event, message.id)}
              rows={3}
              autoFocus
            />
            <div className="inlineEditActions">
              <button type="button" onClick={() => submitEdit(message.id)} disabled={!editDraft.trim()}>
                Save
              </button>
              <button type="button" className="secondaryButton" onClick={cancelEditing}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <MarkdownText content={message.body} className="messageBodyText markdownContent" />
            <CopyButton text={message.body} ariaLabel="Copy message text" />
          </>
        )}
      </div>
      <footer>
        <small>{getTimestampLabel(message)}</small>
        <div className="messageActions">
          <button type="button" className="threadToggle" onClick={() => setShowThread((prev) => !prev)}>
            {replies.length ? `↩ (${replies.length})` : "↩"}
          </button>
          {message.authorId === currentUserId && !isReadOnly ? (
            <button
              type="button"
              className="threadToggle editToggle"
              onClick={() => beginEditing(message)}
              aria-label="Edit message"
              title="Edit message"
            >
              Edit
            </button>
          ) : null}
          {message.authorId === currentUserId && !isReadOnly ? (
            <button
              type="button"
              className="threadToggle deleteToggle"
              onClick={() => confirmDelete(message.id, "message")}
              aria-label="Delete message"
              title="Delete message"
            >
              <TrashGlyph />
            </button>
          ) : null}
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
                (() => {
                  const replyReactionBuckets = buildReactionBuckets(reply, currentUserId, roleByUserId);
                  const repliedAfterThisReply = replies.some(
                    (entry) => entry.authorId === currentUserId && entry.createdAt > reply.createdAt
                  );
                  const replyNeedsAttention =
                    reply.authorId !== currentUserId &&
                    !reply.reactions.some((reaction) => reaction.userId === currentUserId) &&
                    !repliedAfterThisReply;

                  return (
                    <div
                      key={reply.id}
                      className={`${reply.authorId === currentUserId ? "replyMessage mine" : "replyMessage"}${
                        replyNeedsAttention ? " needsAttention" : ""
                      }`}
                    >
                      <div className="replyBodyRow">
                        {editingMessageId === reply.id ? (
                          <div className="inlineEdit">
                            <textarea
                              value={editDraft}
                              onChange={(event) => setEditDraft(event.target.value)}
                              onKeyDown={(event) => onEditKeyDown(event, reply.id)}
                              rows={2}
                              autoFocus
                            />
                            <div className="inlineEditActions">
                              <button type="button" onClick={() => submitEdit(reply.id)} disabled={!editDraft.trim()}>
                                Save
                              </button>
                              <button type="button" className="secondaryButton" onClick={cancelEditing}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <MarkdownText content={reply.body} className="replyBodyText markdownContent" />
                            <CopyButton text={reply.body} ariaLabel="Copy thread reply text" />
                          </>
                        )}
                      </div>
                      <footer className="replyFooter">
                        <small>{getTimestampLabel(reply)}</small>
                        <div className="messageActions">
                          {reply.authorId === currentUserId && !isReadOnly ? (
                            <button
                              type="button"
                              className="threadToggle editToggle"
                              onClick={() => beginEditing(reply)}
                              aria-label="Edit reply"
                              title="Edit reply"
                            >
                              Edit
                            </button>
                          ) : null}
                          {reply.authorId === currentUserId && !isReadOnly ? (
                            <button
                              type="button"
                              className="threadToggle deleteToggle"
                              onClick={() => confirmDelete(reply.id, "reply")}
                              aria-label="Delete reply"
                              title="Delete reply"
                            >
                              <TrashGlyph />
                            </button>
                          ) : null}
                          <div className="reactionArea">
                            <div className="reactionTray">
                              {replyReactionBuckets.map((bucket) => (
                                <button
                                  key={`${reply.id}-${bucket.emoji}-${bucket.role}`}
                                  type="button"
                                  className={`reactionPill ${bucket.role}${bucket.currentUserReacted ? " active" : ""}`}
                                  onClick={() => !isReadOnly && onReact(reply.id, bucket.emoji)}
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
                                  aria-label="Add reaction to reply"
                                  title="Add reaction to reply"
                                  onClick={() =>
                                    setOpenReplyPickerId((prev) => (prev === reply.id ? null : reply.id))
                                  }
                                >
                                  🙂 ➕
                                </button>
                                {openReplyPickerId === reply.id ? (
                                  <div className="reactionPicker">
                                    {REACTION_OPTIONS.map((option) => (
                                      <button
                                        key={`${reply.id}-${option.emoji}`}
                                        type="button"
                                        className="reactionOption"
                                        title={option.label}
                                        onClick={() => {
                                          onReact(reply.id, option.emoji);
                                          setOpenReplyPickerId(null);
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
                    </div>
                  );
                })()
              ))}
            </div>
          ) : (
            <p className="muted">No replies yet.</p>
          )}

          <form className="compose replyCompose" onSubmit={submitReply}>
            <textarea
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.target.value)}
              onKeyDown={onReplyKeyDown}
              rows={2}
              placeholder={
                isReadOnly ? "Past turn is read-only" : "Reply in thread (Enter = send, Shift+Enter = newline)"
              }
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
  onEdit,
  onReact,
  onReply,
  onDelete
}: {
  messages: Message[];
  isReadOnly: boolean;
  currentUserId: string;
  roleByUserId: Map<string, Role>;
  onEdit: (messageId: string, body: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (parentMessageId: string, body: string) => void;
  onDelete: (messageId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [offscreenNeedsAttention, setOffscreenNeedsAttention] = useState({ above: 0, below: 0 });

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

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    let frame = 0;
    const recalc = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(() => {
        const bounds = container.getBoundingClientRect();
        const highlightNodes = container.querySelectorAll<HTMLElement>(".message.needsAttention, .replyMessage.needsAttention");
        let above = 0;
        let below = 0;
        highlightNodes.forEach((node) => {
          const rect = node.getBoundingClientRect();
          if (rect.bottom < bounds.top) {
            above += 1;
          } else if (rect.top > bounds.bottom) {
            below += 1;
          }
        });
        setOffscreenNeedsAttention((prev) =>
          prev.above === above && prev.below === below ? prev : { above, below }
        );
      });
    };

    recalc();
    container.addEventListener("scroll", recalc, { passive: true });
    window.addEventListener("resize", recalc);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      container.removeEventListener("scroll", recalc);
      window.removeEventListener("resize", recalc);
    };
  }, [messages]);

  const scrollToNearestNeedsAttention = (direction: "above" | "below") => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const bounds = container.getBoundingClientRect();
    const highlightNodes = Array.from(
      container.querySelectorAll<HTMLElement>(".message.needsAttention, .replyMessage.needsAttention")
    );

    let target: HTMLElement | null = null;
    if (direction === "above") {
      let bestBottom = Number.NEGATIVE_INFINITY;
      for (const node of highlightNodes) {
        const rect = node.getBoundingClientRect();
        if (rect.bottom < bounds.top && rect.bottom > bestBottom) {
          bestBottom = rect.bottom;
          target = node;
        }
      }
    } else {
      let bestTop = Number.POSITIVE_INFINITY;
      for (const node of highlightNodes) {
        const rect = node.getBoundingClientRect();
        if (rect.top > bounds.bottom && rect.top < bestTop) {
          bestTop = rect.top;
          target = node;
        }
      }
    }

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className="messageFeedWrap">
      {offscreenNeedsAttention.above > 0 ? (
        <button
          type="button"
          className="offscreenToast top"
          onClick={() => scrollToNearestNeedsAttention("above")}
          aria-label={`Jump to ${offscreenNeedsAttention.above} new messages above`}
        >
          ↑ {offscreenNeedsAttention.above} new message{offscreenNeedsAttention.above === 1 ? "" : "s"}
        </button>
      ) : null}

      <div className="messages" ref={scrollRef}>
        {topLevel.map((message) => (
          <MessageCard
            key={message.id}
            message={message}
            replies={repliesByParent.get(message.id) ?? []}
            isReadOnly={isReadOnly}
            currentUserId={currentUserId}
            roleByUserId={roleByUserId}
            onEdit={onEdit}
            onReact={onReact}
            onReply={onReply}
            onDelete={onDelete}
          />
        ))}
        {!topLevel.length ? <p className="muted">No messages yet in this channel.</p> : null}
      </div>

      {offscreenNeedsAttention.below > 0 ? (
        <button
          type="button"
          className="offscreenToast bottom"
          onClick={() => scrollToNearestNeedsAttention("below")}
          aria-label={`Jump to ${offscreenNeedsAttention.below} new messages below`}
        >
          {offscreenNeedsAttention.below} new message{offscreenNeedsAttention.below === 1 ? "" : "s"} ↓
        </button>
      ) : null}
    </div>
  );
}

function AIPrivatePanel({ userId, pageContext }: { userId: string; pageContext: AIPageContext }) {
  const { state, addAIMessage } = useGameStore();
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const aiMessagesRef = useRef<HTMLDivElement | null>(null);
  const aiBottomRef = useRef<HTMLDivElement | null>(null);

  const aiMessages = state.aiMessages.filter((msg) => msg.userId === userId);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      aiBottomRef.current?.scrollIntoView({ block: "end" });
      const container = aiMessagesRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [aiMessages.length, isThinking, isOpen]);

  const submitAIMessage = async () => {
    const trimmed = draft.trim();
    if (!trimmed || isThinking) {
      return;
    }

    const history = aiMessages.slice(-12).map((msg) => ({
      role: msg.role,
      body: msg.body
    }));

    addAIMessage(userId, "user", trimmed);
    setDraft("");
    setRequestError(null);
    setIsThinking(true);

    try {
      const response = await fetch("/api/ai/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: trimmed,
          history,
          pageContext
        })
      });

      const payload = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok || !payload.reply) {
        throw new Error(payload.error ?? "AI request failed.");
      }

      addAIMessage(userId, "assistant", payload.reply);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI request failed.";
      setRequestError(message);
      addAIMessage(userId, "assistant", `AI unavailable: ${message}`);
    } finally {
      setIsThinking(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitAIMessage();
  };

  const onAIKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!event.shiftKey && event.key === "Enter") {
      event.preventDefault();
      void submitAIMessage();
    }
  };

  return (
    <details className="panel aiPanel" onToggle={(event) => setIsOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary>Private AI Assistant</summary>
      <p className="muted">Only visible to this player. GM cannot view this panel.</p>
      <div className="aiMessages" ref={aiMessagesRef}>
        {aiMessages.map((msg) => (
          <div key={msg.id} className={msg.role === "assistant" ? "aiMessage assistant" : "aiMessage user"}>
            <strong>{msg.role === "assistant" ? "AI" : "You"}</strong>
            <MarkdownText content={msg.body} className="markdownContent" />
          </div>
        ))}
        {isThinking ? (
          <div className="aiMessage assistant pending" aria-live="polite">
            <strong>AI</strong>
            <p className="thinkingLine">
              Thinking
              <span className="thinkingDots" aria-hidden="true">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </p>
          </div>
        ) : null}
        <div ref={aiBottomRef} />
      </div>
      {requestError ? <p className="muted">Last AI error: {requestError}</p> : null}
      <form onSubmit={onSubmit} className="compose aiCompose">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onAIKeyDown}
          rows={2}
          placeholder="Ask your private strategy question (Enter = send, Shift+Enter = newline)"
        />
        <button type="submit" disabled={!draft.trim() || isThinking}>
          Send
        </button>
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
    editMessage,
    addReaction,
    deleteMessage,
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

  const messages = useMemo(
    () => (activeChannelId ? getMessagesForThread(activeChannelId) : []),
    [activeChannelId, getMessagesForThread]
  );
  const unreadByChannel = useMemo(() => {
    const map = new Map<string, number>();
    for (const channel of channels) {
      const channelMessages = getMessagesForThread(channel.id);
      map.set(channel.id, countUnreadInChannel(channelMessages, currentUser.id));
    }
    return map;
  }, [channels, currentUser.id, getMessagesForThread]);

  const isReadOnlyTurn = turn?.status !== "active";
  const roleByUserId = useMemo(() => new Map(state.users.map((user) => [user.id, user.role])), [state.users]);
  const userById = useMemo(() => new Map(state.users.map((entry) => [entry.id, entry])), [state.users]);
  const channelById = useMemo(() => new Map(channels.map((entry) => [entry.id, entry])), [channels]);
  const channelIdSet = useMemo(() => new Set(channels.map((entry) => entry.id)), [channels]);

  const aiPageContext = useMemo<AIPageContext>(
    () => ({
      gameTitle: state.game.title,
      viewer: {
        id: currentUser.id,
        displayName: currentUser.displayName,
        role: currentUser.role
      },
      selectedTurn: turn
        ? {
            id: turn.id,
            number: turn.number,
            inWorldDate: turn.inWorldDate,
            status: turn.status
          }
        : null,
      visibleTurns: state.turns
        .slice()
        .sort((a, b) => a.number - b.number)
        .map((entry) => ({
          number: entry.number,
          inWorldDate: entry.inWorldDate,
          status: entry.status
        })),
      selectedChannel:
        channels.find((entry) => entry.id === activeChannelId) ?? (channels.length ? channels[0] : null),
      visibleChannels: channels.map((entry) => ({
        id: entry.id,
        title: entry.title,
        kind: entry.kind,
        participantIds: entry.participantIds
      })),
      selectedChannelMessages: messages.slice(-64).map((entry) => {
        const author = userById.get(entry.authorId);
        const channel = channelById.get(entry.threadId);
        return {
          id: entry.id,
          parentMessageId: entry.parentMessageId,
          authorId: entry.authorId,
          authorName: author?.displayName ?? entry.authorId,
          authorRole: author?.role ?? "player",
          createdAt: entry.createdAt,
          body: compactForAI(entry.body, 700),
          channelId: channel?.id ?? entry.threadId,
          channelTitle: channel?.title ?? entry.threadId,
          channelKind: channel?.kind ?? "gm_player",
          channelParticipants: channel?.participantIds ?? [],
          reactions: entry.reactions.map((reaction) => ({
            emoji: reaction.emoji,
            userId: reaction.userId,
            role: roleByUserId.get(reaction.userId) ?? "player"
          }))
        };
      }),
      currentTurnRecentMessages: state.messages
        .filter((entry) => channelIdSet.has(entry.threadId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 140)
        .map((entry) => {
          const author = userById.get(entry.authorId);
          const channel = channelById.get(entry.threadId);
          return {
            id: entry.id,
            parentMessageId: entry.parentMessageId,
            authorId: entry.authorId,
            authorName: author?.displayName ?? entry.authorId,
            authorRole: author?.role ?? "player",
            createdAt: entry.createdAt,
            body: compactForAI(entry.body, 420),
            channelId: channel?.id ?? entry.threadId,
            channelTitle: channel?.title ?? entry.threadId,
            channelKind: channel?.kind ?? "gm_player",
            channelParticipants: channel?.participantIds ?? [],
            reactions: entry.reactions.map((reaction) => ({
              emoji: reaction.emoji,
              userId: reaction.userId,
              role: roleByUserId.get(reaction.userId) ?? "player"
            }))
          };
        }),
      strategicSummaries: state.aiTurnSummaries
        .slice()
        .sort((a, b) => b.turnNumber - a.turnNumber)
        .slice(0, 12)
        .map((entry) => ({
          turnId: entry.turnId,
          turnNumber: entry.turnNumber,
          inWorldDate: entry.inWorldDate,
          summary: entry.summary
        }))
    }),
    [
      activeChannelId,
      channelById,
      channelIdSet,
      channels,
      currentUser.displayName,
      currentUser.id,
      currentUser.role,
      messages,
      roleByUserId,
      state.aiTurnSummaries,
      state.game.title,
      state.messages,
      state.turns,
      turn,
      userById
    ]
  );

  const [draft, setDraft] = useState("");

  const submitTopLevelMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeChannelId) {
      return;
    }
    addMessage(activeChannelId, currentUser.id, draft);
    setDraft("");
  };

  const onTopLevelKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!event.shiftKey && event.key === "Enter") {
      event.preventDefault();
      if (!activeChannelId) {
        return;
      }
      const trimmed = draft.trim();
      if (!trimmed || isReadOnlyTurn) {
        return;
      }
      addMessage(activeChannelId, currentUser.id, trimmed);
      setDraft("");
    }
  };

  const replyInThread = (parentMessageId: string, body: string) => {
    if (!activeChannelId) {
      return;
    }
    addMessage(activeChannelId, currentUser.id, body, parentMessageId);
  };

  const deleteOwnMessage = (messageId: string) => {
    const result = deleteMessage(messageId, currentUser.id);
    if (!result.ok) {
      window.alert(result.reason);
    }
  };

  const editOwnMessage = (messageId: string, body: string) => {
    const result = editMessage(messageId, currentUser.id, body);
    if (!result.ok) {
      window.alert(result.reason);
    }
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
                  unreadByChannel={unreadByChannel}
                />

                <MessageFeed
                  messages={messages}
                  isReadOnly={isReadOnlyTurn}
                  roleByUserId={roleByUserId}
                  onEdit={editOwnMessage}
                  onReact={(messageId, emoji) => addReaction(messageId, currentUser.id, emoji)}
                  onReply={replyInThread}
                  onDelete={deleteOwnMessage}
                  currentUserId={currentUser.id}
                />

                <form onSubmit={submitTopLevelMessage} className="compose">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={onTopLevelKeyDown}
                    rows={3}
                    placeholder={
                      isReadOnlyTurn
                        ? "Past turn is read-only"
                        : "Type a message (Enter = send, Shift+Enter = newline)"
                    }
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

          {currentUser.role === "player" ? <AIPrivatePanel userId={currentUser.id} pageContext={aiPageContext} /> : null}
        </section>
      </section>
    </main>
  );
}
