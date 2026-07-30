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
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

// The editor view a drag started from. A drop into a DIFFERENT section's
// editor completes the move by deleting the dragged blocks from the source —
// otherwise ProseMirror treats cross-editor drags as a copy (or worse,
// depending on the browser), which is where blocks were getting lost.
let dragSourceView: EditorView | null = null;

/**
 * Marks every top-level block a multi-block selection touches with
 * .block-selected — via ProseMirror decorations, which survive the editor's
 * own rendering (externally-mutated classes get wiped on redraw).
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
            const fromIdx = doc.resolve(selection.from).index(0);
            const toIdx = doc
              .resolve(Math.max(selection.from, selection.to - 1))
              .index(0);
            if (toIdx <= fromIdx) return null;
            const decos: Decoration[] = [];
            let pos = 0;
            for (let i = 0; i < doc.childCount; i += 1) {
              const size = doc.child(i).nodeSize;
              if (i >= fromIdx && i <= toIdx) {
                decos.push(
                  Decoration.node(pos, pos + size, { class: "block-selected" })
                );
              }
              pos += size;
            }
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
import DragHandle from "@tiptap/extension-drag-handle-react";
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
  // Position of the block the drag handle is currently pointing at, so clicking
  // the handle can select that whole block as a unit.
  const handlePos = useRef<number | null>(null);
  // Block selection is its own thing, separate from text selection: these are
  // indices of top-level blocks picked as whole objects (grip click or lasso).
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
      handleDrop: (view, event) => {
        // A drop arriving from one of our OTHER editors: let ProseMirror parse
        // and insert the HTML normally, then finish the move by deleting the
        // dragged blocks from the source (unless Alt is held to copy).
        const src = dragSourceView;
        if (src && src !== view && !event.altKey) {
          window.setTimeout(() => {
            try {
              src.dispatch(src.state.tr.deleteSelection().scrollIntoView());
            } catch {
              /* source may have unmounted; the drop still succeeded */
            }
          }, 0);
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

  // Solid drag preview: the browser's default ghost is a translucent text
  // smear. Build a card-styled clone of the dragged block(s) instead, so the
  // whole block visibly moves, and dim the sources while the drag is live.
  useEffect(() => {
    const host = wrapRef.current;
    if (!host || !editor) return;

    const onDragStart = (e: Event) => {
      const de = e as DragEvent;
      if (!de.dataTransfer) return;
      const prose = host.querySelector(".cf-prose");
      if (!prose) return;

      let els = [...prose.querySelectorAll<HTMLElement>(".block-selected")];
      if (!els.length) {
        const selNode = prose.querySelector<HTMLElement>(".ProseMirror-selectednode");
        if (selNode) els = [selNode];
      }
      if (!els.length) {
        const target = de.target as HTMLElement | null;
        const block = target?.closest?.(".cf-prose > *");
        if (block instanceof HTMLElement) els = [block];
      }
      if (!els.length) return;

      const ghost = document.createElement("div");
      ghost.className = "cf-drag-ghost";
      ghost.style.width = `${Math.min(420, els[0].offsetWidth || 320)}px`;
      els.slice(0, 4).forEach((el) => {
        const clone = el.cloneNode(true) as HTMLElement;
        clone.classList.remove("block-selected", "lasso-hit", "cf-dragging-src");
        ghost.appendChild(clone);
      });
      if (els.length > 4) {
        const more = document.createElement("div");
        more.className = "cf-ghost-more";
        more.textContent = `+${els.length - 4} more`;
        ghost.appendChild(more);
      }
      document.body.appendChild(ghost);
      de.dataTransfer.setDragImage(ghost, 24, 18);
      window.setTimeout(() => ghost.remove(), 0);

      els.forEach((el) => el.classList.add("cf-dragging-src"));
      dragSourceView = editor.view;
      const clear = () => {
        els.forEach((el) => el.classList.remove("cf-dragging-src"));
        // Cleared on the next tick so a drop handler still sees the source.
        window.setTimeout(() => {
          dragSourceView = null;
        }, 0);
        window.removeEventListener("dragend", clear);
      };
      window.addEventListener("dragend", clear);
    };

    host.addEventListener("dragstart", onDragStart, true);
    return () => host.removeEventListener("dragstart", onDragStart, true);
  }, [editor]);

  /** Clicking the grip picks that whole block as an object — a native
   *  ProseMirror node selection, so it can be dragged, copied, or deleted as a
   *  unit, and it works on nested blocks (list items, toggles) too. */
  function selectHandleBlock(e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const pos = handlePos.current;
    if (!editor || pos === null) return;
    setSelBlocks([]);
    editor.chain().focus().setNodeSelection(pos).run();
  }

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
        target.closest(".cf-drag-handle") ||
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

      const blocksIn = (top: number, bottom: number) => {
        const hits: HTMLElement[] = [];
        proseEl.childNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          const r = n.getBoundingClientRect();
          if (r.top < bottom && r.bottom > top) hits.push(n);
        });
        return hits;
      };

      const paint = (hits: HTMLElement[]) => {
        proseEl
          .querySelectorAll(".lasso-hit")
          .forEach((el) => el.classList.remove("lasso-hit"));
        hits.forEach((el) => el.classList.add("lasso-hit"));
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
        paint([]); // clear the preview; the real selection takes over

        if (!moved) {
          // Plain click in the gutter: instantly pick the block on that row —
          // no waiting for the floating grip to materialise.
          const rowHits = blocksIn(startY - 2, startY + 2);
          const idx = rowHits.length
            ? [...proseEl.children].indexOf(rowHits[0])
            : -1;
          if (idx >= 0) {
            let acc = 0;
            const doc = editor.state.doc;
            for (let i = 0; i < idx && i < doc.childCount; i += 1) {
              acc += doc.child(i).nodeSize;
            }
            editor.chain().focus().setNodeSelection(acc).run();
          }
          return;
        }

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
      const fromIdx = doc.resolve(selection.from).index(0);
      const toIdx = doc
        .resolve(Math.max(selection.from, selection.to - 1))
        .index(0);
      if (toIdx > fromIdx) {
        const picks: number[] = [];
        for (let i = fromIdx; i <= toIdx; i += 1) picks.push(i);
        setSelBlocks(picks);
      } else {
        setSelBlocks([]);
      }
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
        const fromIdx = doc.resolve(selection.from).index(0);
        const toIdx = doc
          .resolve(Math.max(selection.from, selection.to - 1))
          .index(0);
        if (toIdx <= fromIdx) return;
        let start = 0;
        for (let i = 0; i < fromIdx; i += 1) start += doc.child(i).nodeSize;
        let end = start;
        for (let i = fromIdx; i <= toIdx; i += 1) end += doc.child(i).nodeSize;
        if (selection.from !== start + 1 || selection.to !== end - 1) {
          editor.commands.setTextSelection({ from: start + 1, to: end - 1 });
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

  return (
    <div
      className={`rich-editor${large ? " large" : ""}`}
      ref={wrapRef}
    >
      {editor && (
        <DragHandle
          editor={editor}
          // Blocks inside toggles (and lists) get their own handle, not just
          // top-level ones. Cursor near the left edge grabs the container.
          nested={{ edgeDetection: "left" }}
          onNodeChange={({ pos }) => {
            handlePos.current = pos;
          }}
        >
          <span
            className="cf-drag-handle"
            role="button"
            tabIndex={-1}
            title="Drag to move · click to select the block"
            onClick={selectHandleBlock}
          >
            <GripVertical size={14} />
          </span>
        </DragHandle>
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
