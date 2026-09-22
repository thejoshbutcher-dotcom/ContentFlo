"use client";

import type { MouseEvent } from "react";
import { MessageSquare } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { isDone, pipelineOf, stageOf } from "@/lib/pipelines";
import { openNotes } from "@/lib/review";
import { STATUS_COLORS } from "@/lib/seed";
import { useProfile } from "@/lib/profile";
import { useTeam } from "@/lib/team";
import Avatar, { Name } from "./Avatar";
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
  // Teammates with this card open — so you can see a collision coming.
  const peers = useTeam((s) => s.peers);
  const inCard = peers.filter((p) => p.cardId === card.id);
  const pipelines = useProfile((s) => s.pipelines);
  const status = stageOf(card, pipelines);
  const bucket = buckets.find((b) => b.id === card.bucketId);
  const overdue =
    card.postingDate &&
    !isDone(card, pipelines) &&
    new Date(card.postingDate) < new Date(new Date().toDateString());

  return (
    <>
      {card.thumbnail && (
        <div className="card-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.thumbnail} alt="" />
        </div>
      )}
      <div className="card-title">
        {card.title || "Untitled"}
        {inCard.length > 0 && (
          <span
            className="peer-stack in-card"
            title={`Open now: ${inCard.map((p) => p.email).join(", ")}`}
          >
            {inCard.slice(0, 2).map((p) => (
              <Avatar key={p.userId} email={p.email} size={18} />
            ))}
          </span>
        )}
      </div>
      <div className="card-meta">
        {openNotes(card.review) > 0 && (
          <span className="tag tag-notes" title="Open review notes on the latest cut">
            <MessageSquare size={10} /> {openNotes(card.review)}
          </span>
        )}
        {card.contentType && (
          <span className={`tag ${typeTagClass(card.contentType)}`}>
            {pipelineOf(card, pipelines)?.name ?? card.contentType}
          </span>
        )}
        {(card.assignees ?? []).map((email) => (
          <span key={email} className="tag tag-person" title={email}>
            <Avatar email={email} size={15} />
            <Name email={email} />
          </span>
        ))}
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
