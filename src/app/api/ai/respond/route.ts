import { NextResponse } from "next/server";

interface AIHistoryItem {
  role: "user" | "assistant";
  body: string;
}

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

function parsePageContext(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  try {
    const json = JSON.stringify(value, null, 2);
    return json.slice(0, 16000);
  } catch {
    return "";
  }
}

function parseHistory(value: unknown): AIHistoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const maybeRole = "role" in entry ? entry.role : null;
      const maybeBody = "body" in entry ? entry.body : null;
      if ((maybeRole !== "user" && maybeRole !== "assistant") || typeof maybeBody !== "string") {
        return null;
      }
      const cleanedBody = maybeBody.trim().slice(0, 4000);
      if (!cleanedBody) {
        return null;
      }
      return {
        role: maybeRole,
        body: cleanedBody
      };
    })
    .filter((entry): entry is AIHistoryItem => Boolean(entry))
    .slice(-12);
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

  const maybePrompt = "prompt" in body ? body.prompt : null;
  const prompt = typeof maybePrompt === "string" ? maybePrompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const maybeHistory = "history" in body ? body.history : null;
  const maybePageContext = "pageContext" in body ? body.pageContext : null;
  const history = parseHistory(maybeHistory);
  const pageContext = parsePageContext(maybePageContext);
  const model = process.env.OPENAI_MODEL ?? "gpt-5.4";
  const reasoningEffort = parseReasoningEffort(process.env.OPENAI_REASONING_EFFORT);

  const systemPrompt =
    "You are a private Cold War roleplay strategy assistant. Keep replies concise, actionable, and in-world when relevant. Do not reveal hidden information. Use PAGE_CONTEXT as the source of truth for what the player can currently see.";

  const input = [
    {
      role: "system",
      content: [{ type: "input_text", text: systemPrompt }]
    },
    ...(pageContext
      ? [
          {
            role: "user" as const,
            content: [
              {
                type: "input_text" as const,
                text: `PAGE_CONTEXT (visible UI state, JSON):\n${pageContext}`
              }
            ]
          }
        ]
      : []),
    ...history.map((item) =>
      item.role === "assistant"
        ? {
            role: "assistant",
            content: [{ type: "output_text", text: item.body }]
          }
        : {
            role: "user",
            content: [{ type: "input_text", text: item.body }]
          }
    ),
    {
      role: "user",
      content: [{ type: "input_text", text: prompt }]
    }
  ];

  let upstreamResponse: Response;
  const payload: Record<string, unknown> = {
    model,
    input,
    max_output_tokens: 600
  };
  const supportsReasoning = model.startsWith("gpt-5") || model.startsWith("o");
  if (supportsReasoning && reasoningEffort !== "none") {
    payload.reasoning = { effort: reasoningEffort };
  }

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
    const trimmed = errorPayload.slice(0, 200);
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

  const reply = extractReplyText(responseJson);
  if (!reply) {
    return NextResponse.json({ error: "AI returned no text response." }, { status: 502 });
  }

  return NextResponse.json({ reply });
}
