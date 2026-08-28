"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import {
  EditorContent,
  ReactNodeViewRenderer,
  useEditor,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Extension, InputRule } from "@tiptap/core";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";

// Every mounted editor registers its DOM here, so a custom pointer drag can
// resolve which editor a drop lands in — the same technique as the kanban
// board, with none of the native HTML5 drag-and-drop flakiness.
const editorByDom = new Map<Element, Editor>();

/** The draggable/pickable rows of an editor: list items individually,
 *  otherwise the top-level block. */
function domUnits(prose: Element): HTMLElement[] {
  const units: HTMLElement[] = [];
  const walk = (parent: Element) => {
    [...parent.children].forEach((n) => {
      if (!(n instanceof HTMLElement)) return;
      if (/^(UL|OL)$/.test(n.tagName)) {
        walk(n);
        return;
      }
      units.push(n);
      // A list item can hold its own nested list. Those rows are units in
      // their own right — indenting a bullet must not demote it into part of
      // its parent, or it stops being independently pickable and draggable.
      [...n.children].forEach((c) => {
        if (c instanceof HTMLElement && /^(UL|OL)$/.test(c.tagName)) walk(c);
      });
    });
  };
  walk(prose);
  return units;
}

/**
 * A unit's OWN row, excluding anything nested inside it. A parent bullet's
 * bounding box swallows its sub-bullets, so hit-testing and hover would always
 * resolve to the parent; measuring down to where the nested list begins keeps
 * every row independently targetable.
 */
function unitRect(el: HTMLElement): DOMRect {
  const r = el.getBoundingClientRect();
  const nested = [...el.children].find(
    (c) => c instanceof HTMLElement && /^(UL|OL)$/.test(c.tagName)
  ) as HTMLElement | undefined;
  if (!nested) return r;
  const n = nested.getBoundingClientRect();
  return new DOMRect(r.left, r.top, r.width, Math.max(0, n.top - r.top));
}

const EDGE_ZONE = 56;

/**
 * Scroll a pane while a pointer sits near its edge, so a drag or a lasso can
 * reach content past the fold. Returns the distance actually scrolled.
 *
 * Speed is per SECOND, scaled by how deep into the edge zone the pointer is,
 * and multiplied by real elapsed time rather than assuming a steady tick. A
 * held pointer produces no events to ride on, so this runs off a timer — and
 * timers get throttled hard in background tabs and embedded web views. Pacing
 * by the clock means a throttled tick still travels the right distance instead
 * of crawling. `dt` is clamped so returning from a long stall doesn't lurch.
 */
function edgeScroll(
  pane: Element | null | undefined,
  clientY: number,
  dtMs: number
): number {
  if (!pane) return 0;
  const r = pane.getBoundingClientRect();
  let dir = 0;
  let depth = 0;
  if (clientY < r.top + EDGE_ZONE) {
    dir = -1;
    depth = (r.top + EDGE_ZONE - clientY) / EDGE_ZONE;
  } else if (clientY > r.bottom - EDGE_ZONE) {
    dir = 1;
    depth = (clientY - (r.bottom - EDGE_ZONE)) / EDGE_ZONE;
  }
  if (!dir) return 0;
  const pxPerSecond = 150 + Math.min(1, Math.max(0, depth)) * 900;
  const before = pane.scrollTop;
  pane.scrollTop += dir * pxPerSecond * (Math.min(dtMs, 120) / 1000);
  return pane.scrollTop - before;
}

// "Units" are what picking operates on: list items count individually (like
// Notion), everything else is the top-level block.
const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

function unitStartPos($p: ResolvedPos): number {
  for (let d = $p.depth; d >= 1; d -= 1) {
    const name = $p.node(d).type.name;
    if (name === "listItem" || name === "taskItem") return $p.before(d);
  }
  // Depth 0 = a top-level boundary. Atom blocks (bookmark cards) resolve
  // here, since they have no interior for posAtDOM to land in.
  return $p.depth >= 1 ? $p.before(1) : $p.pos;
}

function unitEndPos($p: ResolvedPos): number {
  for (let d = $p.depth; d >= 1; d -= 1) {
    const name = $p.node(d).type.name;
    if (name === "listItem" || name === "taskItem") return $p.after(d);
  }
  if ($p.depth >= 1) return $p.after(1);
  // Top-level boundary: the unit is the node that FOLLOWS it. Returning the
  // boundary itself made from === to, and the empty deleteRange aborted the
  // whole drop chain — atom blocks silently refused to move.
  return $p.pos + ($p.nodeAfter?.nodeSize ?? 0);
}

/**
 * A list must keep at least one item, so deleting a range that covers ALL of
 * a list's items silently regenerates an empty item instead of removing the
 * list. When the range spans a whole list, widen it to take the list node
 * itself (repeating upward for nested lists).
 */
