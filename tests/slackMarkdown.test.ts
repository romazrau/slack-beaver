import { describe, expect, it } from "vitest";
import type { KnownBlock } from "@slack/bolt";
import { buildSlackMarkdownMessage } from "../src/slack/slackMarkdown.js";

describe("buildSlackMarkdownMessage", () => {
  it("renders markdown headings as Slack bold lines", () => {
    const message = buildSlackMarkdownMessage("## 標題\n內容");

    expect(sectionTexts(message.blocks).join("\n")).toContain("*標題*");
    expect(sectionTexts(message.blocks).join("\n")).not.toContain("## 標題");
    expect(message.text).toContain("## 標題");
  });

  it("converts markdown bold while preserving inline code", () => {
    const message = buildSlackMarkdownMessage("Use **bold** but keep `**literal**`.");

    expect(sectionTexts(message.blocks).join("\n")).toBe("Use *bold* but keep `**literal**`.");
  });

  it("preserves fenced code block content without markdown conversion", () => {
    const message = buildSlackMarkdownMessage(["```ts", "const x = '**raw** <tag>';", "```"].join("\n"));

    const text = sectionTexts(message.blocks).join("\n");
    expect(text).toContain("```ts");
    expect(text).toContain("**raw** &lt;tag&gt;");
    expect(text).not.toContain("const x = '*raw*");
  });

  it("renders supported markdown links as Slack manual links and escapes unsafe text", () => {
    const message = buildSlackMarkdownMessage("See [docs <safe>](https://example.com?a=1&b=2) and <tag>.");

    expect(sectionTexts(message.blocks).join("\n")).toBe(
      "See <https://example.com?a=1&amp;b=2|docs &lt;safe&gt;> and &lt;tag&gt;."
    );
  });

  it("keeps unsupported markdown links as escaped readable text", () => {
    const message = buildSlackMarkdownMessage("See [local](file:///tmp/readme.md).");

    expect(sectionTexts(message.blocks).join("\n")).toBe("See [local](file:///tmp/readme.md).");
  });

  it("splits long section text within Slack's 3000 character limit", () => {
    const message = buildSlackMarkdownMessage("a".repeat(6100));
    const texts = sectionTexts(message.blocks);

    expect(texts).toHaveLength(3);
    expect(texts.every((text) => text.length > 0)).toBe(true);
    expect(texts.every((text) => text.length <= 3000)).toBe(true);
  });

  it("renders horizontal rules as divider blocks", () => {
    const message = buildSlackMarkdownMessage(["Before", "---", "After"].join("\n"));

    expect(message.blocks.map((block) => block.type)).toEqual(["section", "divider", "section"]);
    expect(sectionTexts(message.blocks)).toEqual(["Before", "After"]);
  });

  it("caps divider-heavy replies at Slack's 50 block message limit", () => {
    const message = buildSlackMarkdownMessage(
      Array.from({ length: 80 }, (_, index) => `Part ${index}\n---`).join("\n")
    );

    expect(message.blocks).toHaveLength(50);
    expect(lastSectionText(message.blocks)).toContain("Reply truncated");
  });

  it("caps long split replies at Slack's 50 block message limit", () => {
    const message = buildSlackMarkdownMessage("a".repeat(180000));

    expect(message.blocks).toHaveLength(50);
    expect(sectionTexts(message.blocks).every((text) => text.length <= 3000)).toBe(true);
    expect(lastSectionText(message.blocks)).toContain("Reply truncated");
  });
});

function sectionTexts(blocks: KnownBlock[]): string[] {
  return blocks.flatMap((block) => {
    if (block.type !== "section" || !("text" in block) || block.text?.type !== "mrkdwn") {
      return [];
    }

    return [block.text.text];
  });
}

function lastSectionText(blocks: KnownBlock[]): string {
  const texts = sectionTexts(blocks);
  return texts[texts.length - 1] ?? "";
}
