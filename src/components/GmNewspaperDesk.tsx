"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatInWorldDate, formatIsoDateTime } from "@/lib/format";
import { useCurrentTurn, useGameStore } from "@/lib/gameStore";

export function GmNewspaperDesk() {
  const { state, currentUser, publishTurn } = useGameStore();
  const currentTurn = useCurrentTurn();

  const [inWorldDate, setInWorldDate] = useState(currentTurn?.inWorldDate ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (currentTurn) {
      setInWorldDate(currentTurn.inWorldDate);
    }
  }, [currentTurn]);

  const recentTurns = useMemo(
    () => [...state.turns].sort((a, b) => b.number - a.number).slice(0, 4),
    [state.turns]
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inWorldDate || !title.trim() || !body.trim()) {
      return;
    }

    publishTurn({
      inWorldDate,
      title: title.trim(),
      body: body.trim()
    });

    setTitle("");
    setBody("");
  };

  if (currentUser.role !== "gm") {
    return (
      <main className="appShell simplePage">
        <section className="panel widePanel">
          <h1>GM Desk</h1>
          <p className="muted">Only the GM can publish newspapers and advance turns.</p>
          <Link href="/" className="navButton">
            Back to Game
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="appShell simplePage">
      <header className="topBar panel widePanel">
        <div>
          <h1>GM Newspaper Desk</h1>
          <p className="muted">Publishing here creates a new turn and locks all prior turns to read-only.</p>
        </div>
        <Link href="/" className="navButton">
          Back to Game
        </Link>
      </header>

      <section className="twoCol">
        <section className="panel">
          <h2>Publish Newspaper</h2>
          <form onSubmit={onSubmit} className="stack">
            <label>
              In-world date
              <input type="date" value={inWorldDate} onChange={(event) => setInWorldDate(event.target.value)} />
            </label>
            <label>
              Headline
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Global Bulletin title"
              />
            </label>
            <label>
              Body
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={8}
                placeholder="What every player receives for this turn"
              />
            </label>
            <button type="submit">Publish & Advance Turn</button>
          </form>
        </section>

        <section className="panel">
          <h2>Current Turn</h2>
          {currentTurn ? (
            <div className="stack compact">
              <p>
                <strong>Turn {currentTurn.number}</strong>
              </p>
              <p>
                <strong>Date:</strong> {formatInWorldDate(currentTurn.inWorldDate)}
              </p>
              <p>
                <strong>Headline:</strong> {currentTurn.newspaperTitle}
              </p>
              <p className="muted">Published {formatIsoDateTime(currentTurn.publishedAt)}</p>
            </div>
          ) : (
            <p className="muted">No active turn.</p>
          )}

          <h3>Recent Turns</h3>
          <div className="turnItems">
            {recentTurns.map((turn) => (
              <div key={turn.id} className="turnCardStatic">
                <strong>Turn {turn.number}</strong>
                <span>{formatInWorldDate(turn.inWorldDate)}</span>
                <small>{turn.status === "active" ? "Active" : "Archived"}</small>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
