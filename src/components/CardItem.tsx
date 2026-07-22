"use client";

import type { MouseEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { STATUS_COLORS, STATUSES } from "@/lib/seed";
import { useProfile } from "@/lib/profile";
import { ContentCard } from "@/lib/types";

const TYPE_CLASS: Record<string, string> = {
  "Short form": "type-short",
  "Long form": "type-long",
  Podcast: "type-podcast",
  Carousel: "type-carousel",
};

export function typeTagClass(type?: string) {
  return type ? TYPE_CLASS[type] ?? "" : "";
}

export function formatDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d
    .toLocaleDateString("en-US", { month: "short", day: "2-digit" })
    .toUpperCase();
}

export function CardBody({
  card,
  showStatus,
  showBucket,
}: {
  card: ContentCard;
  showStatus?: boolean;
  showBucket?: boolean;
}) {
  const buckets = useProfile((s) => s.buckets);
  const status = STATUSES.find((s) => s.id === card.status);
  const bucket = buckets.find((b) => b.id === card.bucketId);
  const overdue =
    card.postingDate &&
    card.status !== "posted" &&
    new Date(card.postingDate) < new Date(new Date().toDateString());

  return (
    <>
      {card.thumbnail && (
        <div className="card-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.thumbnail} alt="" />
        </div>
      )}
      <div className="card-title">{card.title || "Untitled"}</div>
      <div className="card-meta">
        {card.contentType && (
          <span className={`tag ${typeTagClass(card.contentType)}`}>
            {card.contentType}
          </span>
        )}
        {showStatus && status && (
          <span
            className="tag"
            style={{
              background: STATUS_COLORS[status.color].bg,
              color: STATUS_COLORS[status.color].fg,
              borderColor: "transparent",
            }}
          >
            {status.name}
          </span>
        )}
        {card.who && <span className="tag who">{card.who}</span>}
        {showBucket && bucket && <span className="tag">{bucket.name}</span>}
        {card.format && !showBucket && <span className="tag">{card.format}</span>}
        {card.postingDate && (
          <span className={`card-date${overdue ? " overdue" : ""}`}>
            {formatDate(card.postingDate)}
          </span>
        )}
      </div>
    </>
  );
}

export default function CardItem({
  card,
  onOpen,
  showStatus,
  showBucket,
  selected,
  preselected,
  onToggleSelect,
}: {
  card: ContentCard;
  onOpen: (id: string) => void;
  showStatus?: boolean;
  showBucket?: boolean;
  selected?: boolean;
  /** Inside the marquee mid-drag; a lighter highlight than selected. */
  preselected?: boolean;
  onToggleSelect?: (id: string, additive: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
  });

  function handleClick(e: MouseEvent) {
    // Cmd/Ctrl/Shift-click toggles selection; a plain click opens the card.
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      e.preventDefault();
      onToggleSelect?.(card.id, true);
    } else {
      onOpen(card.id);
    }
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-card-id={card.id}
      className={`content-card${isDragging ? " dragging" : ""}${
        card.thumbnail ? " has-thumb" : ""
      }${selected ? " selected" : ""}${
        preselected && !selected ? " pre-selected" : ""
      }`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(card.id);
      }}
    >
      <CardBody card={card} showStatus={showStatus} showBucket={showBucket} />
    </div>
  );
}
