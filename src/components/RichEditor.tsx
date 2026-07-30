"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  EditorContent,
  ReactNodeViewRenderer,
  useEditor,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Extension, InputRule } from "@tiptap/core";
import { NodeSelection, Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { ResolvedPos } from "@tiptap/pm/model";

// Every mounted editor registers its DOM here, so a custom pointer drag can
// resolve which editor a drop lands in — the same technique as the kanban
// board, with none of the native HTML5 drag-and-drop flakiness.
const editorByDom = new Map<Element, Editor>();

/** The draggable/pickable rows of an editor: list items individually,
 *  otherwise the top-level block. */
function domUnits(prose: Element): HTMLElement[] {
  const units: HTMLElement[] = [];
  prose.childNodes.forEach((n) => {
    if (!(n instanceof HTMLElement)) return;
    if (/^(UL|OL)$/.test(n.tagName)) {
      [...n.children].forEach((li) => {
        if (li instanceof HTMLElement) units.push(li);
      });
    } else {
      units.push(n);
    }
  });
  return units;
}

// "Units" are what picking operates on: list items count individually (like
// Notion), everything else is the top-level block.
const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

function unitStartPos($p: ResolvedPos): number {
  for (let d = $p.depth; d >= 1; d -= 1) {
    const name = $p.node(d).type.name;
    if (name === "listItem" || name === "taskItem") return $p.before(d);
  }
  return $p.depth >= 1 ? $p.before(1) : $p.pos;
}

function unitEndPos($p: ResolvedPos): number {
  for (let d = $p.depth; d >= 1; d -= 1) {
    const name = $p.node(d).type.name;
    if (name === "listItem" || name === "taskItem") return $p.after(d);
  }
  return $p.depth >= 1 ? $p.after(1) : $p.pos;
}

/**
 * Paints every unit a multi-unit selection touches with .block-selected and
 * marks it draggable — via ProseMirror decorations, which survive the editor's
 * own rendering (externally-mutated classes get wiped on redraw). The explicit
 * draggable attribute is what makes grabbing a picked block start a real drag
 * reliably; ProseMirror then drags the whole selection because the drag
 * originates inside it.
 */
const BlockPick = Extension.create({
  name: "blockPick",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const { doc, selection } = state;
            if (selection.empty || doc.childCount === 0) return null;
            const { from, to } = selection;
            const $f = doc.resolve(from);
            const $l = doc.resolve(Math.max(from, to - 1));
            // Selections inside a single unit stay ordinary text selections.
            if (unitStartPos($f) === unitStartPos($l)) return null;

            const attrs = { class: "block-selected" };
            const decos: Decoration[] = [];
            doc.forEach((node, pos) => {
              if (pos + node.nodeSize <= from || pos >= to) return;
              if (LIST_TYPES.has(node.type.name)) {
                node.forEach((item, off) => {
                  const ip = pos + 1 + off;
                  if (ip + item.nodeSize <= from || ip >= to) return;
                  decos.push(Decoration.node(ip, ip + item.nodeSize, attrs));
                });
              } else {
                decos.push(Decoration.node(pos, pos + node.nodeSize, attrs));
              }
            });
            return DecorationSet.create(doc, decos);
          },
        },
      }),
    ];
  },
});
import { CodeBlock } from "@tiptap/extension-code-block";
import { Blockquote } from "@tiptap/extension-blockquote";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import {
  ChevronRight,
  Code2,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Type,
} from "lucide-react";
import { toEditorHtml } from "@/lib/richtext";
import { Indent } from "@/lib/indent";
import CodeBlockView from "./CodeBlockView";

const MENU_W = 252;
const MENU_MAX_H = 292;

