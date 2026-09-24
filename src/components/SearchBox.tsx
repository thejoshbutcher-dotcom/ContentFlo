"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

/** Below this width a text box only shows a few letters — use the icon instead. */
const COMPACT_BELOW = 130;

/**
 * The top-bar search. It takes whatever room the bar can spare; when that
 * gets too narrow to be useful (phones, zoomed-in screens, a busy board top
 * bar) it collapses to a magnifying-glass button. Tapping it opens the search
 * across the top bar; it tucks away again when empty and you click away.
 */
export default function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const slot = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);

  // The slot flexes with the space available (its own contents don't size
  // it), so its width is an honest measure of how much room search would get.
  useEffect(() => {
    const el = slot.current;
    if (!el) return;
    const measure = () => setCompact(el.getBoundingClientRect().width < COMPACT_BELOW);
    // ResizeObserver catches the bar changing around it (a button appearing,
    // the sidebar); the window listener and the first read cover the rest.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    const first = window.setTimeout(measure, 0);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.clearTimeout(first);
    };
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const expanded = compact && open;

  return (
    <div className={`search-slot${compact ? " compact" : ""}`} ref={slot}>
      {!compact ? (
        <div className="search-field">
          <Search size={14} className="search-icon" aria-hidden />
          <input
            className="search-input"
            placeholder="Search titles…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {value && (
            <button className="search-clear" onClick={() => onChange("")} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>
      ) : (
        <button
          className={`search-icon-btn${value ? " active" : ""}`}
          onClick={() => setOpen(true)}
          aria-label={value ? `Search: ${value}` : "Search titles"}
          title={value ? `Searching “${value}”` : "Search titles"}
        >
          <Search size={16} />
          {value && <span className="search-dot" />}
        </button>
      )}

      {expanded && (
        <div className="search-overlay">
          <Search size={15} className="search-icon" aria-hidden />
          <input
            ref={input}
            className="search-input"
            placeholder="Search titles…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => {
              if (!value) setOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" || e.key === "Enter") {
                e.currentTarget.blur();
                setOpen(false);
              }
            }}
          />
          <button
            className="search-clear"
            // Keep focus on the field while this is pressed, so blur doesn't
            // close the bar before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            aria-label="Close search"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
