import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api.js";

const DEFAULT_MAX_PDF_TEXT_CHARS = 4000;

export type PdfTextExtractionResult = {
  content: string;
  truncated: boolean;
};

export async function extractPdfText(
  data: Uint8Array,
  maxChars = DEFAULT_MAX_PDF_TEXT_CHARS
): Promise<PdfTextExtractionResult> {
  const document = await getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: true
  }).promise;

  const chunks: string[] = [];
  let collectedLength = 0;
  let truncated = false;

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

      const separator = chunks.length > 0 ? "\n\n" : "";
      const nextChunk = `${separator}${pageText}`;
      const remaining = maxChars - collectedLength;
      if (nextChunk.length > remaining) {
        chunks.push(nextChunk.slice(0, Math.max(0, remaining)));
        truncated = true;
        break;
      }

      chunks.push(nextChunk);
      collectedLength += nextChunk.length;
    }
  } finally {
    await document.destroy();
  }

  return {
    content: chunks.join("").trim(),
    truncated
  };
}

function isPdfTextItem(item: unknown): item is TextItem {
  return typeof item === "object" && item !== null && "str" in item && typeof item.str === "string";
}
