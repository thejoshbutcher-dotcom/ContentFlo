"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useProfile } from "@/lib/profile";
import {
  allTags,
  matchesQuery,
  SectionRef,
  thumbUrlFor,
} from "@/lib/inspo";
import { newId } from "@/lib/templates";

/**
 * Browse the library from inside a card and pin references to a section —
 * the "I'm packaging this video, show me what's worked" moment, without
 * leaving the card you're working on.
 */
export default function InspoPicker({
  onPick,
  onClose,
  attached,
}: {
  onPick: (ref: SectionRef) => void;
  onClose: () => void;
  /** Video ids already on this section, shown as picked. */
  attached: string[];
}) {
  const inspo = useProfile((s) => s.inspo);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<string[]>([]);
  const [justAdded, setJustAdded] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const tags = useMemo(() => allTags(inspo), [inspo]);
  const shown = useMemo(
    () =>
      inspo.filter(
        (i) =>
          matchesQuery(i, q) &&
          (active.length === 0 || active.every((t) => i.tags.includes(t)))
      ),
    [inspo, q, active]
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="inspo-picker"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Add from inspiration library"
      >
        <div className="inspo-add-head">
          <span className="section-title">Add from inspiration</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="inspo-picker-search">
          <Search size={14} />
          <input
            autoFocus
            value={q}
            placeholder="Search titles, channels, tags…"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {tags.length > 0 && (
          <div className="inspo-filters tight">
            {tags.slice(0, 14).map((t) => (
              <button
                key={t}
                className={`tag-chip${active.includes(t) ? " on" : ""}`}
                onClick={() =>
                  setActive((cur) =>
                    cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]
                  )
                }
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {inspo.length === 0 ? (
          <div className="inspo-empty sm">
            <p>
              Your library is empty. Add inspiration from the sidebar, then pin
              it to any box here.
            </p>
          </div>
        ) : (
          <div className="inspo-picker-grid">
            {shown.map((it) => {
              const on =
                attached.includes(it.videoId) || justAdded.includes(it.videoId);
              return (
                <button
                  key={it.id}
                  className={`inspo-pick${on ? " on" : ""}`}
                  onClick={() => {
                    onPick({
                      id: newId("ref"),
                      inspoId: it.id,
                      title: it.title,
                      url: it.url,
                      thumbUrl: thumbUrlFor(it.videoId),
                      channel: it.channel,
                    });
                    setJustAdded((p) => [...p, it.videoId]);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrlFor(it.videoId)} alt="" loading="lazy" />
                  <span className="inspo-pick-title">
                    {it.title || "Untitled"}
                  </span>
                  {on && <span className="inspo-pick-on">Added</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