interface SlashItem {
  title: string;
  hint: string;
  icon: React.ReactNode;
  keywords: string;
  run: (editor: Editor) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  {
    title: "Text",
    hint: "Plain paragraph",
    icon: <Type size={15} />,
    keywords: "text paragraph plain body",
    run: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    title: "Heading 1",
    hint: "Big section heading",
    icon: <Heading1 size={15} />,
    keywords: "h1 heading title big",
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: "Heading 2",
    hint: "Medium heading",
    icon: <Heading2 size={15} />,
    keywords: "h2 heading subtitle medium",
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: "Heading 3",
    hint: "Small heading",
    icon: <Heading3 size={15} />,
    keywords: "h3 heading small",
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: "Bulleted list",
    hint: "Simple bullet points",
    icon: <List size={15} />,
    keywords: "bullet list unordered ul points",
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    hint: "Steps in order",
    icon: <ListOrdered size={15} />,
    keywords: "number ordered list ol steps",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    title: "To-do list",
    hint: "Checkboxes you can tick",
    icon: <ListChecks size={15} />,
    keywords: "todo task checklist checkbox check tick",
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    title: "Toggle",
    hint: "Collapsible section",
    icon: <ChevronRight size={15} />,
    keywords: "toggle details collapse accordion fold",
    run: (e) => e.chain().focus().setDetails().run(),
  },
  {
    title: "Code / prompt",
    hint: "Copy-able block",
    icon: <Code2 size={15} />,
    keywords: "code prompt snippet copy paste block",
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: "Quote",
    hint: "Call out a line",
    icon: <Quote size={15} />,
    keywords: "quote blockquote callout",
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    title: "Divider",
    hint: "Horizontal line",
    icon: <Minus size={15} />,
    keywords: "divider rule hr line separator break",
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
];

/**
 * The block editor used by every card section.
 *
 * Uncontrolled by design: TipTap owns the document and pushes HTML out via
 * onChange. Remount it (key) to load a different section rather than feeding
 * content back in, which would fight the editor's own state.
 */
export default function RichEditor({
  content,
  placeholder,
  large,
  onChange,
  onImagePaste,
}: {
  content: string;
  placeholder?: string;
  large?: boolean;
  onChange: (html: string) => void;
  /** Return true if the paste was handled (images go to the section gallery). */
  onImagePaste?: (files: File[]) => boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // Our own always-available grip: tracks the hovered row and renders in the
  // gutter instantly, replacing the floating plugin handle that appeared late.
  const [grip, setGrip] = useState<{ top: number } | null>(null);
  const gripUnitRef = useRef<HTMLElement | null>(null);
  // Non-empty while the selection spans multiple units (drives hideselection).
  const [selBlocks, setSelBlocks] = useState<number[]>([]);
  const [lasso, setLasso] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [slash, setSlash] = useState<{ top: number; left: number; query: string } | null>(
    null
  );
  const [active, setActive] = useState(0);

  const matches = slash
    ? SLASH_ITEMS.filter((i) => {
        const q = slash.query.toLowerCase();
        return (
          !q ||
          i.title.toLowerCase().includes(q) ||
          i.keywords.includes(q)
        );
      })
    : [];

  const closeSlash = useCallback(() => {
    setSlash(null);
    setActive(0);
  }, []);

  // ProseMirror sees keydown before React's bubbled handler, so the menu's
  // keyboard control lives in editorProps.handleKeyDown and reads live values
  // through refs.
  const slashRef = useRef(slash);
  const matchesRef = useRef(matches);
  const activeRef = useRef(active);
  const pickRef = useRef<(item: SlashItem) => void>(() => {});
  slashRef.current = slash;
  matchesRef.current = matches;
  activeRef.current = active;

  const editor = useEditor({
    // Next renders this on the server first; let the client mount it.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false },
        codeBlock: false, // replaced below with a copy-button node view
        // "> " belongs to the toggle here (Notion parity), so blockquote keeps
        // the node but loses its input rule; it's still in the slash menu.
        blockquote: false,
      }),
      Blockquote.extend({ addInputRules: () => [] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Indent,
      BlockPick,
      CodeBlock.extend({
        addNodeView: () => ReactNodeViewRenderer(CodeBlockView),
      }),
      Details.extend({
        // Notion parity: "> " + space opens a toggle.
        addInputRules() {
          return [
            new InputRule({
              find: /^>\s$/,
              handler: ({ chain, range }) => {
                chain().deleteRange(range).setDetails().run();
              },
            }),
          ];
        },
      }).configure({ persist: true, HTMLAttributes: { class: "cf-toggle" } }),
      DetailsSummary,
      DetailsContent,
      Placeholder.configure({
        placeholder: placeholder ?? "Write here…  press / for blocks",
      }),
    ],
    content: toEditorHtml(content),
    editorProps: {
      attributes: { class: "cf-prose" },
      handleKeyDown: (_view, event) => {
        const open = slashRef.current;
        const items = matchesRef.current;
        if (!open || !items.length) return false;
        if (event.key === "ArrowDown") {
          setActive((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setActive((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          pickRef.current(items[activeRef.current]);
          return true;
        }
        if (event.key === "Escape") {
          closeSlash();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.items ?? [])]
          .filter((it) => it.type.startsWith("image/"))
          .map((it) => it.getAsFile())
          .filter((f): f is File => f !== null);
        if (files.length && onImagePaste) return onImagePaste(files);
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  /** While blocks are picked (the BlockPick decoration paints them), hide the
   *  native character selection so the pick reads as objects, never as
   *  highlighted text. */
  useEffect(() => {
    const prose = wrapRef.current?.querySelector(".cf-prose");
    if (!prose) return;
    prose.classList.toggle("ProseMirror-hideselection", selBlocks.length > 0);
  }, [selBlocks, editor]);

  // Register this editor so drags from other sections can drop into it.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    editorByDom.set(dom, editor);
    return () => {
      editorByDom.delete(dom);
    };
  }, [editor]);

  /**
   * Custom pointer drag — the same technique as the kanban board, replacing
   * native HTML5 drag entirely (which never initiated reliably here). Grabbing
   * the grip or any picked row lifts a solid card ghost that follows the
   * cursor, an amber line marks the exact drop gap in whichever editor is
   * under the pointer, and release performs the move through the editor APIs.
   */
  const beginBlockDrag = useCallback(
    (e: MouseEvent, originUnit: HTMLElement, origin: "grip" | "block") => {
      if (!editor || e.button !== 0) return;
      const prose = wrapRef.current?.querySelector(".cf-prose");
      if (!prose) return;

      const picked = [...prose.querySelectorAll<HTMLElement>(".block-selected")];
      const units =
        picked.length && originUnit.classList.contains("block-selected")
          ? picked
          : [originUnit];

      let from: number;
      let to: number;
      try {
        const v = editor.view;
        from = unitStartPos(editor.state.doc.resolve(v.posAtDOM(units[0], 0)));
        to = unitEndPos(
          editor.state.doc.resolve(v.posAtDOM(units[units.length - 1], 0))
        );
      } catch {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      let lifted = false;
      let ghost: HTMLElement | null = null;
      let line: HTMLElement | null = null;
      let target: { ed: Editor; pos: number } | null = null;

      const lift = () => {
        lifted = true;
        ghost = document.createElement("div");
        ghost.className = "cf-drag-ghost";
        ghost.style.position = "fixed";
        ghost.style.width = `${Math.min(420, units[0].offsetWidth || 320)}px`;
        units.slice(0, 4).forEach((el) => {
          const c = el.cloneNode(true) as HTMLElement;
          c.classList.remove("block-selected", "cf-dragging-src");
          ghost!.appendChild(c);
        });
        if (units.length > 4) {
          const more = document.createElement("div");
          more.className = "cf-ghost-more";
          more.textContent = `+${units.length - 4} more`;
          ghost!.appendChild(more);
        }
        document.body.appendChild(ghost!);
        line = document.createElement("div");
        line.className = "cf-drop-line";
        document.body.appendChild(line);
        units.forEach((u) => u.classList.add("cf-dragging-src"));
      };

      const onMove = (ev: MouseEvent) => {
        if (!lifted) {
          if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4)
            return;
          lift();
        }
        ghost!.style.left = `${ev.clientX + 14}px`;
        ghost!.style.top = `${ev.clientY + 10}px`;

        target = null;
        line!.style.display = "none";
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const destProse = under?.closest?.(".cf-prose");
        if (!destProse) return;
        const destEd = editorByDom.get(destProse);
        if (!destEd) return;

        const destUnits = domUnits(destProse).filter(
          (u) => !u.classList.contains("cf-dragging-src")
        );
        const pr = destProse.getBoundingClientRect();
        let gapY = pr.top + 4;
        let pos: number | null = null;
        for (const u of destUnits) {
          const r = u.getBoundingClientRect();
          if (ev.clientY < r.top + r.height / 2) {
            gapY = r.top - 2;
            try {
              pos = unitStartPos(
                destEd.state.doc.resolve(destEd.view.posAtDOM(u, 0))
              );
            } catch {
              return;
            }
            break;
          }
        }
        if (pos === null) {
          const lastU = destUnits[destUnits.length - 1];
          gapY = lastU ? lastU.getBoundingClientRect().bottom + 2 : pr.top + 6;
          pos = destEd.state.doc.content.size;
        }
        target = { ed: destEd, pos };
        line!.style.display = "block";
        line!.style.left = `${pr.left}px`;
        line!.style.width = `${pr.width}px`;
        line!.style.top = `${gapY}px`;
      };

      const cleanup = () => {
        ghost?.remove();
        line?.remove();
        units.forEach((u) => u.classList.remove("cf-dragging-src"));
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("keydown", onKey);
      };

      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") {
          target = null;
          cleanup();
        }
      };

      const onUp = (ev: MouseEvent) => {
        const t = target;
        const wasLifted = lifted;
        cleanup();

        if (!wasLifted) {
          // A plain click: the grip picks the row; a picked row takes the caret.
          if (origin === "grip") {
            try {
              const pos = editor.view.posAtDOM(originUnit, 0);
              const $p = editor.state.doc.resolve(pos);
              const sel = NodeSelection.create(editor.state.doc, unitStartPos($p));
              editor.view.dispatch(editor.state.tr.setSelection(sel));
              editor.view.focus();
            } catch {
              /* row lookup can fail mid-edit */
            }
          } else {
            const p = editor.view.posAtCoords({ left: ev.clientX, top: ev.clientY });
            if (p) editor.chain().focus().setTextSelection(p.pos).run();
          }
          return;
        }
        if (!t) return;

        // Serialize the moved units; list items stay raw when dropping into a
        // list, otherwise they get wrapped back into their list container.
        const $t = t.ed.state.doc.resolve(
          Math.min(t.pos, t.ed.state.doc.content.size)
        );
        const intoList = LIST_TYPES.has($t.parent.type.name);
        const html = units
          .map((el) => {
            const clone = el.cloneNode(true) as HTMLElement;
            clone.classList.remove("block-selected", "cf-dragging-src");
            if (el.tagName === "LI" && !intoList) {
              const parent = el.parentElement!;
              const wrap = document.createElement(parent.tagName);
              [...parent.attributes].forEach((a) => {
                if (a.name !== "class") wrap.setAttribute(a.name, a.value);
              });
              wrap.appendChild(clone);
              return wrap.outerHTML;
            }
            return clone.outerHTML;
          })
          .join("");

        if (t.ed === editor) {
          let insertPos = t.pos;
          if (insertPos >= to) insertPos -= to - from;
          else if (insertPos > from) return; // dropped inside the dragged range
          editor
            .chain()
            .focus()
            .deleteRange({ from, to })
            .insertContentAt(insertPos, html)
            .run();
        } else {
          t.ed.chain().focus().insertContentAt(t.pos, html).run();
          editor.commands.deleteRange({ from, to });
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("keydown", onKey);
    },
    [editor]
  );

  /**
   * Lasso: drag anywhere around the text — the gutter, the padding, the space
   * below the last block — to rubber-band whole blocks. Blocks light up live as
   * the box passes over them and commit to a real selection on release, so Tab
   * / Delete / drag then apply to all of them.
   */
  const startLasso = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0 || !editor) return;
      const target = e.target as HTMLElement;
      // Never steal a click on the text itself, the grip, or a control.
      if (
        target.closest(".cf-prose") ||
        target.closest(".cf-grip") ||
        target.closest("button, input, select, textarea, a, .slash-menu")
      ) {
        return;
      }
      const proseEl = wrapRef.current?.querySelector(".cf-prose");
      if (!proseEl) return;

      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      let moved = false;

      // Hit-testing operates on "units": list items individually, otherwise
      // the top-level block — matching how picking and Notion treat rows.
      const blocksIn = (top: number, bottom: number) =>
        domUnits(proseEl).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.top < bottom && r.bottom > top;
        });

      // Live feedback: fixed-position glow boxes over every unit the lasso
      // touches. Drawn OUTSIDE the editor's DOM on purpose — classes added to
      // ProseMirror-managed nodes can be wiped by its rendering, which is why
      // earlier in-DOM highlighting never showed. This overlay can't be.
      let hi: HTMLElement | null = null;
      const paint = (hits: HTMLElement[]) => {
        if (!hi) {
          hi = document.createElement("div");
          hi.className = "cf-lasso-paint";
          document.body.appendChild(hi);
        }
        hi.innerHTML = "";
        hits.forEach((el) => {
          const r = el.getBoundingClientRect();
          const b = document.createElement("div");
          b.className = "cf-lasso-box";
          b.style.left = `${r.left - 6}px`;
          b.style.top = `${r.top - 2}px`;
          b.style.width = `${r.width + 12}px`;
          b.style.height = `${r.height + 4}px`;
          hi!.appendChild(b);
        });
      };

      const onMove = (ev: MouseEvent) => {
        if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) {
          moved = true;
        }
        setLasso({
          left: Math.min(startX, ev.clientX),
          top: Math.min(startY, ev.clientY),
          width: Math.abs(ev.clientX - startX),
          height: Math.abs(ev.clientY - startY),
        });
        if (moved) {
          // Live feedback: show what will be selected before releasing.
          paint(blocksIn(Math.min(startY, ev.clientY), Math.max(startY, ev.clientY)));
        }
      };

      const onUp = (ev: MouseEvent) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setLasso(null);
        hi?.remove(); // clear the preview; the real selection takes over

        // A plain gutter click selects nothing — only the grip or a real
        // lasso drag picks blocks. Text clicks stay normal editing.
        if (!moved) return;

        const hits = blocksIn(
          Math.min(startY, ev.clientY),
          Math.max(startY, ev.clientY)
        );
        if (!hits.length) return;

        // Back the picked blocks with a real editor selection; the overlay is
        // derived from it, so drag / copy / delete / Tab all behave natively.
        try {
          const view = editor.view;
          const from = view.posAtDOM(hits[0], 0);
          const last = hits[hits.length - 1];
          const to = view.posAtDOM(last, last.childNodes.length);
          editor.chain().focus().setTextSelection({ from, to }).run();
        } catch {
          /* position lookup can fail mid-edit */
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [editor]
  );

  // Listen on the section block AND the scrolling pane, so the lasso can be
  // started from the empty space well outside the text box.
  useEffect(() => {
    const hosts = [
      wrapRef.current?.closest(".section-block"),
      wrapRef.current?.closest(".modal-sections"),
      wrapRef.current?.closest(".script-pane"),
    ].filter(Boolean) as HTMLElement[];
    hosts.forEach((h) => h.addEventListener("mousedown", startLasso as EventListener));
    return () =>
      hosts.forEach((h) =>
        h.removeEventListener("mousedown", startLasso as EventListener)
      );
  }, [startLasso]);

  // Dev-only: expose editor instances so interaction logic can be exercised
  // through the real API in tests. Stripped from production builds.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !editor) return;
    const w = window as unknown as { __cfEditors?: Set<unknown> };
    (w.__cfEditors ??= new Set()).add(editor);
    return () => {
      w.__cfEditors?.delete(editor);
    };
  }, [editor]);

