/**
 * Reads the Outline box's convention (see docs/MCP-CONNECTOR-HANDOFF.md):
 *
 *   **Intro** (0:00–1:00)                       → section
 *   **Step 1: Getting Set Up** (1:00–4:30)      → step (gets a step card)
 *   - **Phase 1: Tell Me About It** (6:00–7:30) → phase (checkpoint card)
 *   - ▸ **Higgsfield Connector** (2:30)         → sub (chapter, no card)
 *   ### Chapters …  then a code block of "00:00 - Name" lines
 *
 * Works on the Markdown form of the box (htmlToMarkdown), so it reads exactly
 * what the planning session wrote. Parsing stops at the Chapters heading;
 * anything after it ("On hand", notes) is never mistaken for a chapter.
 */

export type ChapterKind = "section" | "step" | "phase" | "sub";

export interface OutlineEntry {
  kind: ChapterKind;
  name: string;
  /** "1:00", or null when the line has no time. */
  planned_start: string | null;
  /** "1:00–4:30" for a range, or null when only a start (or nothing) is given. */
  planned_range: string | null;
  /** For phases and subs: the Step they sit under, when there is one. */
  step: string | null;
  /** Text after the time, e.g. "back to Step 3". */
  note: string | null;
}

export interface Chapter {
  time: string;
  name: string;
}

export interface OutlineChapters {
  entries: OutlineEntry[];
  chapters: Chapter[];
}

const TIME = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
// Optional ▸, a bold name, anything (emoji, "while it builds"), then (start[–end]).
const LINE = new RegExp(
  String.raw`^(▸\s*)?\*\*(.+?)\*\*(.*?)\((${TIME})(?:\s*[–—-]\s*(${TIME}))?\)(.*)$`
);
const LIST_ITEM = /^(\s*)[-*+]\s+(.*)$/;

function kindOf(name: string, arrow: boolean): ChapterKind {
  if (arrow) return "sub";
  if (/^Step\s+\d+\b/i.test(name)) return "step";
  if (/^Phase\s+\d+\b/i.test(name)) return "phase";
  return "section";
}

export function parseOutline(markdown: string): OutlineChapters {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const entries: OutlineEntry[] = [];
  const chapters: Chapter[] = [];
  let currentStep: string | null = null;
  let i = 0;

  for (; i < lines.length; i++) {
    const raw = lines[i];
    if (/^#{1,3}\s+Chapters\b/i.test(raw.trim())) break;

    const item = LIST_ITEM.exec(raw);
    // Top-level lines and first-level list items can carry chapters; deeper
    // bullets are talking points.
    if (item && item[1].replace(/\t/g, "  ").length > 1) continue;
    const text = (item ? item[2] : raw).trim();
    const m = LINE.exec(text);
    if (!m) continue;

    const arrow = Boolean(m[1]);
    const name = m[2].trim();
    const kind = kindOf(name, arrow);
    // Inside a list only Phase and ▸ lines are chapters — a bold phrase in a
    // bullet is emphasis.
    if (item && kind !== "phase" && kind !== "sub") continue;

    if (kind === "step") currentStep = name;
    else if (kind === "section" && !item) currentStep = null;

    const note = m[6].replace(/^[\s,;:–—-]+/, "").trim();
    // "…, back to Step 4": the chapter belongs to Step 4, not the step it
    // happens to follow in the video.
    let parent = currentStep;
    const back = /back to (Step\s+\d+)/i.exec(note);
    if (back) {
      const n = back[1].replace(/\s+/g, " ").toLowerCase();
      parent =
        entries.find((e) => e.kind === "step" && e.name.toLowerCase().startsWith(n + ":"))?.name ??
        entries.find((e) => e.kind === "step" && e.name.toLowerCase().startsWith(n))?.name ??
        back[1];
    }
    entries.push({
      kind,
      name,
      planned_start: m[4],
      planned_range: m[5] ? `${m[4]}–${m[5]}` : null,
      step: kind === "phase" || kind === "sub" ? parent : null,
      note: note || null,
    });
  }

  // The Chapters block: the fenced code after the heading.
  for (i = i + 1; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) {
      for (let j = i + 1; j < lines.length && !/^\s*```/.test(lines[j]); j++) {
        const c = /^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]\s*(.+?)\s*$/.exec(lines[j]);
        if (c) chapters.push({ time: c[1], name: c[2] });
      }
      break;
    }
    if (/^#{1,3}\s/.test(lines[i].trim())) break; // next section, no block
  }

  return { entries, chapters };
}
