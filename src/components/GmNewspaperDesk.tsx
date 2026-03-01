"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatInWorldDate } from "@/lib/format";
import { useCurrentTurn, useGameStore } from "@/lib/gameStore";

export function GmNewspaperDesk() {
  const router = useRouter();
  const { state, currentUser, publishTurn } = useGameStore();
  const currentTurn = useCurrentTurn();

  const [inWorldDate, setInWorldDate] = useState(currentTurn?.inWorldDate ?? "");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (currentTurn) {
      setInWorldDate(currentTurn.inWorldDate);
    }
  }, [currentTurn]);

  useEffect(() => {
    if (currentUser.role !== "gm") {
      router.replace("/");
    }
  }, [currentUser.role, router]);

  const recentTurns = useMemo(
    () => [...state.turns].sort((a, b) => b.number - a.number).slice(0, 4),
    [state.turns]
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inWorldDate || !body.trim()) {
      return;
    }

    publishTurn({
      inWorldDate,
      body: body.trim()
    });

    setBody("");
  };

  if (currentUser.role !== "gm") {
    return null;
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
              Body
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={8}
                placeholder="What every player receives for this turn (Markdown supported)"
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
                <strong>
                  Turn {currentTurn.number} - {formatInWorldDate(currentTurn.inWorldDate)}
                </strong>
              </p>
              <div className="newspaperBodyRow">
                <p className="muted">Newspaper text is inserted as the first message in each new GM ↔ player channel.</p>
              </div>
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
