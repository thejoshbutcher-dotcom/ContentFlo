import { parse, HTMLElement, Node, NodeType } from "node-html-parser";

/**
 * Markdown ⇄ the card editor's HTML (Tiptap StarterKit + task lists).
 *
 * AI clients read and write Markdown; the app stores editor HTML. The
 * Markdown → HTML direction deliberately produces the same markup as the CAPW
 * planning script (CAPW/creatorflo-sync/build.py), which is known to render
 * correctly in the app: one `<p>` per line, `<ul><li><p>…</p></li></ul>` lists
 * nested by tabs (or two spaces), fenced blocks as `<pre><code>`, `---` as
 * `<hr>`, and links opening in a new tab.
 *
 * Blocks Markdown can't express (toggles, bookmark cards) travel as a single
 * line of raw HTML both ways, so a read → write round trip never loses them.
 */

// ————— Markdown → HTML —————

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Inline Markdown: code, links, bold, italic, strike, hard breaks. */
export function inlineMd(src: string): string {
  // Pull out code spans and <br> first so nothing inside them is touched.
  const held: string[] = [];
  const hold = (html: string) => `\u0000${held.push(html) - 1}\u0000`;
  let t = src
    // \* \- \# … are literal characters (how read-back text keeps them).
    .replace(/\\([\\`*_~\[\]#>+\-.!|])/g, (_, ch: string) => hold(escapeHtml(ch)))
    .replace(/`([^`]+)`/g, (_, c: string) => hold(`<code>${escapeHtml(c)}</code>`))
    .replace(/<br\s*\/?>/gi, () => hold("<br>"));
  t = escapeHtml(t);
  t = t.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, text: string, href: string) =>
      `<a href="${href.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">${text}</a>`
  );
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])/g, "<em>$1</em>");
  t = t.replace(/~~(.+?)~~/g, "<s>$1</s>");
  return t.replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)]);
}

const LIST_RE = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/;

interface ListLine {
  level: number;
  ordered: boolean;
  /** The number written ("3." → 3); a list that continues counts from it. */
  num: number;
  task: boolean | null; // null = not a task item; else checked
  text: string;
}

/** Tabs count one level each; spaces count one level per two. */
function indentLevel(ws: string): number {
  let tabs = 0;
  let spaces = 0;
  for (const ch of ws) {
    if (ch === "\t") tabs++;
    else spaces++;
  }
  return tabs + Math.floor(spaces / 2);
}

function parseListLine(line: string): ListLine | null {
  const m = LIST_RE.exec(line);
  if (!m) return null;
  let text = m[4];
  let task: boolean | null = null;
  const tm = /^\[([ xX])\]\s+(.*)$/.exec(text);
  if (m[2] && tm) {
    task = tm[1].toLowerCase() === "x";
    text = tm[2];
  }
  return { level: indentLevel(m[1]), ordered: Boolean(m[3]), num: m[3] ? parseInt(m[3], 10) : 1, task, text };
}

function renderList(items: ListLine[]): string {
  let i = 0;
  const build = (level: number): string => {
    const first = items[i];
    const isTask = first.task !== null;
    const tag = first.ordered ? "ol" : "ul";
    const open = isTask
      ? '<ul data-type="taskList">'
      : first.ordered && first.num !== 1
        ? `<ol start="${first.num}">`
        : `<${tag}>`;
    const close = isTask ? "</ul>" : `</${tag}>`;
    const parts: string[] = [];
    while (i < items.length && items[i].level >= level) {
      const it = items[i];
      if (it.level > level) {
        // Deeper with no parent at this level: nest under the previous item.
        const sub = build(it.level);
        if (parts.length) parts[parts.length - 1] = parts[parts.length - 1].replace(/<\/li>$/, sub + "</li>");
        else parts.push(`<li><p></p>${sub}</li>`);
        continue;
      }
      i++;
      let li = isTask
        ? `<li data-type="taskItem" data-checked="${it.task ? "true" : "false"}"><p>${inlineMd(it.text)}</p>`
        : `<li><p>${inlineMd(it.text)}</p>`;
      if (i < items.length && items[i].level > level) li += build(items[i].level);
      parts.push(li + "</li>");
    }
    return open + parts.join("") + close;
  };
  return build(items[0].level);
}

