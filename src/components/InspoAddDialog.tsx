"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { useProfile } from "@/lib/profile";
import {
  allTags,
  extractLinks,
  InspoItem,
  parseYouTubeId,
  TAG_SUGGESTIONS,
  thumbUrlFor,
  watchUrlFor,
} from "@/lib/inspo";
import { newId } from "@/lib/templates";

/**
 * Quick capture: paste a YouTube link (or a pile of them) and it's in the
 * library. Pasting adds immediately — the whole point is that you're mid-scroll
 * on YouTube and want to be done in one motion. Tagging is offered after the
 * fact, never in the way.
 */
export default function InspoAddDialog({
  onClose,
  onGoToLibrary,
}: {
  onClose: () => void;
  onGoToLibrary?: () => void;
}) {
  const inspo = useProfile((s) => s.inspo);
  const addInspo = useProfile((s) => s.addInspo);
  const updateInspo = useProfile((s) => s.updateInspo);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<InspoItem[]>([]);
  const [dupes, setDupes] = useState(0);
  const [error, setError] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const existingTags = allTags(inspo);
  const tagOptions = (existingTags.length ? existingTags : TAG_SUGGESTIONS).slice(
    0,
    10
  );

  async function submit(raw: string) {
    const links = extractLinks(raw);
    if (!links.length) return;

    const known = new Set(inspo.map((i) => i.videoId));
    const ids = links.map(parseYouTubeId);
    if (ids.every((id) => id === null)) {
      setError("That doesn't look like a YouTube link.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      // Resolve titles server-side; if that fails the item is still worth
      // saving — the thumbnail comes from the id alone.
      let resolved: { videoId?: string; title?: string; channel?: string }[] = [];
      try {
        const res = await fetch("/api/inspo/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ urls: links }),
        });
        if (res.ok) resolved = (await res.json()).items ?? [];
      } catch {
        /* offline — fall through to id-only items */
      }

      const byId = new Map(
        resolved.filter((r) => r.videoId).map((r) => [r.videoId!, r])
      );

      const seen = new Set<string>();
      const items: InspoItem[] = [];
      let skipped = 0;
      for (const id of ids) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (known.has(id)) {
          skipped += 1;
          continue;
        }
        const meta = byId.get(id);
        items.push({
          id: newId("inspo"),
          source: "youtube",
          videoId: id,
          url: watchUrlFor(id),
          title: meta?.title?.trim() || "",
          channel: meta?.channel?.trim() || undefined,
          tags: [],
          addedAt: new Date().toISOString(),
        });
      }

      setDupes(skipped);
      if (items.length) {
        addInspo(items);
        setAdded((prev) => [...items, ...prev]);
      }
      setText("");
    } finally {
      setBusy(false);
    }
  }

  /** Tags typed after the fact apply to everything captured in this session. */
  function applyTag(tag: string) {
    const clean = tag.trim();
    if (!clean || !added.length) return;
    added.forEach((it) => {
      if (!it.tags.includes(clean)) {
        updateInspo(it.id, { tags: [...it.tags, clean] });
      }
    });
    setAdded((prev) =>
      prev.map((it) =>
        it.tags.includes(clean) ? it : { ...it, tags: [...it.tags, clean] }
      )
    );
    setTagDraft("");
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="inspo-add"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Add inspiration"
      >
        <div className="inspo-add-head">
          <span className="section-title">Add inspiration</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <textarea
          ref={inputRef}
          className="inspo-add-input"
          value={text}
          placeholder="Paste a YouTube link — or several at once"
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            if (pasted && parseYouTubeId(extractLinks(pasted)[0] ?? "")) {
              e.preventDefault();
              void submit(pasted);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit(text);
            }
          }}
        />

        <div className="inspo-add-actions">
          <span className="inspo-add-note">
            {busy ? (
              <>
                <Loader2 size={13} className="spin" /> Fetching titles…
              </>
            ) : added.length ? (
              <>
                <Check size={13} /> {added.length} saved
                {dupes > 0 && ` · ${dupes} already in library`}
              </>
            ) : (
              "Paste to add instantly"
            )}
          </span>
          <button
            className="btn btn-amber"
            disabled={busy || !text.trim()}
            onClick={() => void submit(text)}
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {error && <div className="inspo-add-error">{error}</div>}

        {added.length > 0 && (
          <>
            <div className="inspo-add-grid">
              {added.map((it) => (
                <div className="inspo-add-item" key={it.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrlFor(it.videoId)} alt="" loading="lazy" />
                  <span className="inspo-add-item-title">
                    {it.title || "Untitled — open to name it"}
                  </span>
                </div>
              ))}
            </div>

            <div className="inspo-add-tagline">
              <input
                className="inspo-tag-input"
                value={tagDraft}
                placeholder="Tag these (optional)"
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyTag(tagDraft);
                  }
                }}
              />
              {tagOptions.slice(0, 6).map((t) => (
                <button key={t} className="tag-chip" onClick={() => applyTag(t)}>
                  {t}
                </button>
              ))}
            </div>

            {onGoToLibrary && (
              <button
                className="inspo-add-link"
                onClick={() => {
                  onGoToLibrary();
                  onClose();
                }}
              >
                View library →
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
