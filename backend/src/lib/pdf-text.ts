import { extractText, getDocumentProxy } from "unpdf";

// What a document contributes to an extraction prompt at most. A local model
// runs with a context window measured in thousands of tokens, and a long
// contract would otherwise push the instructions themselves out of it.
export const MAX_EXTRACTION_TEXT_CHARS = 12_000;

// Below this, whatever came back is not a text layer. A scanned page often
// still carries a stray character or a producer watermark, and treating that
// as "the document says this" would be worse than admitting there is nothing
// to read.
const MIN_USABLE_CHARS = 40;

/// Reads the embedded text layer out of a PDF, or null when there is none.
///
/// Null is the normal answer for a scan, not a fault: a photographed page
/// contains pixels and no characters. The caller decides what to do with
/// that, which for the ollama provider means "no suggestion, file it by
/// hand" since ollama cannot read a PDF itself.
///
/// unpdf rather than pdfjs-dist directly: pdfjs v6 touches DOMMatrix while
/// its module is still loading, which Node does not provide, so it refuses
/// to import at all without a native canvas package. unpdf bundles a build
/// made for exactly this and pulls in no dependencies of its own.
export async function extractPdfText(
  buffer: Buffer,
  maxChars: number = MAX_EXTRACTION_TEXT_CHARS,
): Promise<string | null> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });

    // Page breaks and the odd double space survive extraction and cost
    // tokens without carrying meaning.
    const cleaned = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (cleaned.length < MIN_USABLE_CHARS) return null;

    return cleaned.slice(0, maxChars);
  } catch {
    // A damaged or encrypted PDF is indistinguishable from a scan as far as
    // the caller is concerned: there is no text to work with either way.
    return null;
  }
}