  // The overlay is DERIVED from the editor's own selection: whenever the
  // selection spans more than one top-level block, those blocks render as
  // picked objects (and the character highlight is hidden). This means simply
  // dragging through text across blocks — the most natural gesture — becomes
  // block selection, exactly like Notion. One source of truth, no stale state.
  useEffect(() => {
    if (!editor) return;
    const compute = () => {
      const { doc, selection } = editor.state;
      if (selection.empty || doc.childCount === 0) {
        setSelBlocks([]);
        return;
      }
      const $f = doc.resolve(selection.from);
      const $l = doc.resolve(Math.max(selection.from, selection.to - 1));
      setSelBlocks(unitStartPos($f) !== unitStartPos($l) ? [1] : []);
    };
    editor.on("selectionUpdate", compute);
    return () => {
      editor.off("selectionUpdate", compute);
    };
  }, [editor]);

  // On release, a multi-block selection snaps outward to whole-block
  // boundaries, so what you picked is complete blocks — never half a block.
  useEffect(() => {
    if (!editor) return;
    const onUp = () => {
      window.setTimeout(() => {
        if (!editor || editor.isDestroyed || !editor.view.hasFocus()) return;
        const { doc, selection } = editor.state;
        if (selection.empty || doc.childCount === 0) return;
        const $f = doc.resolve(selection.from);
        const $l = doc.resolve(Math.max(selection.from, selection.to - 1));
        if (unitStartPos($f) === unitStartPos($l)) return; // single unit: leave as text
        const from = unitStartPos($f) + 1;
        const to = unitEndPos($l) - 1;
        if (selection.from !== from || selection.to !== to) {
          editor.commands.setTextSelection({ from, to });
        }
      }, 0);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [editor]);

  // Escape releases a block pick by collapsing the selection.
  useEffect(() => {
    if (!selBlocks.length || !editor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        editor.commands.setTextSelection(editor.state.selection.from);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selBlocks.length, editor]);

  // Track "/" typed at the start of an empty block and drive the block menu.
  useEffect(() => {
    if (!editor) return;
    const sync = () => {
      const { state } = editor;
      const { $from, empty } = state.selection;
      if (!empty) return closeSlash();
      const before = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
      const m = before.match(/^\/(\w*)$/);
      if (!m) return closeSlash();
      // Viewport coords + fixed positioning: the section blocks clip overflow,
      // so an absolutely-positioned menu would be cut off.
      const coords = editor.view.coordsAtPos($from.pos);
      const flip = coords.bottom + MENU_MAX_H > window.innerHeight;
      setSlash({
        top: flip ? coords.top - MENU_MAX_H - 6 : coords.bottom + 6,
        left: Math.min(coords.left, window.innerWidth - MENU_W - 12),
        query: m[1],
      });
      setActive(0);
    };
    editor.on("transaction", sync);
    return () => {
      editor.off("transaction", sync);
    };
  }, [editor, closeSlash]);

  const pick = useCallback(
    (item: SlashItem) => {
      if (!editor) return;
      // Drop the "/query" the user typed, then insert the block.
      const { $from } = editor.state.selection;
      const from = $from.pos - ($from.parentOffset - 0);
      editor
        .chain()
        .focus()
        .deleteRange({ from: from, to: $from.pos })
        .run();
      item.run(editor);
      closeSlash();
    },
    [editor, closeSlash]
  );
  pickRef.current = pick;

  /** Keep our own grip glued to the hovered row — always available, no
   *  floating-plugin latency. */
  function onWrapMouseMove(e: ReactMouseEvent) {
    const prose = wrapRef.current?.querySelector(".cf-prose");
    const wr = wrapRef.current?.getBoundingClientRect();
    if (!prose || !wr) return;
    const hit = domUnits(prose).find((u) => {
      const r = u.getBoundingClientRect();
      return e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (!hit) return;
    gripUnitRef.current = hit;
    const top = hit.getBoundingClientRect().top - wr.top + 2;
    setGrip((prev) => (prev && Math.abs(prev.top - top) < 1 ? prev : { top }));
  }

  /** Pressing a picked row starts the block drag before the editor can turn
   *  the press into a caret. Unpicked text is untouched — normal editing. */
  function onWrapMouseDownCapture(e: ReactMouseEvent) {
    const t = e.target as HTMLElement;
    const unit = t.closest?.(".block-selected");
    if (unit instanceof HTMLElement) beginBlockDrag(e.nativeEvent, unit, "block");
  }

  return (
    <div
      className={`rich-editor${large ? " large" : ""}`}
      ref={wrapRef}
      onMouseMove={onWrapMouseMove}
      onMouseLeave={() => {
        setGrip(null);
        gripUnitRef.current = null;
      }}
      onMouseDownCapture={onWrapMouseDownCapture}
    >
      {editor && grip && (
        <button
          type="button"
          className="cf-grip"
          style={{ top: grip.top }}
          tabIndex={-1}
          title="Drag to move · click to select the block"
          onMouseDown={(e) => {
            const u = gripUnitRef.current;
            if (u) beginBlockDrag(e.nativeEvent, u, "grip");
          }}
        >
          <GripVertical size={14} />
        </button>
      )}

      <EditorContent editor={editor} />

      {lasso && (
        <div
          className="marquee"
          style={{
            left: lasso.left,
            top: lasso.top,
            width: lasso.width,
            height: lasso.height,
          }}
        />
      )}

      {slash && matches.length > 0 && (
        <div
          className="slash-menu"
          style={{ top: slash.top, left: slash.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {matches.map((item, i) => (
            <button
              key={item.title}
              className={`slash-item${i === active ? " on" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(item)}
            >
              <span className="slash-icon">{item.icon}</span>
              <span className="slash-text">
                <span className="slash-title">{item.title}</span>
                <span className="slash-hint">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
