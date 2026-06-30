import type { KnownBlock } from "@slack/bolt";

const SLACK_SECTION_TEXT_LIMIT = 3000;
const SLACK_MESSAGE_BLOCK_LIMIT = 50;
const SLACK_TRUNCATION_NOTICE = "_Reply truncated to fit Slack message limits._";

export type SlackMarkdownMessage = {
  text: string;
  blocks: KnownBlock[];
};

type RenderedPart =
  | { type: "text"; text: string }
  | { type: "divider" };

export function buildSlackMarkdownMessage(markdown: string): SlackMarkdownMessage {
  const fallbackText = normalizeFallbackText(markdown);
  const parts = renderMarkdownParts(markdown);
  const blocks = buildBlocks(parts);

  return {
    text: fallbackText,
    blocks: blocks.length > 0 ? blocks : [buildSectionBlock(fallbackText)]
  };
}

function renderMarkdownParts(markdown: string): RenderedPart[] {
  const parts: RenderedPart[] = [];
  const textBuffer: string[] = [];
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      textBuffer.push(escapeSlackText(line));
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      textBuffer.push(escapeSlackText(line));
      continue;
    }

    if (isHorizontalRule(line)) {
      flushTextBuffer(parts, textBuffer);
      parts.push({ type: "divider" });
      continue;
    }

    textBuffer.push(renderMarkdownLine(line));
  }

  flushTextBuffer(parts, textBuffer);
  return parts;
}

function buildBlocks(parts: RenderedPart[]): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  for (const part of parts) {
    if (part.type === "divider") {
      blocks.push({ type: "divider" });
      continue;
    }

    for (const chunk of splitSectionText(part.text)) {
      if (chunk.trim().length === 0) {
        continue;
      }
      blocks.push(buildSectionBlock(chunk));
    }
  }

  return limitSlackMessageBlocks(blocks);
}

function buildSectionBlock(text: string): KnownBlock {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text
    }
  };
}

function limitSlackMessageBlocks(blocks: KnownBlock[]): KnownBlock[] {
  if (blocks.length <= SLACK_MESSAGE_BLOCK_LIMIT) {
    return blocks;
  }

  return [
    ...blocks.slice(0, SLACK_MESSAGE_BLOCK_LIMIT - 1),
    buildSectionBlock(SLACK_TRUNCATION_NOTICE)
  ];
}

function renderMarkdownLine(line: string): string {
  const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
  if (heading) {
    return `*${renderInlineMarkdown(heading[2])}*`;
  }

  return renderInlineMarkdown(line);
}

function renderInlineMarkdown(line: string): string {
  const segments = line.split(/(`[^`]*`)/g);
  return segments
    .map((segment) => {
      if (segment.startsWith("`") && segment.endsWith("`")) {
        return `\`${escapeSlackText(segment.slice(1, -1))}\``;
      }

      return renderInlineMarkdownSegment(segment);
    })
    .join("");
}

function renderInlineMarkdownSegment(segment: string): string {
  const linkPattern = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let rendered = "";
  let cursor = 0;

  for (const match of segment.matchAll(linkPattern)) {
    const index = match.index ?? 0;
    rendered += renderBoldText(segment.slice(cursor, index));
    const [raw, label, url] = match;
    rendered +=
      isSupportedManualLinkUrl(url)
        ? `<${escapeSlackText(url)}|${escapeSlackText(label.replaceAll("|", "/"))}>`
        : renderBoldText(raw);
    cursor = index + raw.length;
  }

  rendered += renderBoldText(segment.slice(cursor));
  return rendered;
}

function renderBoldText(text: string): string {
  return escapeSlackText(text)
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/__([^_\n]+)__/g, "*$1*");
}

function isSupportedManualLinkUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:)/.test(url) && !/[<>\s|]/.test(url);
}

function isHorizontalRule(line: string): boolean {
  return /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function flushTextBuffer(parts: RenderedPart[], textBuffer: string[]): void {
  if (textBuffer.length === 0) {
    return;
  }

  const text = trimSlackSectionText(textBuffer.join("\n"));
  if (text.length > 0) {
    parts.push({ type: "text", text });
  }
  textBuffer.length = 0;
}

function splitSectionText(text: string): string[] {
  if (text.length <= SLACK_SECTION_TEXT_LIMIT) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > SLACK_SECTION_TEXT_LIMIT) {
    const boundary = findSplitBoundary(remaining, SLACK_SECTION_TEXT_LIMIT);
    const chunk = trimSlackSectionText(remaining.slice(0, boundary));
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(boundary);
  }

  const finalChunk = trimSlackSectionText(remaining);
  if (finalChunk.length > 0) {
    chunks.push(finalChunk);
  }

  return chunks;
}

function findSplitBoundary(text: string, limit: number): number {
  const newlineBoundary = text.lastIndexOf("\n", limit);
  if (newlineBoundary > 0) {
    return newlineBoundary;
  }

  const spaceBoundary = text.lastIndexOf(" ", limit);
  return spaceBoundary > 0 ? spaceBoundary : limit;
}

function normalizeFallbackText(markdown: string): string {
  const escaped = escapeSlackText(markdown).trim();
  return escaped.length > 0 ? escaped : " ";
}

function trimSlackSectionText(text: string): string {
  return text.replace(/^\n+/, "").replace(/\n+$/, "");
}

function escapeSlackText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
