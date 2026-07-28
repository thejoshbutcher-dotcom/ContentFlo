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
import { InputRule } from "@tiptap/core";
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
  // Expanded-while-writing state. Clicking a toggle (or any contenteditable=false
  // widget) briefly blurs the editor, so collapsing is delayed and cancelled if
  // focus comes right back — otherwise the box flickers small/big on every click.
  const [expanded, setExpanded] = useState(false);
  // Position of the block the drag handle is currently pointing at, so clicking
  // the handle can select that whole block as a unit.
  const handlePos = useRef<number | null>(null);
  const [lasso, setLasso] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandedRef = useRef(false);
  expandedRef.current = expanded;
  useEffect(
    () => () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    },
    []
  );
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

  // Focus tracking lives on the wrapper, not the editor: React's focus events
  // bubble from every descendant, so clicking a toggle's button (or any widget
  // inside the editor) still counts as "still writing here".
  function handleFocusIn() {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    // Scroll only on genuine first entry, not when focus bounces back from a
    // toggle click — otherwise the view jumps on every interaction.
    if (!expandedRef.current) {
      wrapRef.current
        ?.closest(".section-block")
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    setExpanded(true);
  }

  function handleFocusOut() {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setExpanded(false), 220);
  }

  /** Clicking the grip selects that whole block, so it can be tabbed,
   *  copied, or deleted as one unit. */
  function selectHandleBlock() {
    const pos = handlePos.current;
    if (!editor || pos === null) return;
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
        if (!moved) return;

        const hits = blocksIn(
          Math.min(startY, ev.clientY),
          Math.max(startY, ev.clientY)
        );
        if (!hits.length) return;

        try {
          const view = editor.view;
          const from = view.posAtDOM(hits[0], 0);
          const last = hits[hits.length - 1];
          const to = view.posAtDOM(last, last.childNodes.length);
          editor.chain().focus().setTextSelection({ from, to }).run();
        } catch {
          /* position lookup can fail mid-edit; just skip the selection */
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [editor]
  );

  // Listen on the whole section block, not just the editor, so the lasso can be
  // started from a much larger area around the text.
  useEffect(() => {
    const host = wrapRef.current?.closest(".section-block");
    if (!host) return;
    host.addEventListener("mousedown", startLasso as EventListener);
    return () => host.removeEventListener("mousedown", startLasso as EventListener);
  }, [startLasso]);

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
      className={`rich-editor${large ? " large" : ""}${expanded ? " expanded" : ""}`}
      ref={wrapRef}
      onFocus={handleFocusIn}
      onBlur={handleFocusOut}
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