/** A line that is raw block HTML (how toggles/bookmarks are carried). */
const RAW_BLOCK_RE = /^<(details|div|img|blockquote|table|figure|ol|ul)\b|^<p\s[^>]*data-indent/i;

export function markdownToHtml(src: string): string {
  const lines = src.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const out: string[] = [];
  let i = 0;
  let blanks = 0;
  const flushBlanks = () => {
    // One blank line just separates blocks; each extra one is a spacer line.
    for (let k = 1; k < blanks; k++) out.push("<p></p>");
    blanks = 0;
  };

  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) {
      blanks++;
      i++;
      continue;
    }
    flushBlanks();

    if (/^\s*```/.test(ln)) {
      const buf: string[] = [];
      let j = i + 1;
      while (j < lines.length && !/^\s*```/.test(lines[j])) buf.push(lines[j++]);
      out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      i = j + 1;
      continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(ln)) {
      out.push("<hr>");
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(ln);
    if (h) {
      const n = h[1].length;
      out.push(`<h${n}>${inlineMd(h[2])}</h${n}>`);
      i++;
      continue;
    }
    if (RAW_BLOCK_RE.test(ln.trim())) {
      out.push(ln.trim());
      i++;
      continue;
    }
    if (/^>\s?/.test(ln)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${markdownToHtml(buf.join("\n"))}</blockquote>`);
      continue;
    }
    if (parseListLine(ln)) {
      const items: ListLine[] = [];
      while (i < lines.length) {
        const item = parseListLine(lines[i]);
        if (!item) break;
        items.push(item);
        i++;
      }
      out.push(renderList(items));
      continue;
    }
    out.push(`<p>${inlineMd(ln)}</p>`);
    i++;
  }
  return out.join("");
}

// ————— HTML → Markdown —————

const isEl = (n: Node): n is HTMLElement => n.nodeType === NodeType.ELEMENT_NODE;

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Characters in plain text that Markdown would otherwise read as markup. */
function escapeMd(text: string): string {
  return text.replace(/([\\`*~])/g, "\\$1").replace(/\[([^\]]*)\]\(/g, "\\[$1\\](");
}

/** A paragraph that would read as a list, heading, rule or fence gets a
 *  leading backslash so it stays a paragraph. */
