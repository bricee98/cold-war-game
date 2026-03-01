"use client";

interface Block {
  type: "heading" | "paragraph" | "blockquote" | "ul" | "ol" | "code";
  level?: number;
  text?: string;
  items?: string[];
  code?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(raw: string): string {
  const escaped = escapeHtml(raw);
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function isBoundary(line: string): boolean {
  return (
    line.trim() === "" ||
    /^#{1,6}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    line.trim().startsWith("```")
  );
}

function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) {
        i += 1;
      }
      blocks.push({ type: "code", code: codeLines.join("\n") });
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2]
      });
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join("<br />") });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const paragraphLines: string[] = [line.trim()];
    i += 1;
    while (i < lines.length && !isBoundary(lines[i])) {
      paragraphLines.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

export function MarkdownText({ content, className }: { content: string; className?: string }) {
  const blocks = parseBlocks(content);

  return (
    <div className={className ?? "markdownContent"}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const level = Math.min(Math.max(block.level ?? 1, 1), 6);
          const html = { __html: renderInline(block.text ?? "") };
          if (level === 1) {
            return <h1 key={`h-${index}`} dangerouslySetInnerHTML={html} />;
          }
          if (level === 2) {
            return <h2 key={`h-${index}`} dangerouslySetInnerHTML={html} />;
          }
          if (level === 3) {
            return <h3 key={`h-${index}`} dangerouslySetInnerHTML={html} />;
          }
          if (level === 4) {
            return <h4 key={`h-${index}`} dangerouslySetInnerHTML={html} />;
          }
          if (level === 5) {
            return <h5 key={`h-${index}`} dangerouslySetInnerHTML={html} />;
          }
          return <h6 key={`h-${index}`} dangerouslySetInnerHTML={html} />;
        }

        if (block.type === "blockquote") {
          return <blockquote key={`bq-${index}`} dangerouslySetInnerHTML={{ __html: renderInline(block.text ?? "") }} />;
        }

        if (block.type === "ul") {
          return (
            <ul key={`ul-${index}`}>
              {(block.items ?? []).map((item, itemIndex) => (
                <li key={`uli-${index}-${itemIndex}`} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
              ))}
            </ul>
          );
        }

        if (block.type === "ol") {
          return (
            <ol key={`ol-${index}`}>
              {(block.items ?? []).map((item, itemIndex) => (
                <li key={`oli-${index}-${itemIndex}`} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
              ))}
            </ol>
          );
        }

        if (block.type === "code") {
          return (
            <pre key={`pre-${index}`}>
              <code>{block.code ?? ""}</code>
            </pre>
          );
        }

        return <p key={`p-${index}`} dangerouslySetInnerHTML={{ __html: renderInline(block.text ?? "") }} />;
      })}
    </div>
  );
}
