import { Extension } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import { Plugin, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { canJoin, liftTarget } from "@tiptap/pm/transform";

/**
 * Enter / Backspace in lists, the way a word processor behaves.
 *
 *  - Backspace at the start of a numbered (or bulleted / to-do) line takes its
 *    number away and leaves the line exactly where it is — still indented, so
 *    typing "- " there makes a bullet at that same level.
 *  - Backspace at the start of an un-numbered line that follows a list joins it
 *    back up: an empty line disappears (the caret lands at the end of the line
 *    above and the two halves of the list become one list again); a line with
 *    text merges into the line above.
 *  - Enter on an empty item takes its number away (same as Backspace); on an
 *    un-numbered line it starts another one, and on an empty un-numbered line
 *    it steps out one level as a numbered item.
 *  - Tab on an un-numbered line under a sub-list numbers it at that level.
 *
 * Taking a number away from the middle of a numbered list splits it in two;
 * the half below keeps counting on ("3.", not "1."), as in Word.
 *
 * Without this, Backspace at the start of a sub-item glued it onto the end of
 * the line above, and Enter-Enter between two sub-items left the rest of the
 * list restarting at "1." with nothing able to stitch it back.
 */

const ITEMS = new Set(["listItem", "taskItem"]);
const LISTS = new Set(["bulletList", "orderedList", "taskList"]);

/** Depth of the list item whose FIRST block holds the caret, at its very start. */
function itemAtStart($from: ResolvedPos): number | null {
  if ($from.parentOffset !== 0 || !$from.parent.isTextblock) return null;
  const d = $from.depth - 1;
  if (d < 1 || !ITEMS.has($from.node(d).type.name) || $from.index(d) !== 0) return null;
  return d;
}

/** Take the number off the item at depth `d`, leaving its contents in place. */
function unnumber(state: EditorState, d: number, keepIndent: boolean): Transaction | null {
  const { $from } = state.selection;
  const item = $from.node(d);
  const list = $from.node(d - 1);
  const index = $from.index(d - 1);

  const range = state.doc
    .resolve($from.before(d) + 1)
    .blockRange(state.doc.resolve($from.after(d) - 1));
  if (!range) return null;
  const target = liftTarget(range);
  if (target == null) return null;
  const tr = state.tr.lift(range, target);

  // Where the item's first line landed, and what now sits around it.
  const $p = tr.doc.resolve(tr.mapping.map($from.pos));
  const cd = $p.depth - 1;
  const container = $p.node(cd);
  const pi = $p.index(cd);

  // The items below stay numbered where they were.
  const ri = pi + item.childCount;
  if (
    list.type.name === "orderedList" &&
    index < list.childCount - 1 &&
    ri < container.childCount &&
    container.child(ri).type.name === "orderedList"
  ) {
    let pos = $p.start(cd);
    for (let i = 0; i < ri; i++) pos += container.child(i).nodeSize;
    const rest = container.child(ri);
    tr.setNodeMarkup(pos, undefined, {
      ...rest.attrs,
      start: (Number(list.attrs.start) || 1) + index,
    });
  }

  // Out at the top level the line would jump to the margin; keep it in.
  if (keepIndent && cd === 0 && "indent" in $p.parent.attrs) {
    tr.setNodeMarkup($p.before($p.depth), undefined, {
      ...$p.parent.attrs,
      indent: Math.max(1, Number($p.parent.attrs.indent) || 0),
    });
  }
  return tr;
}

/** Backspace at the start of an un-numbered line right after a list. */
function rejoin(state: EditorState): Transaction | null {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return null;
  const para = $from.parent;
  if (para.type.name !== "paragraph") return null;
  const cd = $from.depth - 1;
  const idx = $from.index(cd);
  if (idx === 0) return null;
  const prev = $from.node(cd).child(idx - 1);
  if (!LISTS.has(prev.type.name)) return null;

  const paraStart = $from.before($from.depth);
  const paraEnd = $from.after($from.depth);
  const prevStart = paraStart - prev.nodeSize;

  // The end of the last line inside the list above (however deep it sits).
  let lastEnd = -1;
  prev.descendants((n, p) => {
    if (n.isTextblock) lastEnd = prevStart + 1 + p + 1 + n.content.size;
  });
  if (lastEnd < 0) return null;

  const tr = state.tr;
  if (para.content.size) tr.insert(lastEnd, para.content);
  tr.delete(tr.mapping.map(paraStart), tr.mapping.map(paraEnd));

  // The two halves of a split list become one list again.
  const boundary = tr.mapping.map(paraStart);
  const $b = tr.doc.resolve(boundary);
  const before = $b.nodeBefore;
  const after = $b.nodeAfter;
  if (before && after && before.type === after.type && LISTS.has(before.type.name) && canJoin(tr.doc, boundary)) {
    tr.join(boundary);
  }

  tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(lastEnd, -1)));
  return tr;
}

/**
 * Tab on the FIRST item of a list that sits right under another list (a
 * bullet typed under "1. …"): there's no item above it in its own list to
 * nest under, so TipTap can't sink it — and the old fallback padded the text
 * over while the bullet stayed put. Nest it under the last item of the list
 * above instead, like Word.
 */