function escapeBlockStart(line: string): string {
  return /^(\s*)([-+]\s|#{1,6}\s|>|\d+[.)]\s|---|___)/.test(line)
    ? line.replace(/^(\s*)(\S)/, "$1\\$2")
    : line;
}

function inlineHtml(node: Node): string {
  if (!isEl(node)) return escapeMd(decode(node.rawText));
  const tag = node.tagName?.toLowerCase();
  const inner = () => node.childNodes.map(inlineHtml).join("");
  switch (tag) {
    case "strong":
    case "b":
      return `**${inner()}**`;
    case "em":
    case "i":
      return `*${inner()}*`;
    case "s":
    case "del":
    case "strike":
      return `~~${inner()}~~`;
    case "code":
      return "`" + decode(node.rawText) + "`";
    case "a":
      return `[${inner()}](${node.getAttribute("href") ?? ""})`;
    case "br":
      return "<br>";
    default:
      return inner();
  }
}

/** Each item = one line of text, then optional sub-lists — nothing after them. */
function listFitsMarkdown(list: HTMLElement): boolean {
  for (const li of list.childNodes) {
    if (!isEl(li) || li.tagName.toLowerCase() !== "li") continue;
    let lines = 0;
    let sawList = false;
    for (const c of li.childNodes) {
      if (!isEl(c)) continue;
      const ct = c.tagName.toLowerCase();
      if (ct === "ul" || ct === "ol") {
        sawList = true;
        if (!listFitsMarkdown(c)) return false;
      } else if (ct === "p") {
        if (sawList || ++lines > 1) return false;
      }
    }
  }
  return true;
}

function listToMd(list: HTMLElement, depth: number): string[] {
  const tag = list.tagName.toLowerCase();
  const isTask = list.getAttribute("data-type") === "taskList";
  const lines: string[] = [];
  // A list split by an un-numbered line keeps counting (<ol start="3">).
  let n = (parseInt(list.getAttribute("start") ?? "1", 10) || 1) - 1;
  for (const li of list.childNodes) {
    if (!isEl(li) || li.tagName.toLowerCase() !== "li") continue;
    n++;
    const marker = isTask
      ? `- [${li.getAttribute("data-checked") === "true" ? "x" : " "}]`
      : tag === "ol"
        ? `${n}.`
        : "-";
    const texts: string[] = [];
    const nested: string[] = [];
    const walk = (el: HTMLElement) => {
      for (const c of el.childNodes) {
        if (!isEl(c)) {
          const t = decode(c.rawText).trim();
          if (t) texts.push(t);
          continue;
        }
        const ct = c.tagName.toLowerCase();
        if (ct === "ul" || ct === "ol") nested.push(...listToMd(c, depth + 1));
        else if (ct === "p") texts.push(c.childNodes.map(inlineHtml).join(""));
        else if (ct === "label" || ct === "div") walk(c); // task items wrap content
        else if (ct !== "input") {
          // A to-do's checkbox comes with an empty <span>: not a line of text.
          const t = inlineHtml(c);
          if (t) texts.push(t);
        }
      }
    };
    walk(li);
    lines.push(`${"\t".repeat(depth)}${marker} ${texts.join("<br>")}`.trimEnd());
    lines.push(...nested);
  }
  return lines;
}

export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return "";
  // Plain text (older cards) — each line is its own paragraph already.
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;
  const root = parse(html, { comment: false, blockTextElements: { pre: true } });
  const blocks: (string | null)[] = []; // null = an empty spacer paragraph

  for (const node of root.childNodes) {
    if (!isEl(node)) {
      const t = decode(node.rawText).trim();
      if (t) blocks.push(t);
      continue;
    }
    const tag = node.tagName.toLowerCase();
    if (tag === "p" && node.getAttribute("data-indent")) {
      // Indented lines: Markdown has no indent for paragraphs — carry as HTML.
      blocks.push(node.toString().replace(/\n/g, ""));
    } else if (tag === "p") {
      const t = node.childNodes.map(inlineHtml).join("");
      blocks.push(t.trim() ? escapeBlockStart(t) : null);
    } else if (/^h[1-6]$/.test(tag)) {
      const n = Math.min(3, Number(tag[1]));
      blocks.push(`${"#".repeat(n)} ${node.childNodes.map(inlineHtml).join("")}`);
    } else if (tag === "hr") {
      blocks.push("---");
    } else if (tag === "pre") {
      // <pre> is parsed as raw text, so its <code> wrapper arrives as text.
      const raw = node.rawText.replace(/^\s*<code[^>]*>/i, "").replace(/<\/code>\s*$/i, "");
      blocks.push("```\n" + decode(raw).replace(/\n$/, "") + "\n```");
    } else if ((tag === "ul" || tag === "ol") && !listFitsMarkdown(node)) {
      // An item holding an un-numbered line under its sub-list (Backspace took
      // that line's number away) has no Markdown form — carry it as HTML.
      blocks.push(node.toString().replace(/\n/g, ""));
    } else if (tag === "ul" || tag === "ol") {
      blocks.push(listToMd(node, 0).join("\n"));
    } else if (tag === "blockquote") {
      blocks.push(
        htmlToMarkdown(node.innerHTML)
          .split("\n")
          .map((l) => `> ${l}`.trimEnd())
          .join("\n")
      );
    } else {
      // Toggles, bookmark cards, images…: carried verbatim on one line.
      blocks.push(node.toString().replace(/\n/g, ""));
    }
  }

  // Blocks go one per line; k spacer paragraphs become k+1 blank lines.
  const lines: string[] = [];
  let spacers = 0;
  for (const b of blocks) {
    if (b === null) {
      spacers++;
      continue;
    }
    if (spacers && lines.length) for (let k = 0; k <= spacers; k++) lines.push("");
    spacers = 0;
    lines.push(b);
  }
  return lines.join("\n");
}
