"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePlanner } from "@/lib/store";
import { STATUSES, STATUS_COLORS } from "@/lib/seed";
import { ContentCard } from "@/lib/types";

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function eventColors(card: ContentCard) {
  const status = STATUSES.find((s) => s.id === card.status);
  return status ? STATUS_COLORS[status.color] : STATUS_COLORS.gray;
}

function CalEvent({
  card,
  onOpen,
}: {
  card: ContentCard;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
  });
  const colors = eventColors(card);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="cal-event"
      style={{
        background: colors.bg,
        color: colors.fg,
        opacity: isDragging ? 0.35 : 1,
      }}
      onClick={() => onOpen(card.id)}
      title={card.title}
    >
      {card.title || "Untitled"}
    </div>
  );
}

function CalCell({
  day,
  month,
  today,
  events,
  onOpen,
}: {
  day: Date;
  month: Date;
  today: Date;
  events: ContentCard[];
  onOpen: (id: string) => void;
}) {
  const dayKey = format(day, "yyyy-MM-dd");
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayKey}` });

  return (
    <div
      ref={setNodeRef}
      className={`cal-cell${!isSameMonth(day, month) ? " dim" : ""}${
        isSameDay(day, today) ? " today" : ""
      }${isOver ? " drop-day" : ""}`}
    >
      <span className="cal-daynum">{format(day, "d")}</span>
      {events.map((c) => (
        <CalEvent key={c.id} card={c} onOpen={onOpen} />
      ))}
    </div>
  );
}

export default function CalendarView({
  search,
  onOpen,
}: {
  search: string;
  onOpen: (id: string) => void;
}) {
  const cards = usePlanner((s) => s.cards);
  const updateCard = usePlanner((s) => s.updateCard);
  const [month, setMonth] = useState(() => new Date());
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const q = search.trim().toLowerCase();
  const scheduled = cards.filter(
    (c) => c.postingDate && (!q || c.title.toLowerCase().includes(q))
  );

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const today = new Date();

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;
    const overId = String(e.over.id);
    if (!overId.startsWith("day-")) return;
    updateCard(String(e.active.id), { postingDate: overId.slice(4) });
  }

  const activeCard = activeId ? cards.find((c) => c.id === activeId) : null;

  return (
    <div className="calendar-wrap">
      <div className="cal-toolbar">
        <div className="cal-month">{format(month, "MMMM yyyy")}</div>
        <button className="icon-btn" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
          <ChevronLeft size={16} />
        </button>
        <button className="icon-btn" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
          <ChevronRight size={16} />
        </button>
        <button className="btn btn-ghost" onClick={() => setMonth(new Date())}>
          Today
        </button>
        <span className="view-note">Drag a video onto a day to reschedule it</span>
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="cal-grid">
          {DOW.map((d) => (
            <div key={d} className="cal-dow">
              {d}
            </div>
          ))}
          {days.map((day) => (
            <CalCell
              key={day.toISOString()}
              day={day}
              month={month}
              today={today}
              events={scheduled.filter((c) =>
                isSameDay(new Date(c.postingDate + "T00:00:00"), day)
              )}
              onOpen={onOpen}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? (
            <div
              className="cal-event"
              style={{
                background: eventColors(activeCard).bg,
                color: eventColors(activeCard).fg,
                boxShadow: "var(--shadow-lift)",
                maxWidth: 180,
              }}
            >
              {activeCard.title || "Untitled"}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
