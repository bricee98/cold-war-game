export type Role = "gm" | "player";

export interface User {
  id: string;
  displayName: string;
  role: Role;
}

export interface Game {
  id: string;
  title: string;
  activeTurnId: string;
}

export interface Turn {
  id: string;
  gameId: string;
  number: number;
  inWorldDate: string;
  newspaperTitle: string;
  newspaperBody: string;
  publishedAt: string;
  status: "active" | "archived";
}

export type ThreadKind = "gm_player" | "player_player";

export interface Thread {
  id: string;
  gameId: string;
  turnId: string;
  kind: ThreadKind;
  participantIds: string[];
  title: string;
  createdAt: string;
}

export interface Reaction {
  emoji: string;
  userId: string;
}

export interface Message {
  id: string;
  threadId: string;
  parentMessageId?: string;
  authorId: string;
  body: string;
  createdAt: string;
  reactions: Reaction[];
}

export interface AIMessage {
  id: string;
  userId: string;
  role: "user" | "assistant";
  body: string;
  createdAt: string;
}

export interface GameState {
  game: Game;
  users: User[];
  turns: Turn[];
  threads: Thread[];
  messages: Message[];
  aiMessages: AIMessage[];
}
