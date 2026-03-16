import { NextResponse } from "next/server";

type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

function parseReasoningEffort(value: string | undefined): ReasoningEffort {
  if (!value) {
    return "high";
  }
  const lowered = value.trim().toLowerCase();
  if (lowered === "none" || lowered === "low" || lowered === "medium" || lowered === "high" || lowered === "xhigh") {
    return lowered;
  }
  return "high";
}

function extractReplyText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const outputText = "output_text" in payload ? payload.output_text : null;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText.trim();
  }

  const output = "output" in payload ? payload.output : null;
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = "content" in item ? item.content : null;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const maybeType = "type" in part ? part.type : null;
      const maybeText = "text" in part ? part.text : null;
      if (maybeType === "output_text" && typeof maybeText === "string" && maybeText.trim()) {
        chunks.push(maybeText.trim());
      }
    }
  }

  return chunks.join("\n\n").trim();
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY. Add it to your server environment and restart." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const player =
    "player" in body && body.player && typeof body.player === "object" ? (body.player as Record<string, unknown>) : {};
  const turn = "turn" in body && body.turn && typeof body.turn === "object" ? (body.turn as Record<string, unknown>) : {};
  const playerName = typeof player.displayName === "string" && player.displayName.trim() ? player.displayName : "Player";
  const turnNumber = typeof turn.number === "number" ? turn.number : 0;
  const inWorldDate = typeof turn.inWorldDate === "string" ? turn.inWorldDate : "";

  let contextJson = "";
  try {
    contextJson = JSON.stringify(body, null, 2).slice(0, 22000);
  } catch {
    contextJson = "";
  }

  const model = process.env.OPENAI_SUMMARY_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.4";
  const reasoningEffort = parseReasoningEffort(process.env.OPENAI_REASONING_EFFORT);

  const systemPrompt =
    "You summarize turn outcomes for a strategy game AI memory. Produce a private long-term planning summary for one player based only on provided turn context.";
  const userPrompt = [
    `Create a memory summary for ${playerName} for turn ${turnNumber} (${inWorldDate}).`,
    "Focus on: what the player did, inferred strategy, commitments/promises, leverage, risks, and next-turn priorities.",
    "Return concise markdown with these headings:",
    "## What Happened",
    "## Strategy Read",
    "## Commitments And Constraints",
    "## Priorities For Next Turn",
    "Limit to about 220-320 words.",
    "",
    "TURN_CONTEXT_JSON:",
    contextJson
  ].join("\n");

  const input = [
    {
      role: "system",
      content: [{ type: "input_text", text: systemPrompt }]
    },
    {
      role: "user",
      content: [{ type: "input_text", text: userPrompt }]
    }
  ];

  const payload: Record<string, unknown> = {
    model,
    input,
    max_output_tokens: 700
  };
  const supportsReasoning = model.startsWith("gpt-5") || model.startsWith("o");
  if (supportsReasoning && reasoningEffort !== "none") {
    payload.reasoning = { effort: reasoningEffort };
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch {
    return NextResponse.json({ error: "Failed to reach OpenAI API." }, { status: 502 });
  }

  if (!upstreamResponse.ok) {
    const errorPayload = await upstreamResponse.text();
    const trimmed = errorPayload.slice(0, 260);
    return NextResponse.json(
      {
        error: `OpenAI API error (${upstreamResponse.status}). ${trimmed}`
      },
      { status: 502 }
    );
  }

  let responseJson: unknown;
  try {
    responseJson = await upstreamResponse.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON from OpenAI API." }, { status: 502 });
  }

  const summary = extractReplyText(responseJson);
  if (!summary) {
    return NextResponse.json({ error: "AI returned no summary text." }, { status: 502 });
  }

  return NextResponse.json({ summary, model });
}
