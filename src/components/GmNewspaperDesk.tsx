"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatInWorldDate } from "@/lib/format";
import { useCurrentTurn, useGameStore } from "@/lib/gameStore";

export function GmNewspaperDesk() {
  const router = useRouter();
  const { state, currentUser, publishTurn, generateLatestArchivedTurnSummaries } = useGameStore();
  const currentTurn = useCurrentTurn();

  const [inWorldDate, setInWorldDate] = useState(currentTurn?.inWorldDate ?? "");
  const [whatPublicWouldntKnow, setWhatPublicWouldntKnow] = useState(currentTurn?.whatPublicWouldntKnow ?? "");
  const [body, setBody] = useState("");
  const [isGeneratingSummaries, setIsGeneratingSummaries] = useState(false);
  const [summaryStatus, setSummaryStatus] = useState<string | null>(null);

  useEffect(() => {
    if (currentTurn) {
      setInWorldDate(currentTurn.inWorldDate);
      setWhatPublicWouldntKnow(currentTurn.whatPublicWouldntKnow ?? "");
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
      body: body.trim(),
      whatPublicWouldntKnow: whatPublicWouldntKnow.trim()
    });

    setBody("");
    setWhatPublicWouldntKnow("");
  };

  const onGenerateLastTurnSummaries = async () => {
    if (isGeneratingSummaries) {
      return;
    }
    setSummaryStatus(null);
    setIsGeneratingSummaries(true);
    try {
      const result = await generateLatestArchivedTurnSummaries();
      if (!result.ok) {
        setSummaryStatus(result.reason);
        return;
      }
      setSummaryStatus(result.reason ?? "Summaries generated for the latest archived turn.");
    } finally {
      setIsGeneratingSummaries(false);
    }
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
              WHAT THE PUBLIC WOULDN&apos;T KNOW
              <textarea
                value={whatPublicWouldntKnow}
                onChange={(event) => setWhatPublicWouldntKnow(event.target.value)}
                rows={4}
                placeholder="GM-only context for this newspaper"
              />
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
              <button type="button" className="secondaryButton" onClick={() => void onGenerateLastTurnSummaries()} disabled={isGeneratingSummaries}>
                {isGeneratingSummaries ? "Generating..." : "Generate Last Turn AI Summaries"}
              </button>
              {summaryStatus ? <p className="muted">{summaryStatus}</p> : null}
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