function expandListBounds(
  doc: PMNode,
  from: number,
  to: number
): { from: number; to: number } {
  for (;;) {
    const $f = doc.resolve(from);
    const d = $f.depth;
    if (d < 1 || !LIST_TYPES.has($f.node(d).type.name)) break;
    if ($f.index(d) !== 0 || to !== $f.after(d) - 1) break;
    from = $f.before(d);
    to = $f.after(d);
  }
  return { from, to };
}

/** The picked range, when one exists. Null means "just a text selection". */
type PickRange = { from: number; to: number } | null;
export const pickKey = new PluginKey<PickRange>("blockPick");

/** Every row the picked range covers, outermost first — a fully covered parent
 *  bullet is drawn as one block rather than boxing each of its children. */
function pickedRows(doc: PMNode, from: number, to: number): Decoration[] {
  const attrs = { class: "block-selected" };
  const decos: Decoration[] = [];

  const walk = (parent: PMNode, parentStart: number) => {
    let pos = parentStart;
    parent.forEach((child) => {
      const start = pos;
      const end = pos + child.nodeSize;
      pos = end;
      if (end <= from || start >= to) return;

      const name = child.type.name;
      if (LIST_TYPES.has(name)) {
        walk(child, start + 1);
        return;
      }
      if (name === "listItem" || name === "taskItem") {
        // Wholly inside the range: one box around the item and its children.
        // Only partly inside: descend, so the covered rows light up alone.
        if (start >= from && end <= to) decos.push(Decoration.node(start, end, attrs));
        else walk(child, start + 1);
        return;
      }
      decos.push(Decoration.node(start, end, attrs));
    });
  };

  walk(doc, 0);
  return decos;
}

/**
 * Block picking is EXPLICIT state, not something inferred from the selection.
 *
 * It used to be derived: any text selection spanning two units became a block
 * pick. That made ordinary editing impossible — dragging a highlight from the
 * end of one line into the next silently turned into a block selection instead
 * of highlighting text. Now only the grip and the lasso set a pick, and any
 * selection change or edit clears it, so text drags inside the prose stay
 * exactly what they look like.
 */
const BlockPick = Extension.create({
  name: "blockPick",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pickKey,
        state: {
          init: (): PickRange => null,
          apply(tr, value: PickRange): PickRange {
            const meta = tr.getMeta(pickKey);
            if (meta !== undefined) return meta as PickRange;
            if (!value) return null;
            // Moving the caret or editing ends the pick.
            if (tr.selectionSet || tr.docChanged) return null;
            return value;
          },
        },
        props: {
          decorations(state) {
            const range = pickKey.getState(state);
            if (!range || state.doc.childCount === 0) return null;
            return DecorationSet.create(
              state.doc,
              pickedRows(state.doc, range.from, range.to)
            );
          },
        },
      }),
    ];
  },
});
/**
 * Keyboard block operations, Notion-style: ⌘⇧↑ / ⌘⇧↓ move the current unit
 * (or every unit the selection touches) past its neighbor; ⌘D duplicates it
 * in place. Works from a caret, a text selection, or a picked block.
 */
