import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api.js";

const DEFAULT_MAX_PDF_TEXT_CHARS = 4000;

export type PdfTextExtractionResult = {
  content: string;
  truncated: boolean;
  offset: number;
  nextOffset?: number;
};

export async function extractPdfText(
  data: Uint8Array,
  options: number | { maxChars?: number; offset?: number } = DEFAULT_MAX_PDF_TEXT_CHARS
): Promise<PdfTextExtractionResult> {
  const maxChars = typeof options === "number" ? options : options.maxChars ?? DEFAULT_MAX_PDF_TEXT_CHARS;
  const offset = typeof options === "number" ? 0 : normalizeOffset(options.offset);
  const readEnd = offset + Math.max(0, maxChars);
  const document = await getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: true
  }).promise;

  const chunks: string[] = [];
  let truncated = false;
  let rawTextLength = 0;
  let hasPriorText = false;

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .filter((item): item is TextItem => isPdfTextItem(item))
        .map((item) => `${item.str}${item.hasEOL ? "\n" : " "}`)
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();

      if (!pageText) {
        continue;
      }

      const separator = hasPriorText ? "\n\n" : "";
      const nextChunk = `${separator}${pageText}`;
      const chunkStart = rawTextLength;
      const chunkEnd = rawTextLength + nextChunk.length;
      hasPriorText = true;
      if (chunkEnd <= offset) {
        rawTextLength = chunkEnd;
        continue;
      }

      if (chunkStart < readEnd) {
        const sliceStart = Math.max(0, offset - chunkStart);
        const sliceEnd = Math.min(nextChunk.length, readEnd - chunkStart);
        chunks.push(nextChunk.slice(sliceStart, sliceEnd));
      }

      if (chunkEnd > readEnd) {
        truncated = true;
        break;
      }

      rawTextLength = chunkEnd;
    }
  } finally {
    await document.destroy();
  }

  const rawBoundedContent = chunks.join("");
  const boundedContent = rawBoundedContent.trim();
  return {
    content: truncated ? appendTruncationMarker(boundedContent) : boundedContent,
    truncated,
    offset,
    nextOffset: truncated ? offset + rawBoundedContent.length : undefined
  };
}

function isPdfTextItem(item: unknown): item is TextItem {
  return typeof item === "object" && item !== null && "str" in item && typeof item.str === "string";
}

function normalizeOffset(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function appendTruncationMarker(value: string): string {
  return `${value}\n[truncated]`;
}
