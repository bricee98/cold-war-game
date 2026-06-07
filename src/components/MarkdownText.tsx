"use client";

import type { CSSProperties } from "react";

type TableAlignment = "left" | "center" | "right" | undefined;

interface TableBlock {
  alignments: TableAlignment[];
  headers: string[];
  rows: string[][];
}

interface Block {
  type: "heading" | "paragraph" | "blockquote" | "ul" | "ol" | "code" | "table";
  level?: number;
  text?: string;
  items?: string[];
  code?: string;
  table?: TableBlock;
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
    isTableStart(line) ||
    line.trim().startsWith("```")
  );
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";

  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    const next = trimmed[i + 1];

    if (char === "\\" && next === "|") {
      current += "|";
      i += 1;
      continue;
    }

    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function getTableAlignments(line: string): TableAlignment[] | null {
  if (!line.includes("|")) {
    return null;
  }

  const cells = splitTableRow(line);
  if (!cells.length) {
    return null;
  }

  const alignments = cells.map((cell) => {
    if (!/^:?-{3,}:?$/.test(cell.replace(/\s+/g, ""))) {
      return null;
    }

    const normalized = cell.replace(/\s+/g, "");
    if (normalized.startsWith(":") && normalized.endsWith(":")) {
      return "center";
    }
    if (normalized.endsWith(":")) {
      return "right";
    }
    if (normalized.startsWith(":")) {
      return "left";
    }
    return undefined;
  });

  if (alignments.some((alignment) => alignment === null)) {
    return null;
  }

  return alignments as TableAlignment[];
}

function isTableStart(line: string, nextLine?: string): boolean {
  return line.includes("|") && Boolean(nextLine && getTableAlignments(nextLine));
}

function getAlignmentStyle(alignment: TableAlignment): CSSProperties | undefined {
  if (!alignment) {
    return undefined;
  }

  return { textAlign: alignment };
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

    if (isTableStart(line, lines[i + 1])) {
      const headers = splitTableRow(line);
      const alignments = getTableAlignments(lines[i + 1]) ?? [];
      const rows: string[][] = [];
      i += 2;

      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }

      blocks.push({
        type: "table",
        table: {
          alignments,
          headers,
          rows
        }
      });
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

        if (block.type === "table") {
          const table = block.table;
          if (!table) {
            return null;
          }

          return (
            <div className="markdownTableWrap" key={`table-${index}`}>
              <table>
                <thead>
                  <tr>
                    {table.headers.map((header, headerIndex) => (
                      <th
                        key={`th-${index}-${headerIndex}`}
                        style={getAlignmentStyle(table.alignments[headerIndex])}
                        dangerouslySetInnerHTML={{ __html: renderInline(header) }}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, rowIndex) => (
                    <tr key={`tr-${index}-${rowIndex}`}>
                      {table.headers.map((_, cellIndex) => (
                        <td
                          key={`td-${index}-${rowIndex}-${cellIndex}`}
                          style={getAlignmentStyle(table.alignments[cellIndex])}
                          dangerouslySetInnerHTML={{ __html: renderInline(row[cellIndex] ?? "") }}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