const BlockKeys = Extension.create({
  name: "blockKeys",
  addKeyboardShortcuts() {
    const bounds = (editor: Editor) => {
      const { doc, selection } = editor.state;
      if (doc.childCount === 0) return null;
      const $f = doc.resolve(selection.from);
      const $l = doc.resolve(Math.max(selection.from, selection.to - 1));
      return { start: unitStartPos($f), end: unitEndPos($l) };
    };

    const move =
      (dir: -1 | 1) =>
      ({ editor }: { editor: Editor }) => {
        const b = bounds(editor);
        if (!b) return false;
        const { state, view } = editor;
        const { doc, selection } = state;
        const neighbor =
          dir < 0 ? doc.resolve(b.start).nodeBefore : doc.resolve(b.end).nodeAfter;
        if (!neighbor) return false;
        const slice = doc.slice(b.start, b.end);
        const dest = dir < 0 ? b.start - neighbor.nodeSize : b.start + neighbor.nodeSize;
        let tr = state.tr.delete(b.start, b.end).insert(dest, slice.content);
        const $a = tr.doc.resolve(
          Math.min(dest + (selection.from - b.start), tr.doc.content.size)
        );
        const $b = tr.doc.resolve(
          Math.min(dest + (selection.to - b.start), tr.doc.content.size)
        );
        tr = tr.setSelection(TextSelection.between($a, $b));
        view.dispatch(tr.scrollIntoView());
        return true;
      };

    const duplicate = ({ editor }: { editor: Editor }) => {
      const b = bounds(editor);
      if (!b) return false;
      const { state, view } = editor;
      const slice = state.doc.slice(b.start, b.end);
      view.dispatch(state.tr.insert(b.end, slice.content).scrollIntoView());
      return true;
    };

    return {
      "Mod-Shift-ArrowUp": move(-1),
      "Mod-Shift-ArrowDown": move(1),
      "Mod-d": duplicate,
    };
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
  Copy,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Trash2,
  Type,
} from "lucide-react";
import { toEditorHtml } from "@/lib/richtext";
import { Indent } from "@/lib/indent";
import { Bookmark } from "./BookmarkView";
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
  // Tears down an in-flight block drag if the editor unmounts under it.
  const dragCleanupRef = useRef<(() => void) | null>(null);
  // The grip's block menu (Turn into / Duplicate / Delete), opened on grip click.
  const [gripMenu, setGripMenu] = useState<{ top: number; left: number } | null>(
    null
  );
  // True while a block pick is active (grip or lasso), which is what hides the
  // character selection. Ordinary text drags never set it.
  const [picked, setPicked] = useState(false);
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

  const editor = useEditor({
    // Next renders this on the server first; let the client mount it.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Plain click opens the link (Notion behaviour). Editing around a
        // link still works — click beside it, or arrow into it.
        link: {
          openOnClick: true,
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
        },
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
      Bookmark,
      BlockKeys,
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
      handlePaste: (view, event) => {
        const files = [...(event.clipboardData?.items ?? [])]
          .filter((it) => it.type.startsWith("image/"))
          .map((it) => it.getAsFile())
          .filter((f): f is File => f !== null);
        if (files.length && onImagePaste) return onImagePaste(files);

        // A bare URL pasted onto an EMPTY line becomes a bookmark card.
        // Pasted into text it stays an inline link, so writing around links
        // is never hijacked. Only at the top level (or inside a toggle) —
        // swapping a list item's paragraph for a card would break the list.
        const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
        if (/^https?:\/\/\S+$/.test(text)) {
          const { $from, empty } = view.state.selection;
          const parentName = $from.depth > 1 ? $from.node($from.depth - 1).type.name : "doc";
          const emptyLine =
            empty &&
            $from.parent.type.name === "paragraph" &&
            $from.parent.content.size === 0 &&
            (parentName === "doc" || parentName === "detailsContent");
          const type = view.state.schema.nodes.bookmark;
          if (emptyLine && type) {
            const from = $from.before($from.depth);
            const to = $from.after($from.depth);
            view.dispatch(
              view.state.tr.replaceRangeWith(from, to, type.create({ url: text }))
            );
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // The editor is deliberately uncontrolled, but migration (and other outside
  // writers) can rewrite a section AFTER its editor mounted. While unfocused,
  // adopt outside changes; while typing, the editor owns the document.
  useEffect(() => {
    if (!editor || editor.isDestroyed || editor.isFocused) return;
    const want = toEditorHtml(content);
    if ((editor.isEmpty && !want) || editor.getHTML() === want) return;
    editor.commands.setContent(want);
  }, [editor, content]);

  // Same for the ghost placeholder: swap the live option and repaint, so a
  // migrated-in placeholder shows without remounting (which would drop focus).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const ext = editor.extensionManager.extensions.find(
      (x) => x.name === "placeholder"
    );
    const want = placeholder ?? "Write here…  press / for blocks";
    const opts = ext?.options as { placeholder?: string } | undefined;
    if (opts && opts.placeholder !== want) {
      opts.placeholder = want;
      editor.view.dispatch(editor.state.tr);
    }
  }, [editor, placeholder]);

  /** While blocks are picked (the BlockPick decoration paints them), hide the
   *  native character selection so the pick reads as objects, never as
   *  highlighted text. */
  useEffect(() => {
    const prose = wrapRef.current?.querySelector(".cf-prose");
    if (!prose) return;
    prose.classList.toggle("ProseMirror-hideselection", picked);
  }, [picked, editor]);

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
    (
      e: Pick<MouseEvent, "clientX" | "clientY" | "altKey" | "button"> & {
        preventDefault(): void;
        stopPropagation(): void;
      },
      originUnit: HTMLElement,
      origin: "grip" | "block"
    ) => {
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

      // Serialize NOW, while every unit is still attached. ProseMirror's DOM
      // observer can redraw rows mid-drag and orphan these references, so
      // nothing after this point may rely on units[] still being in the tree.
      const parts = units.map((rawEl) => {
        // Node views wrap their markup in a `react-renderer` shell that has no
        // parse rule; serialize the real element inside it instead.
        const el =
          rawEl.classList.contains("react-renderer") &&
          rawEl.firstElementChild instanceof HTMLElement
            ? rawEl.firstElementChild
            : rawEl;
        const clone = el.cloneNode(true) as HTMLElement;
        clone.classList.remove("block-selected");
        clone
          .querySelectorAll("br.ProseMirror-trailingBreak")
          .forEach((br) => br.remove());
        const parent = el.parentElement;
        const isLi = el.tagName === "LI" && !!parent;
        return {
          isLi,
          html: clone.outerHTML,
          listEl: isLi ? parent : null, // identity only, for grouping
          listTag: isLi ? parent!.tagName : "",
          listAttrs: isLi
            ? [...parent!.attributes]
                .filter((a) => a.name !== "class")
                .map((a) => [a.name, a.value] as const)
            : [],
          // The item's real number, so a dragged "2." doesn't preview as "1."
          listStart:
            isLi && parent!.tagName === "OL"
              ? [...parent!.children].indexOf(el) +
                (parseInt(parent!.getAttribute("start") ?? "1", 10) || 1)
              : 1,
        };
      });
      type Part = (typeof parts)[number];

      /** Rebuild HTML for the moved units: consecutive items from the same
       *  source list get one shared list wrapper; loose items get their own. */
      const buildHtml = (
        arr: Part[],
        opts: { intoList: boolean; keepNumbering: boolean }
      ) => {
        const out: string[] = [];
        let i = 0;
        while (i < arr.length) {
          const p = arr[i];
          if (!p.isLi || opts.intoList) {
            out.push(p.html);
            i += 1;
            continue;
          }
          const listWrap = document.createElement(p.listTag);
          p.listAttrs.forEach(([n, v]) => listWrap.setAttribute(n, v));
          if (opts.keepNumbering && p.listStart > 1) {
            listWrap.setAttribute("start", String(p.listStart));
          }
          let inner = "";
          while (i < arr.length && arr[i].isLi && arr[i].listEl === p.listEl) {
            inner += arr[i].html;
            i += 1;
          }
          listWrap.innerHTML = inner;
          out.push(listWrap.outerHTML);
        }
        return out.join("");
      };
      const unitSet = new Set<Element>(units);

      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const ghostW = Math.min(420, units[0].offsetWidth || 320);
      let lifted = false;
      let ghost: HTMLElement | null = null;
      let line: HTMLElement | null = null;
      let dim: HTMLElement | null = null;
      let target: { ed: Editor; pos: number } | null = null;

      // The source rows dim while the drag is in flight — via an overlay, the
      // same trick as the lasso glow, because adding a class to the editor's
      // own DOM makes ProseMirror redraw (and replace) the row.
      const drawDim = () => {
        if (!dim) {
          dim = document.createElement("div");
          dim.className = "cf-lasso-paint";
          document.body.appendChild(dim);
        }
        dim.innerHTML = "";
        units.forEach((u) => {
          if (!u.isConnected) return;
          const r = unitRect(u);
          const b = document.createElement("div");
          b.className = "cf-drag-dim";
          b.style.left = `${r.left - 4}px`;
          b.style.top = `${r.top - 2}px`;
          b.style.width = `${r.width + 8}px`;
          b.style.height = `${r.height + 4}px`;
          dim!.appendChild(b);
        });
      };

      const lift = () => {
        lifted = true;
        ghost = document.createElement("div");
        ghost.className = "cf-drag-ghost";
        ghost.style.position = "fixed";
        ghost.style.width = `${ghostW}px`;
        // List items keep their list wrapper (and number) in the preview, so
        // a dragged "2." looks like "2.", not an orphaned bullet.
        ghost.innerHTML = buildHtml(parts.slice(0, 4), {
          intoList: false,
          keepNumbering: true,
        });
        if (units.length > 4) {
          const more = document.createElement("div");
          more.className = "cf-ghost-more";
          more.textContent = `+${units.length - 4} more`;
          ghost.appendChild(more);
        }
        ghost.classList.toggle("cf-copying", copying);
        if (copying) document.body.style.cursor = "copy";
        document.body.style.userSelect = "none";
        document.body.appendChild(ghost);
        line = document.createElement("div");
        line.className = "cf-drop-line";
        document.body.appendChild(line);
        drawDim();
      };

      let lastX = startX;
      let lastY = startY;

      /** Reposition the ghost and re-resolve the drop target for the current
       *  pointer — called on every move, and again after auto-scroll shifts
       *  the boxes under a stationary pointer. */
      const update = (cx: number, cy: number) => {
        ghost!.style.left = `${cx + 14}px`;
        ghost!.style.top = `${cy + 10}px`;
        drawDim();

        target = null;
        line!.style.display = "none";
        const under = document.elementFromPoint(cx, cy);
        // Anywhere inside a writing box counts — the gutter and padding around
        // the text must not be a drop dead-zone.
        const destProse =
          under?.closest?.(".cf-prose") ??
          under?.closest?.(".rich-editor")?.querySelector(".cf-prose");
        if (!destProse) return;
        const destEd = editorByDom.get(destProse);
        if (!destEd) return;

        const destUnits = domUnits(destProse).filter((u) => !unitSet.has(u));
        const pr = destProse.getBoundingClientRect();
        let gapY = pr.top + 4;
        let pos: number | null = null;
        for (const u of destUnits) {
          const r = unitRect(u);
          if (cy < r.top + r.height / 2) {
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
          gapY = lastU ? unitRect(lastU).bottom + 2 : pr.top + 6;
          pos = destEd.state.doc.content.size;
        }
        target = { ed: destEd, pos };
        line!.style.display = "block";
        line!.style.left = `${pr.left}px`;
        line!.style.width = `${pr.width}px`;
        line!.style.top = `${gapY}px`;
      };

      // Auto-scroll: a lifted drag near the top or bottom edge of the
      // scrolling pane scrolls it, so blocks can travel to boxes beyond the
      // fold without abandoning the drag. Driven by BOTH the rAF loop (keeps
      // scrolling while the pointer parks in the zone) and each mousemove
      // (covers environments that throttle rAF).
      const srcPane = wrapRef.current?.closest(".modal-sections, .script-pane");
      let lastDragTick = performance.now();
      const dragEdgeScroll = () => {
        const now = performance.now();
        const dt = now - lastDragTick;
        lastDragTick = now;
        if (!lifted) return;
        const under = document.elementFromPoint(lastX, lastY);
        const pane =
          under?.closest?.(".modal-sections, .script-pane") ?? srcPane;
        if (edgeScroll(pane, lastY, dt)) update(lastX, lastY);
      };

      const onMove = (ev: PointerEvent) => {
        lastX = ev.clientX;
        lastY = ev.clientY;
        if (!lifted) {
          if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4)
            return;
          lift();
        }
        setCopying(ev.altKey);
        update(lastX, lastY);
        dragEdgeScroll();
      };

      // While a drag is in flight, the page must not scroll under the finger
      // (touch) and text must not get swept into a selection (mouse).
      const blockTouchScroll = (ev: TouchEvent) => {
        if (lifted) ev.preventDefault();
      };

      // Timer rather than rAF for the same reason as the lasso: the pointer is
      // often held still at the edge, and rAF is suspended in some embedded views.
      const raf = window.setInterval(dragEdgeScroll, 16);

      // Option-drag copies instead of moves (Notion/Finder convention). The
      // flag follows the key live, so pressing or releasing ⌥ mid-drag flips
      // the ghost's "+" badge and the cursor immediately.
      let copying = e.altKey;
      const setCopying = (c: boolean) => {
        if (copying === c) return;
        copying = c;
        ghost?.classList.toggle("cf-copying", c);
        document.body.style.cursor = c ? "copy" : "";
      };

      const cleanup = () => {
        window.clearInterval(raf);
        ghost?.remove();
        line?.remove();
        dim?.remove();
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("touchmove", blockTouchScroll);
        window.removeEventListener("keydown", onKey, true);
        window.removeEventListener("keyup", onKeyUp);
        dragCleanupRef.current = null;
      };

      const onCancel = () => {
        target = null;
        cleanup();
      };

      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") {
          // Consume it: cancelling a drag must not also close the modal.
          ev.stopPropagation();
          ev.preventDefault();
          target = null;
          cleanup();
        }
        if (ev.key === "Alt") setCopying(true);
      };

      const onKeyUp = (ev: KeyboardEvent) => {
        if (ev.key === "Alt") setCopying(false);
      };

      const onUp = (ev: MouseEvent) => {
        const t = target;
        const wasLifted = lifted;
        cleanup();

        if (!wasLifted) {
          // A plain click: the grip picks the row AND opens the block menu;
          // a picked row takes the caret.
          if (origin === "grip") {
            try {
              const pos = editor.view.posAtDOM(originUnit, 0);
              const $p = editor.state.doc.resolve(pos);
              const sel = NodeSelection.create(editor.state.doc, unitStartPos($p));
              editor.view.dispatch(editor.state.tr.setSelection(sel));
              editor.view.focus();
              const r = originUnit.getBoundingClientRect();
              setGripMenu({
                top: Math.min(r.bottom + 6, window.innerHeight - 336),
                left: Math.max(8, Math.min(r.left, window.innerWidth - 232)),
              });
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

        // List items stay raw when dropping into a list (they join it);
        // otherwise they get their list wrapper back. Built from the HTML
        // captured at mousedown — the live rows may be orphaned twins by now.
        const $t = t.ed.state.doc.resolve(
          Math.min(t.pos, t.ed.state.doc.content.size)
        );
        const intoList = LIST_TYPES.has($t.parent.type.name);
        const html = buildHtml(parts, { intoList, keepNumbering: false });

        // ⌥ at release = duplicate: insert at the drop gap, keep the source.
        const copy = ev.altKey || copying;
        if (copy) {
          t.ed.chain().focus().insertContentAt(t.pos, html).run();
          return;
        }

        const del = expandListBounds(editor.state.doc, from, to);
        if (t.ed === editor) {
          let insertPos = t.pos;
          if (insertPos >= del.to) insertPos -= del.to - del.from;
          else if (insertPos > del.from) return; // dropped inside the dragged range
          editor
            .chain()
            .focus()
            .deleteRange(del)
            .insertContentAt(insertPos, html)
            .run();
        } else {
          t.ed.chain().focus().insertContentAt(t.pos, html).run();
          editor.commands.deleteRange(del);
        }
      };

      // Pointer events cover mouse AND touch with one set of listeners.
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("touchmove", blockTouchScroll, { passive: false });
      // Capture phase: the drag's Escape wins over the modal's close-on-Escape.
      window.addEventListener("keydown", onKey, true);
      window.addEventListener("keyup", onKeyUp);
      dragCleanupRef.current = cleanup;
    },
    [editor]
  );

  // If this editor unmounts mid-drag (modal closed, section switched), tear
  // the drag down — otherwise the ghost and window listeners outlive it.
  useEffect(
    () => () => {
      dragCleanupRef.current?.();
    },
    []
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

      // Every editor in the pane hears this mousedown; exactly ONE may own the
      // lasso. Presses inside a box belong to that box; presses in the pane's
      // empty space belong to the vertically nearest box. Each instance runs
      // the same arithmetic, so they all agree without coordinating.
      const myBlock = wrapRef.current?.closest(".section-block");
      const pressedBlock = target.closest(".section-block");
      if (pressedBlock) {
        if (pressedBlock !== myBlock) return;
      } else if (myBlock) {
        const host = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
        const blocks = host
          ? [...host.querySelectorAll(".section-block")].filter((b) =>
              b.querySelector(".cf-prose")
            )
          : [myBlock];
        let best: Element | null = null;
        let bestDist = Infinity;
        for (const b of blocks) {
          const r = b.getBoundingClientRect();
          const d =
            e.clientY < r.top
              ? r.top - e.clientY
              : e.clientY > r.bottom
                ? e.clientY - r.bottom
                : 0;
          if (d < bestDist) {
            bestDist = d;
            best = b;
          }
        }
        if (best !== myBlock) return;
      }

      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      let moved = false;

      // Hit-testing operates on "units": list items individually, otherwise
      // the top-level block — matching how picking and Notion treat rows.
      const blocksIn = (top: number, bottom: number) =>
        domUnits(proseEl).filter((el) => {
          const r = unitRect(el);
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
          const r = unitRect(el);
          const b = document.createElement("div");
          b.className = "cf-lasso-box";
          b.style.left = `${r.left - 6}px`;
          b.style.top = `${r.top - 2}px`;
          b.style.width = `${r.width + 12}px`;
          b.style.height = `${r.height + 4}px`;
          hi!.appendChild(b);
        });
      };

      // The box is anchored to the document, not the viewport, so it keeps
      // covering the same content while the pane scrolls under it.
      const pane = wrapRef.current?.closest(".modal-sections, .script-pane");
      let scrolled = 0;
      let lastX = startX;
      let lastY = startY;

      const draw = () => {
        const top = Math.min(startY - scrolled, lastY);
        const bottom = Math.max(startY - scrolled, lastY);
        setLasso({
          left: Math.min(startX, lastX),
          top,
          width: Math.abs(lastX - startX),
          height: bottom - top,
        });
        if (moved) paint(blocksIn(top, bottom));
      };

      const onMove = (ev: MouseEvent) => {
        lastX = ev.clientX;
        lastY = ev.clientY;
        if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) {
          moved = true;
        }
        draw();
        scrollStep();
      };

      // Dragging to the top or bottom edge scrolls the pane, so a selection can
      // run past what's on screen. The anchor shifts by however far we scroll,
      // keeping the box over the same content it started on.
      //
      // A timer, not requestAnimationFrame: the pointer is typically HELD
      // still at the edge, so there are no move events to ride on, and rAF is
      // throttled or suspended in some embedded browser views.
      let lastTick = performance.now();
      const scrollStep = () => {
        const now = performance.now();
        const dt = now - lastTick;
        lastTick = now;
        if (!moved) return;
        const movedBy = edgeScroll(pane, lastY, dt);
        if (movedBy) {
          scrolled += movedBy;
          draw();
        }
      };
      const scrollTimer = window.setInterval(scrollStep, 16);

      const onUp = () => {
        window.clearInterval(scrollTimer);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setLasso(null);
        hi?.remove(); // clear the preview; the real pick takes over

        // A plain gutter click selects nothing — only the grip or a real
        // lasso drag picks blocks. Text clicks stay normal editing.
        if (!moved) return;

        const hits = blocksIn(
          Math.min(startY - scrolled, lastY),
          Math.max(startY - scrolled, lastY)
        );
        if (!hits.length) return;

        // Snap outward to whole rows, then set BOTH the text selection (so
        // copy / delete / Tab act on the range natively) and the explicit pick
        // (which is what draws the boxes). One transaction, so the pick isn't
        // immediately cleared by its own selection change.
        try {
          const view = editor.view;
          const doc = editor.state.doc;
          const first = doc.resolve(view.posAtDOM(hits[0], 0));
          const last = doc.resolve(view.posAtDOM(hits[hits.length - 1], 0));
          const from = unitStartPos(first);
          const to = unitEndPos(last);
          const tr = editor.state.tr
            .setSelection(
              TextSelection.create(doc, Math.min(from + 1, to - 1), to - 1)
            )
            .setMeta(pickKey, { from, to });
          view.dispatch(tr);
          view.focus();
        } catch {
          /* position lookup can fail mid-edit */
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [editor]
  );

  // ONE listener per editor, on the outermost host: the scrolling pane when
  // there is one (so lassos can start from empty space between boxes), else
  // the section block. Listening on both would run this handler twice per
  // press — the ownership check in startLasso keeps pane-level presses fair.
  useEffect(() => {
    const host =
      wrapRef.current?.closest(".modal-sections") ??
      wrapRef.current?.closest(".script-pane") ??
      wrapRef.current?.closest(".section-block");
    if (!host) return;
    host.addEventListener("mousedown", startLasso as EventListener);
    return () =>
      host.removeEventListener("mousedown", startLasso as EventListener);
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

  // Mirror the plugin's pick state into React, so the character-selection
  // hiding and the Escape handler know when a pick is actually active.
  useEffect(() => {
    if (!editor) return;
    const sync = () => setPicked(Boolean(pickKey.getState(editor.state)));
    editor.on("transaction", sync);
    return () => {
      editor.off("transaction", sync);
    };
  }, [editor]);

  // Escape releases a block pick by collapsing the selection. Captured and
  // consumed, so deselecting never also closes the modal — the next bare
  // Escape still will, Notion-style layered escape.
  useEffect(() => {
    if (!picked || !editor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        editor.commands.setTextSelection(editor.state.selection.from);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [picked, editor]);

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

  // Refreshed after each render rather than during it: mutating a ref while
  // rendering is a rules-of-React violation. The handler only reads these on a
  // real keypress, which always lands after render and effects have run.
  useEffect(() => {
    slashRef.current = slash;
    matchesRef.current = matches;
    activeRef.current = active;
    pickRef.current = pick;
  });

  /** Keep our own grip glued to the hovered row — always available, no
   *  floating-plugin latency. */
  function onWrapMouseMove(e: ReactMouseEvent) {
    // Still on the same row as last time — nothing to do. Keeps the per-move
    // cost at one rect check instead of a full row scan.
    const cur = gripUnitRef.current;
    if (cur?.isConnected) {
      const r = unitRect(cur);
      if (e.clientY >= r.top && e.clientY <= r.bottom) return;
    }
    const prose = wrapRef.current?.querySelector(".cf-prose");
    const wr = wrapRef.current?.getBoundingClientRect();
    if (!prose || !wr) return;
    // Deepest match wins: a sub-bullet sits inside its parent's row range, and
    // hovering it must grab the sub-bullet, not the whole branch.
    const hits = domUnits(prose).filter((u) => {
      const r = unitRect(u);
      return e.clientY >= r.top && e.clientY <= r.bottom;
    });
    const hit = hits[hits.length - 1];
    if (!hit) return;
    gripUnitRef.current = hit;
    const top = unitRect(hit).top - wr.top + 2;
    setGrip((prev) => (prev && Math.abs(prev.top - top) < 1 ? prev : { top }));
  }

  /** Pressing a picked row starts the block drag before the editor can turn
   *  the press into a caret. Unpicked text is untouched — normal editing. */
  function onWrapPointerDownCapture(e: ReactPointerEvent) {
    const t = e.target as HTMLElement;
    const unit = t.closest?.(".block-selected");
    if (unit instanceof HTMLElement) beginBlockDrag(e.nativeEvent, unit, "block");
  }

  /** Touch: press-and-hold a row lifts it into a drag (the grip needs hover,
   *  which fingers don't have). A short tap or an early move stays normal
   *  tapping / scrolling. */
  function onWrapTouchStart(e: ReactTouchEvent) {
    const t = e.touches[0];
    const prose = wrapRef.current?.querySelector(".cf-prose");
    if (!t || !prose) return;
    const unit = domUnits(prose).find((u) => {
      const r = u.getBoundingClientRect();
      return t.clientY >= r.top && t.clientY <= r.bottom;
    });
    if (!unit) return;
    const sx = t.clientX;
    const sy = t.clientY;
    let dead = false;
    const abort = () => {
      dead = true;
      window.removeEventListener("touchmove", onTM);
      window.removeEventListener("touchend", abort);
      window.removeEventListener("touchcancel", abort);
    };
    const onTM = (ev: TouchEvent) => {
      const tt = ev.touches[0];
      if (!tt || Math.abs(tt.clientX - sx) > 8 || Math.abs(tt.clientY - sy) > 8)
        abort(); // finger is scrolling, not holding
    };
    window.addEventListener("touchmove", onTM, { passive: true });
    window.addEventListener("touchend", abort);
    window.addEventListener("touchcancel", abort);
    window.setTimeout(() => {
      if (dead) return;
      abort();
      navigator.vibrate?.(8);
      beginBlockDrag(
        {
          clientX: sx,
          clientY: sy,
          altKey: false,
          button: 0,
          preventDefault() {},
          stopPropagation() {},
        },
        unit,
        "block"
      );
    }, 360);
  }

  /** Grip-menu actions all operate on the currently picked block(s). */
  const menuAct = useCallback(
    (what: "duplicate" | "delete" | ((ed: Editor) => void)) => {
      if (!editor) return;
      const { doc, selection } = editor.state;
      if (typeof what === "function") {
        what(editor);
      } else {
        const $f = doc.resolve(selection.from);
        const $l = doc.resolve(Math.max(selection.from, selection.to - 1));
        const start = unitStartPos($f);
        const end = unitEndPos($l);
        if (what === "duplicate") {
          editor.view.dispatch(
            editor.state.tr.insert(end, doc.slice(start, end).content).scrollIntoView()
          );
        } else {
          const del = expandListBounds(doc, start, end);
          editor.chain().focus().deleteRange(del).run();
        }
      }
      setGripMenu(null);
    },
    [editor]
  );

  // The grip menu closes on any press outside it, and Escape closes it
  // without also closing the modal.
  useEffect(() => {
    if (!gripMenu) return;
    const onDown = (e: Event) => {
      if (!(e.target as HTMLElement).closest?.(".grip-menu")) setGripMenu(null);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setGripMenu(null);
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onEsc, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onEsc, true);
    };
  }, [gripMenu]);

  return (
    <div
      className={`rich-editor${large ? " large" : ""}`}
      ref={wrapRef}
      onMouseMove={onWrapMouseMove}
      onMouseLeave={() => {
        setGrip(null);
        gripUnitRef.current = null;
      }}
      onPointerDownCapture={onWrapPointerDownCapture}
      onTouchStart={onWrapTouchStart}
    >
      {editor && grip && (
        <button
          type="button"
          className="cf-grip"
          style={{ top: grip.top }}
          tabIndex={-1}
          title="Drag to move · click for block menu"
          onPointerDown={(e) => {
            const u = gripUnitRef.current;
            if (u) beginBlockDrag(e.nativeEvent, u, "grip");
          }}
        >
          <GripVertical size={12} />
        </button>
      )}

      {gripMenu && editor && (
        <div
          className="slash-menu grip-menu"
          style={{ top: gripMenu.top, left: gripMenu.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button className="slash-item" onClick={() => menuAct("duplicate")}>
            <span className="slash-icon">
              <Copy size={15} />
            </span>
            <span className="slash-text">
              <span className="slash-title">Duplicate</span>
              <span className="slash-hint">⌘D</span>
            </span>
          </button>
          <button className="slash-item danger" onClick={() => menuAct("delete")}>
            <span className="slash-icon">
              <Trash2 size={15} />
            </span>
            <span className="slash-text">
              <span className="slash-title">Delete</span>
            </span>
          </button>
          <div className="grip-menu-label">Turn into</div>
          {SLASH_ITEMS.filter((i) => i.title !== "Divider").map((item) => (
            <button
              key={item.title}
              className="slash-item"
              onClick={() => menuAct(item.run)}
            >
              <span className="slash-icon">{item.icon}</span>
              <span className="slash-text">
                <span className="slash-title">{item.title}</span>
              </span>
            </button>
          ))}
        </div>
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
