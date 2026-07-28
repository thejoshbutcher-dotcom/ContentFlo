import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Tab / Shift+Tab inside the editor.
 *
 * TipTap binds neither by default (Tab normally moves focus between controls),
 * which meant pressing Tab jumped to the next section instead of indenting.
 *
 * Order of preference:
 *   1. Inside a list or to-do list -> nest / un-nest the item.
 *   2. Anywhere else -> indent the block itself.
 * Both operate on every block the selection touches, so selecting several
 * blocks and pressing Tab moves them together. Tab is always swallowed so
 * focus can never escape the editor mid-write.
 */
const INDENTABLE = new Set(["paragraph", "heading", "blockquote", "codeBlock"]);
const STEP_PX = 26;
const MAX_LEVEL = 8;

export const Indent = Extension.create({
  name: "blockIndent",

  addGlobalAttributes() {
    return [
      {
        types: [...INDENTABLE],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) =>
              parseInt(el.getAttribute("data-indent") ?? "0", 10) || 0,
            renderHTML: (attrs) => {
              const level = Number(attrs.indent) || 0;
              if (!level) return {};
              return {
                "data-indent": String(level),
                style: `margin-left:${level * STEP_PX}px`,
              };
            },
          },
        },
      },
    ];
  },

  addKeyboardShortcuts() {
    const shift =
      (delta: 1 | -1) =>
      ({ editor }: { editor: Editor }) => {
        // Lists handle their own nesting.
        const listCmd = delta > 0 ? "sinkListItem" : "liftListItem";
        for (const item of ["listItem", "taskItem"] as const) {
          if (editor.can()[listCmd](item)) {
            editor.commands[listCmd](item);
            return true;
          }
        }

        // Otherwise shift the blocks in the selection.
        const { state, view } = editor;
        const { from, to } = state.selection;
        let tr = state.tr;
        let changed = false;

        state.doc.nodesBetween(from, to, (node: PMNode, pos: number) => {
          if (!INDENTABLE.has(node.type.name)) return true;
          const current = Number(node.attrs.indent) || 0;
          const next = Math.min(MAX_LEVEL, Math.max(0, current + delta));
          if (next !== current) {
            tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
            changed = true;
          }
          return false; // don't descend into an already-handled block
        });

        if (changed) view.dispatch(tr);
        // Swallow Tab either way: focus must not jump to the next section.
        return true;
      };

    return { Tab: shift(1), "Shift-Tab": shift(-1) };
  },
});
