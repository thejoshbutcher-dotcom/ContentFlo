/**
 * Bridging plain-text sections to rich HTML.
 *
 * Sections used to hold plain text (with "• " / "1. " typed by hand). They now
 * hold HTML from the editor. Both live in the same `content` string, so these
 * helpers detect which one they're looking at and convert on the way in.
 */

const HTML_HINT = /<(p|h[1-3]|ul|ol|li|hr|blockquote|details|div|br)\b/i;

/** Has this section already been converted to editor HTML? */
export function isHtml(value: string): boolean {
  return HTML_HINT.test(value);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Plain text -> HTML, preserving the hand-typed lists people already wrote:
 * "• x" / "- x" become real bullets, "1. x" becomes a real ordered list, and
 * leading spaces become nesting.
 */
export function textToHtml(text: string): string {
  if (!text.trim()) return "";

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const bullet = raw.match(/^\s*[•\-*]\s+(.*)$/);
    const numbered = bullet ? null : raw.match(/^\s*\d+[.)]\s+(.*)$/);

    if (bullet || numbered) {
      const want = bullet ? "ul" : "ol";
      if (list !== want) {
        closeList();
        out.push(`<${want}>`);
        list = want;
      }
      out.push(`<li><p>${escapeHtml((bullet ?? numbered)![1])}</p></li>`);
      continue;
    }

    closeList();
    if (raw.trim()) out.push(`<p>${escapeHtml(raw)}</p>`);
  }

  closeList();
  return out.join("");
}

/** Whatever the section holds, give the editor HTML. */
export function toEditorHtml(value: string): string {
  if (!value) return "";
  return isHtml(value) ? value : textToHtml(value);
}

/** Strip tags for emptiness checks, previews, and search. */
export function htmlToText(value: string): string {
  if (!value) return "";
  if (!isHtml(value)) return value;
  return value
    .replace(/<li>/gi, "\n• ")
    .replace(/<\/(p|h[1-3]|li|blockquote|summary)>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when a section has no meaningful content (ignores empty markup). */
export function isBlankContent(value: string): boolean {
  return htmlToText(value).trim() === "";
}
