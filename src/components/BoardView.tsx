"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  DndContext,
  DragEndEvent,
  DragMoveEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Trash2, TriangleAlert, X } from "lucide-react";
import { usePlanner } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { effectiveStageId } from "@/lib/pipelines";
import { STATUS_COLORS } from "@/lib/seed";
import { ContentCard } from "@/lib/types";
import { useTeam } from "@/lib/team";
import {
  applyFilters,
  placeInOrder,
  sortColumn,
  useViewPrefs,
} from "@/lib/viewPrefs";
import CardItem, { CardBody } from "./CardItem";
import FilterBar from "./FilterBar";
import { useAccounts } from "@/lib/accounts";
import { buildPaste, copyCards, useClipboardCount } from "@/lib/cardClipboard";
import { Clipboard, ClipboardPaste, CopyPlus } from "lucide-react";
import { ViewDef } from "./views";

interface ColumnDef {
  id: string;
  name: string;
  chipBg: string;
  chipFg: string;
  dot: string;
}

function Column({
  col,
  cards,
  groupBy,
  onOpen,
  onAdd,
  selected,
  pending,
  onToggleSelect,
  dropHint,
  onContext,
}: {
  col: ColumnDef;
  cards: ContentCard[];
  groupBy: "status" | "bucket";
  onOpen: (id: string) => void;
  onAdd: (colId: string) => void;
  selected: Set<string>;
  pending: Set<string>;
  onToggleSelect: (id: string, additive: boolean) => void;
  /** Where a dragged card would land in this column, when it's ordered. */
  dropHint: DropHint | null;
  onContext: (e: ReactMouseEvent, colId: string, cardId: string | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const hint = dropHint?.colId === col.id ? dropHint : null;

  return (
    <div className="column">
      <div className="column-head">
        <span
          className="status-chip"
          style={{ background: col.chipBg, color: col.chipFg }}
        >
          <span className="status-dot" style={{ background: col.dot }} />
          {col.name}
        </span>
        <span className="column-count t-mono">{cards.length}</span>
      </div>
      <div
        ref={setNodeRef}
        data-col-id={col.id}
        className={`column-cards${isOver ? " drop-hover" : ""}`}
        onContextMenu={(e) => {
          const tile = (e.target as HTMLElement).closest<HTMLElement>(".content-card[data-card-id]");
          onContext(e, col.id, tile?.dataset.cardId ?? null);
        }}
      >
        {cards.map((c) => (
          <DropSlot key={c.id} show={hint?.beforeId === c.id}>
          <CardItem
            key={c.id}
            card={c}
            onOpen={onOpen}
            showStatus={groupBy === "bucket"}
            showBucket={groupBy === "status"}
            selected={selected.has(c.id)}
            preselected={pending.has(c.id)}
            onToggleSelect={onToggleSelect}
          />
          </DropSlot>
        ))}
        {hint && hint.beforeId === null && <div className="drop-line" />}
        <button className="add-in-column" onClick={() => onAdd(col.id)}>
          + New idea
        </button>
      </div>
    </div>
  );
}

function DropSlot({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <>
      {show && <div className="drop-line" />}
      {children}
    </>
  );
}

interface DropHint {
  colId: string;
  /** Visible card it lands before; null = after the last visible card. */
  beforeId: string | null;
  afterId: string | null;
}

/** The pointer's current Y during a dnd-kit drag. */
function pointerY(e: DragMoveEvent | DragEndEvent): number | null {
  const ev = e.activatorEvent as MouseEvent | TouchEvent | null;
  if (!ev) return null;
  const startY =
    "touches" in ev ? (ev.touches[0] ?? ev.changedTouches[0])?.clientY : ev.clientY;
  return typeof startY === "number" ? startY + e.delta.y : null;
}

/** Which visible card in a column the pointer is above. */
function dropPosition(colId: string, y: number, moving: Set<string>): DropHint {
  const el = document.querySelector(`.column-cards[data-col-id="${CSS.escape(colId)}"]`);
  const tiles = el
    ? [...el.querySelectorAll<HTMLElement>(".content-card[data-card-id]")].filter(
        (t) => !moving.has(t.dataset.cardId!)
      )
    : [];
  for (const t of tiles) {
    const r = t.getBoundingClientRect();
    if (y < r.top + r.height / 2) return { colId, beforeId: t.dataset.cardId!, afterId: null };
  }
  return { colId, beforeId: null, afterId: tiles.at(-1)?.dataset.cardId ?? null };
}

interface Marquee {
  left: number;
  top: number;
  width: number;
  height: number;
}

export default function BoardView({
  view,
  search,
  onOpen,
}: {
  view: ViewDef;
  search: string;
  onOpen: (id: string) => void;
}) {
  const cards = usePlanner((s) => s.cards);
  const moveCard = usePlanner((s) => s.moveCard);
  const moveCards = usePlanner((s) => s.moveCards);
  const moveCardBucket = usePlanner((s) => s.moveCardBucket);
  const moveCardsBucket = usePlanner((s) => s.moveCardsBucket);
  const deleteCards = usePlanner((s) => s.deleteCards);
  const addCard = usePlanner((s) => s.addCard);
  const pipelines = useProfile((s) => s.pipelines);
  const buckets = useProfile((s) => s.buckets);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Cards currently inside the marquee while it's still being dragged — shown
  // with a lighter highlight, committed to `selected` on release.
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The set of cards a drag should move (captured at drag start).
  const dragGroup = useRef<string[] | null>(null);
  // Velocity-reactive tilt on the drag preview: the card leans into the
  // direction of movement and settles upright when the pointer slows.
  const [tilt, setTilt] = useState(0);
  const lastDragX = useRef(0);
  const smoothVx = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useRef(false);
  useEffect(() => {
    reducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }, []);

  // Touch needs a press-and-hold to start a drag, otherwise it hijacks scrolling
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    })
  );

  const groupBy = view.groupBy ?? "status";
  const q = search.trim().toLowerCase();

  // Clear the selection when switching boards or when Escape is pressed.
  // Switching boards adjusts state during render rather than in an effect:
  // React's own pattern for "reset when a prop changes", and it avoids
  // painting one frame with the previous board's selection still applied.
  const [selectionBoard, setSelectionBoard] = useState(view.id);
  if (selectionBoard !== view.id) {
    setSelectionBoard(view.id);
    setSelected(new Set());
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(new Set());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Delete / Backspace removes the selection (Cmd/Ctrl+Z brings it back).
  // Ignored while typing or while any dialog / card editor is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!selected.size) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable)
        return;
      if (document.querySelector(".modal-overlay")) return;
      e.preventDefault();
      deleteCards([...selected]);
      setSelected(new Set());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, deleteCards]);

  const [prefs, updatePrefs] = useViewPrefs(view.id);
  const me = useTeam((s) => s.me?.email ?? null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);

  // ————— Copy / paste (right-click, or Cmd/Ctrl+C / V) —————
  const profileId = useAccounts((s) => s.activeId);
  const roster = useTeam((s) => s.roster);
  const insertCards = usePlanner((s) => s.insertCards);
  const duplicateCards = usePlanner((s) => s.duplicateCards);
  const clipCount = useClipboardCount();
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    colId: string;
    cardIds: string[];
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  // Every card on this board, before this person's filters — what "full
  // column order" means for manual ordering and what the filter menu offers.
  const onBoard = cards.filter((c) => !view.filter || view.filter(c));
  const visible = applyFilters(
    onBoard.filter((c) => !q || c.title.toLowerCase().includes(q)),
    prefs.filters,
    { me, pipelines }
  );

  const columns: ColumnDef[] =
    groupBy === "status"
      ? (view.pipeline?.stages ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          chipBg: STATUS_COLORS[s.color].bg,
          chipFg: STATUS_COLORS[s.color].fg,
          dot: STATUS_COLORS[s.color].dot,
        }))
      : buckets.map((b) => ({
          id: b.id,
          name: b.name,
          chipBg: "#eceded",
          chipFg: "#42505e",
          dot: "#6c7a8a",
        }));

  const inColumn = (c: ContentCard, colId: string) =>
    groupBy === "status" ? effectiveStageId(c, pipelines) === colId : c.bucketId === colId;

  const cardsFor = (colId: string) =>
    sortColumn(
      visible.filter((c) => inColumn(c, colId)),
      prefs.sort,
      prefs.order[colId]
    );

  /** Every card in a column (filters ignored), in the order currently shown. */
  const fullOrder = (colId: string) =>
    sortColumn(
      onBoard.filter((c) => inColumn(c, colId)),
      prefs.sort,
      prefs.order[colId]
    ).map((c) => c.id);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function moveSelectionTo(colId: string) {
    const ids = [...selected];
    if (!ids.length) return;
    if (groupBy === "status") moveCards(ids, colId);
    else moveCardsBucket(ids, colId);
  }

  function doDelete() {
    deleteCards([...selected]);
    setSelected(new Set());
    setConfirmDelete(false);
  }

  // ————— Marquee (drag a box over empty space to select cards) —————
  function hitsInBox(x1: number, y1: number, x2: number, y2: number): Set<string> {
    const box = {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      right: Math.max(x1, x2),
      bottom: Math.max(y1, y2),
    };
    const hits = new Set<string>();
    document
      .querySelectorAll<HTMLElement>(".board .content-card[data-card-id]")
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (
          r.left < box.right &&
          r.right > box.left &&
          r.top < box.bottom &&
          r.bottom > box.top
        ) {
          hits.add(el.dataset.cardId!);
        }
      });
    return hits;
  }

  function onBoardMouseDown(e: ReactMouseEvent) {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest(".content-card") || t.closest("button, input, select, textarea, a")) {
      return;
    }
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const additive = e.metaKey || e.ctrlKey || e.shiftKey;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) {
        moved = true;
      }
      setMarquee({
        left: Math.min(startX, ev.clientX),
        top: Math.min(startY, ev.clientY),
        width: Math.abs(ev.clientX - startX),
        height: Math.abs(ev.clientY - startY),
      });
      // Live preview of what the box will select.
      if (moved) setPending(hitsInBox(startX, startY, ev.clientX, ev.clientY));
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setMarquee(null);
      setPending(new Set());
      if (!moved) {
        if (!additive) setSelected(new Set());
        return;
      }
      const hits = hitsInBox(startX, startY, ev.clientX, ev.clientY);
      setSelected((prev) => {
        const next = new Set(additive ? prev : []);
        hits.forEach((id) => next.add(id));
        return next;
      });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ————— Drag (single, or the whole selection together) —————
  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setDropHint(null);
    setActiveId(id);
    lastDragX.current = 0;
    smoothVx.current = 0;
    setTilt(0);
    if (selected.has(id) && selected.size > 1) {
      dragGroup.current = [...selected];
    } else {
      dragGroup.current = null;
      if (!selected.has(id)) setSelected(new Set());
    }
  }

  function handleDragMove(e: DragMoveEvent) {
    // Show where the card will land wherever order is up to the user: always
    // in Manual, and within its own column under any sort (dropping there
    // switches the board to Manual).
    const y = pointerY(e);
    const over = e.over ? String(e.over.id) : null;
    const ids = dragGroup.current ?? [String(e.active.id)];
    const from = cards.find((c) => c.id === String(e.active.id));
    const ordered =
      over !== null &&
      (prefs.sort === "manual" || (from !== undefined && inColumn(from, over)));
    if (!ordered || y === null) {
      setDropHint((h) => (h ? null : h));
    } else {
      const next = dropPosition(over, y, new Set(ids));
      setDropHint((h) =>
        h && h.colId === next.colId && h.beforeId === next.beforeId && h.afterId === next.afterId
          ? h
          : next
      );
    }

    if (reducedMotion.current) return;
    // Raw per-event velocity is spiky, so low-pass filter it before mapping to
    // a gentle lean; the CSS transition then glides between the filtered
    // values and a timer eases the card upright once the pointer rests.
    const vx = e.delta.x - lastDragX.current;
    lastDragX.current = e.delta.x;
    smoothVx.current = smoothVx.current * 0.75 + vx * 0.25;
    const next = Math.max(-4.5, Math.min(4.5, smoothVx.current * 0.3));
    setTilt((prev) => (Math.abs(prev - next) < 0.4 ? prev : next));
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      smoothVx.current = 0;
      setTilt(0);
    }, 120);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    setTilt(0);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    const group = dragGroup.current;
    dragGroup.current = null;
    setDropHint(null);
    if (!e.over) return;
    const cardId = String(e.active.id);
    const colId = String(e.over.id);
    const ids = group && group.length > 1 ? group : [cardId];
    const sameColumn = ids.every((id) => {
      const c = cards.find((x) => x.id === id);
      return c ? inColumn(c, colId) : false;
    });
    const y = pointerY(e);

    // Your own card order. Reordering within a column under a sort means you
    // want a different order than the sort gives: switch to Manual, keeping
    // every column exactly as it looks right now, then place the card.
    if (y !== null && (prefs.sort === "manual" || sameColumn)) {
      const pos = dropPosition(colId, y, new Set(ids));
      const switching = prefs.sort !== "manual";
      updatePrefs((p) => {
        const order = { ...p.order };
        if (switching) for (const col of columns) order[col.id] = fullOrder(col.id);
        const base = order[colId] ?? fullOrder(colId);
        order[colId] = placeInOrder(base, ids, pos.beforeId, pos.afterId);
        return { ...p, sort: "manual", order };
      });
    }
    if (sameColumn) return;

    if (group && group.length > 1) {
      if (groupBy === "status") moveCards(group, colId);
      else moveCardsBucket(group, colId);
    } else if (groupBy === "status") {
      moveCard(cardId, colId);
    } else {
      moveCardBucket(cardId, colId);
    }
  }

  function handleAdd(colId: string) {
    // From the buckets board a new idea starts in the first pipeline.
    const target = view.pipeline ?? pipelines[0];
    const card = addCard({
      title: "",
      contentType: target?.format,
      pipelineId: target?.id,
      status: groupBy === "status" ? colId : (target?.stages[0]?.id ?? "ideas"),
      bucketId: groupBy === "bucket" ? colId : undefined,
    });
    onOpen(card.id);
  }

  function openMenu(e: ReactMouseEvent, colId: string, cardId: string | null) {
    e.preventDefault();
    // Right-clicking a card that's part of the selection acts on all of them.
    const ids = cardId ? (selected.has(cardId) ? [...selected] : [cardId]) : [];
    setMenu({
      x: Math.min(e.clientX, window.innerWidth - 230),
      y: Math.min(e.clientY, window.innerHeight - 170),
      colId,
      cardIds: ids,
    });
  }

  function doCopy(ids: string[]) {
    const picked = cards.filter((c) => ids.includes(c.id));
    if (!picked.length) return;
    copyCards(picked, profileId, buckets);
    flash(
      `Copied ${picked.length === 1 ? "1 card" : `${picked.length} cards`} — right-click a column to paste, on any board or profile`
    );
  }

  function doPaste(colId: string | null) {
    const pipeline = groupBy === "status" ? view.pipeline : pipelines[0];
    if (!pipeline) return;
    const target = colId ?? columns[0]?.id ?? null;
    const pasted = buildPaste({
      pipeline,
      stageId: groupBy === "status" ? (target ?? undefined) : undefined,
      bucketId: groupBy === "bucket" ? (target ?? undefined) : undefined,
      toProfile: profileId,
      buckets,
      roster: roster.map((p) => p.email),
    });
    if (!pasted.length) return;
    insertCards(pasted);
    setSelected(new Set(pasted.map((c) => c.id)));
    const where = columns.find((c) => c.id === target)?.name;
    flash(
      `Pasted ${pasted.length === 1 ? "1 card" : `${pasted.length} cards`}${where ? ` into ${where}` : ""} · Cmd/Ctrl+Z to undo`
    );
  }

  // Keyboard: copy the selected cards, paste into the first column.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== "c" && k !== "v") return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (document.querySelector(".modal-overlay")) return;
      if (window.getSelection()?.toString()) return; // copying page text: leave it alone
      if (k === "c" && selected.size) {
        e.preventDefault();
        doCopy([...selected]);
      } else if (k === "v" && clipCount) {
        e.preventDefault();
        doPaste(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  const activeCard = activeId ? cards.find((c) => c.id === activeId) : null;
  const dragCount =
    activeId && selected.has(activeId) && selected.size > 1 ? selected.size : 1;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <FilterBar prefs={prefs} update={updatePrefs} cards={onBoard} mode="board" />
      <div className="board-scroll" onMouseDown={onBoardMouseDown}>
        <div className="board" data-tour="board">
          {columns.map((col) => (
            <Column
              key={col.id}
              col={col}
              cards={cardsFor(col.id)}
              groupBy={groupBy}
              onOpen={onOpen}
              onAdd={handleAdd}
              selected={selected}
              pending={pending}
              onToggleSelect={toggleSelect}
              dropHint={dropHint}
              onContext={openMenu}
            />
          ))}
        </div>
      </div>

      {marquee && (
        <div
          className="marquee"
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height,
          }}
        />
      )}

      {selected.size > 0 && (
        <div className="board-bulk-bar" onMouseDown={(e) => e.stopPropagation()}>
          <span className="bulk-count">{selected.size} selected</span>
          <select
            className="bulk-move-select"
            value=""
            onChange={(e) => e.target.value && moveSelectionTo(e.target.value)}
          >
            <option value="">Move to…</option>
            {columns.map((col) => (
              <option key={col.id} value={col.id}>
                {col.name}
              </option>
            ))}
          </select>
          <button className="btn btn-danger-line" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} /> <span className="btn-label">Delete</span>
          </button>
          <button
            className="bulk-clear"
            onClick={() => setSelected(new Set())}
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">
              <TriangleAlert size={26} />
            </div>
            <h3>
              Delete {selected.size} {selected.size === 1 ? "card" : "cards"}?
            </h3>
            <p>
              This removes them from every device. You can undo it with Cmd/Ctrl+Z.
            </p>
            <div className="confirm-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="btn btn-danger-solid" onClick={doDelete}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {menu && (
        <div
          className="ctx-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          role="menu"
        >
          {menu.cardIds.length > 0 && (
            <>
              <button
                role="menuitem"
                onClick={() => {
                  doCopy(menu.cardIds);
                  setMenu(null);
                }}
              >
                <Clipboard size={14} />
                {menu.cardIds.length > 1 ? `Copy ${menu.cardIds.length} cards` : "Copy card"}
                <span className="ctx-key">⌘C</span>
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  const ids = duplicateCards(menu.cardIds);
                  setSelected(new Set(ids));
                  setMenu(null);
                }}
              >
                <CopyPlus size={14} />
                Duplicate
              </button>
            </>
          )}
          <button
            role="menuitem"
            disabled={!clipCount}
            onClick={() => {
              doPaste(menu.colId);
              setMenu(null);
            }}
          >
            <ClipboardPaste size={14} />
            {clipCount
              ? `Paste ${clipCount === 1 ? "card" : `${clipCount} cards`} here`
              : "Paste here"}
            <span className="ctx-key">⌘V</span>
          </button>
          {!clipCount && menu.cardIds.length === 0 && (
            <div className="ctx-hint">Right-click a card and choose Copy first.</div>
          )}
        </div>
      )}

      {toast && <div className="board-toast">{toast}</div>}

      <DragOverlay>
        {activeCard ? (
          <div
            className="content-card drag-preview"
            style={{
              boxShadow: "var(--shadow-lift)",
              transform: `rotate(${tilt}deg) scale(1.03)`,
            }}
          >
            <CardBody card={activeCard} showBucket={groupBy === "status"} />
            {dragCount > 1 && <span className="drag-count">{dragCount}</span>}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
