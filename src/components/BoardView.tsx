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
import { STATUS_COLORS, statusesFor } from "@/lib/seed";
import { ContentCard } from "@/lib/types";
import CardItem, { CardBody } from "./CardItem";
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
}: {
  col: ColumnDef;
  cards: ContentCard[];
  groupBy: "status" | "bucket";
  onOpen: (id: string) => void;
  onAdd: (colId: string) => void;
  selected: Set<string>;
  pending: Set<string>;
  onToggleSelect: (id: string, additive: boolean) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });

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
      <div ref={setNodeRef} className={`column-cards${isOver ? " drop-hover" : ""}`}>
        {cards.map((c) => (
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
        ))}
        <button className="add-in-column" onClick={() => onAdd(col.id)}>
          + New idea
        </button>
      </div>
    </div>
  );
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
  useEffect(() => setSelected(new Set()), [view.id]);
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

  const visible = cards.filter(
    (c) =>
      (!view.filter || view.filter(c)) &&
      (!q || c.title.toLowerCase().includes(q))
  );

  const columns: ColumnDef[] =
    groupBy === "status"
      ? statusesFor(view.newCardType).map((s) => ({
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

  const cardsFor = (colId: string) =>
    visible
      .filter((c) => (groupBy === "status" ? c.status === colId : c.bucketId === colId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

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
    if (!e.over) return;
    const cardId = String(e.active.id);
    const colId = String(e.over.id);
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
    const card = addCard({
      title: "",
      contentType: view.newCardType,
      status: groupBy === "status" ? colId : "ideas",
      bucketId: groupBy === "bucket" ? colId : undefined,
    });
    onOpen(card.id);
  }

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