function nestUnderListAbove(state: EditorState): Transaction | null {
  const { $from } = state.selection;
  let d = $from.depth;
  while (d > 0 && !ITEMS.has($from.node(d).type.name)) d--;
  if (d < 2 || $from.index(d - 1) !== 0) return null;
  const list = $from.node(d - 1);
  const cd = d - 2;
  const idx = $from.index(cd);
  if (idx === 0) return null;
  const prevList = $from.node(cd).child(idx - 1);
  if (!LISTS.has(prevList.type.name) || !prevList.lastChild) return null;

  const item = $from.node(d);
  const itemStart = $from.before(d);
  const listPos = $from.before(d - 1);
  const lastItem = prevList.lastChild;
  // Join an existing sub-list of the same kind at the end of that item, or
  // start one.
  const into = lastItem.lastChild?.type === list.type;
  const ins = into ? listPos - 3 : listPos - 2;
  const node = into ? item : list.type.create(list.attrs, item);

  const tr = state.tr.insert(ins, node);
  if (list.childCount === 1) tr.delete(tr.mapping.map(listPos), tr.mapping.map(listPos + list.nodeSize));
  else tr.delete(tr.mapping.map(itemStart), tr.mapping.map($from.after(d)));
  const newItemStart = into ? ins : ins + 1;
  tr.setSelection(TextSelection.create(tr.doc, newItemStart + ($from.pos - itemStart)));
  return tr;
}

export const ListFlow = Extension.create({
  name: "listFlow",
  // Ahead of TipTap's own list keymap.
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        // Backspace right after "- " / "1. " turned a line into a list: undo that.
        if (editor.commands.undoInputRule()) return true;
        const { state, view } = editor;
        if (!state.selection.empty) return false;
        const d = itemAtStart(state.selection.$from);
        const tr = d != null ? unnumber(state, d, true) : rejoin(state);
        if (!tr) return false;
        view.dispatch(tr.scrollIntoView());
        return true;
      },
      Enter: ({ editor }) => {
        const { state, view } = editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;

        // An un-numbered line inside an item (a sub-item whose number was
        // taken away): with text, Enter starts another un-numbered line at the
        // same indent; empty, it becomes a numbered item one level up, like
        // Word — never thrown out of the list with the numbers restarting.
        const pd = $from.depth - 1;
        if (pd >= 1 && ITEMS.has($from.node(pd).type.name) && $from.index(pd) > 0) {
          if ($from.parent.content.size) {
            view.dispatch(state.tr.split($from.pos).scrollIntoView());
            return true;
          }
          const item = $from.node(pd);
          const attrs = item.type.name === "taskItem" ? { ...item.attrs, checked: false } : item.attrs;
          view.dispatch(
            state.tr.split($from.before($from.depth), 1, [{ type: item.type, attrs }]).scrollIntoView()
          );
          return true;
        }

        if ($from.parent.content.size !== 0) return false;
        const d = itemAtStart($from);
        // Items with sub-items keep TipTap's handling.
        if (d == null || $from.node(d).childCount !== 1) return false;
        const tr = unnumber(state, d, false);
        if (!tr) return false;
        view.dispatch(tr.scrollIntoView());
        return true;
      },
      // Tab on an un-numbered line right after a sub-list numbers it again at
      // that level (instead of indenting the whole item it sits in).
      Tab: ({ editor }) => {
        const { state, view } = editor;
        const { $from, empty } = state.selection;
        if (!empty || !$from.parent.isTextblock) return false;
        const cross = nestUnderListAbove(state);
        if (cross) {
          view.dispatch(cross.scrollIntoView());
          return true;
        }
        const pd = $from.depth - 1;
        if (pd < 1 || !ITEMS.has($from.node(pd).type.name) || $from.index(pd) === 0) return false;
        const prev = $from.node(pd).child($from.index(pd) - 1);
        if (!LISTS.has(prev.type.name)) return false;

        const isTask = prev.type.name === "taskList";
        const itemType = state.schema.nodes[isTask ? "taskItem" : "listItem"];
        if (!itemType) return false;
        const paraStart = $from.before($from.depth);
        const paraEnd = $from.after($from.depth);
        const item = itemType.create(isTask ? { checked: false } : null, $from.parent);

        const tr = state.tr.delete(paraStart, paraEnd).insert(paraStart - 1, item);
        const boundary = paraStart - 1 + item.nodeSize + 1;
        const $b = tr.doc.resolve(boundary);
        if ($b.nodeBefore && $b.nodeAfter && $b.nodeBefore.type === $b.nodeAfter.type && canJoin(tr.doc, boundary)) {
          tr.join(boundary);
        }
        tr.setSelection(TextSelection.create(tr.doc, paraStart - 1 + 2 + $from.parentOffset));
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      // A line indented at the top level that's then turned into a list item
      // ("- " / "1. ") would carry the indent inside the item. Items indent by
      // nesting, never by padding, so drop it.
      new Plugin({
        appendTransaction(trs, _old, state) {
          if (!trs.some((t) => t.docChanged)) return null;
          let tr: Transaction | null = null;
          state.doc.descendants((node, pos, parent) => {
            if (
              parent &&
              ITEMS.has(parent.type.name) &&
              Number(node.attrs?.indent) > 0
            ) {
              tr ??= state.tr;
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: 0 });
            }
            return true;
          });
          return tr;
        },
      }),
    ];
  },
});
