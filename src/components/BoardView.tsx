"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
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
}: {
  col: ColumnDef;
  cards: ContentCard[];
  groupBy: "status" | "bucket";
  onOpen: (id: string) => void;
  onAdd: (colId: string) => void;
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
          />
        ))}
        <button className="add-in-column" onClick={() => onAdd(col.id)}>
          + New idea
        </button>
      </div>
    </div>
  );
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
  const updateCard = usePlanner((s) => s.updateCard);
  const addCard = usePlanner((s) => s.addCard);
  const buckets = useProfile((s) => s.buckets);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Touch needs a press-and-hold to start a drag, otherwise it hijacks scrolling
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    })
  );

  const groupBy = view.groupBy ?? "status";
  const q = search.trim().toLowerCase();

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

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;
    const cardId = String(e.active.id);
    const colId = String(e.over.id);
    if (groupBy === "status") {
      moveCard(cardId, colId);
    } else {
      updateCard(cardId, { bucketId: colId });
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

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="board-scroll">
        <div className="board" data-tour="board">
          {columns.map((col) => (
            <Column
              key={col.id}
              col={col}
              cards={cardsFor(col.id)}
              groupBy={groupBy}
              onOpen={onOpen}
              onAdd={handleAdd}
            />
          ))}
        </div>
      </div>
      <DragOverlay>
        {activeCard ? (
          <div className="content-card" style={{ boxShadow: "var(--shadow-lift)" }}>
            <CardBody card={activeCard} showBucket={groupBy === "status"} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
