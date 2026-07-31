"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { useProfile } from "@/lib/profile";
import {
  allTags,
  extractLinks,
  InspoItem,
  parseCollectionUrl,
  parseYouTubeId,
  TAG_SUGGESTIONS,
  thumbUrlFor,
  watchUrlFor,
} from "@/lib/inspo";
import { newId } from "@/lib/templates";

/**
 * Quick capture. Two shapes of paste, one box:
 *
 *  - Video links save immediately — you're mid-scroll on YouTube and want to
 *    be done in one motion, so there's no confirm step.
 *  - A playlist or channel link opens a checklist instead, because importing
 *    fifty videos is a decision, not a reflex. Anything already in the library
 *    is flagged and left unchecked, so re-importing the same playlist only
 *    offers what's new since last time.
 */

interface PreviewRow {
  videoId: string;
  title: string;
  channel?: string;
  known: boolean;
}

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
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
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
  const tagOptions = (existingTags.length ? existingTags : TAG_SUGGESTIONS).slice(0, 10);

  const freshCount = useMemo(
    () => (preview ?? []).filter((r) => !r.known).length,
    [preview]
  );

  /** A whole playlist / channel: show it as a checklist rather than importing blind. */
  async function loadCollection(url: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/inspo/playlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.items?.length) {
        setError(data?.error ?? "Couldn't read that playlist.");
        return;
      }
      const known = new Set(inspo.map((i) => i.videoId));
      const rows: PreviewRow[] = data.items.map(
        (i: { videoId: string; title: string; channel?: string }) => ({
          ...i,
          known: known.has(i.videoId),
        })
      );
      setPreview(rows);
      setSourceName(data.name ?? "");
      // Pre-check only what's new — re-importing a playlist should offer the
      // new arrivals, not make you hunt for them.
      setPicked(new Set(rows.filter((r) => !r.known).map((r) => r.videoId)));
      setText("");
    } catch {
      setError("Couldn't reach YouTube — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  /** Loose video links: straight in, no confirm. */
  async function submitVideos(raw: string) {
    const links = extractLinks(raw);
    const ids = links.map(parseYouTubeId);
    if (ids.every((id) => id === null)) {
      setError("That doesn't look like a YouTube link.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      let resolved: { videoId?: string; title?: string; channel?: string }[] = [];
      try {
        const res = await fetch("/api/inspo/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ urls: links }),
        });
        if (res.ok) resolved = (await res.json()).items ?? [];
      } catch {
        /* offline — the thumbnail still comes from the id alone */
      }
      const byId = new Map(resolved.filter((r) => r.videoId).map((r) => [r.videoId!, r]));
      const known = new Set(inspo.map((i) => i.videoId));

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
        items.push(makeItem(id, meta?.title, meta?.channel));
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

  function makeItem(videoId: string, title?: string, channel?: string): InspoItem {
    return {
      id: newId("inspo"),
      source: "youtube",
      videoId,
      url: watchUrlFor(videoId),
      title: title?.trim() || "",
      channel: channel?.trim() || undefined,
      tags: [],
      addedAt: new Date().toISOString(),
    };
  }

  function submit(raw: string) {
    const first = extractLinks(raw)[0] ?? "";
    if (parseCollectionUrl(first)) return void loadCollection(first);
    return void submitVideos(raw);
  }

  function importPicked() {
    const rows = (preview ?? []).filter((r) => picked.has(r.videoId));
    if (!rows.length) return;
    const items = rows.map((r) => makeItem(r.videoId, r.title, r.channel));
    addInspo(items);
    setAdded((prev) => [...items, ...prev]);
    setPreview(null);
    setPicked(new Set());
    setSourceName("");
  }

  function toggle(videoId: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }

  /** Tags typed after the fact apply to everything captured in this session. */
  function applyTag(tag: string) {
    const clean = tag.trim();
    if (!clean || !added.length) return;
    added.forEach((it) => {
      if (!it.tags.includes(clean)) updateInspo(it.id, { tags: [...it.tags, clean] });
    });
    setAdded((prev) =>
      prev.map((it) => (it.tags.includes(clean) ? it : { ...it, tags: [...it.tags, clean] }))
    );
    setTagDraft("");
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`inspo-add${preview ? " wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Add inspiration"
      >
        <div className="inspo-add-head">
          <span className="section-title">
            {preview ? sourceName || "Import playlist" : "Add inspiration"}
          </span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {!preview && (
          <>
            <textarea
              ref={inputRef}
              className="inspo-add-input"
              value={text}
              placeholder="Paste a YouTube link, playlist, or channel — playlists let you pick and import many at once"
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                const first = extractLinks(pasted)[0] ?? "";
                if (pasted && (parseYouTubeId(first) || parseCollectionUrl(first))) {
                  e.preventDefault();
                  submit(pasted);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(text);
                }
              }}
            />

            <div className="inspo-add-actions">
              <span className="inspo-add-note">
                {busy ? (
                  <>
                    <Loader2 size={13} className="spin" /> Reading YouTube…
                  </>
                ) : added.length ? (
                  <>
                    <Check size={13} /> {added.length} saved
                    {dupes > 0 && ` · ${dupes} already in library`}
                  </>
                ) : (
                  "A video saves the moment you paste · a playlist or channel opens a list to pick from"
                )}
              </span>
              <button
                className="btn btn-amber"
                disabled={busy || !text.trim()}
                onClick={() => submit(text)}
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </>
        )}

        {error && <div className="inspo-add-error">{error}</div>}

        {preview && (
          <>
            <div className="inspo-pl-bar">
              <span className="inspo-add-note">
                {freshCount} new · {preview.length - freshCount} already saved
              </span>
              <div className="inspo-pl-bulk">
                <button
                  className="tag-chip"
                  onClick={() =>
                    setPicked(new Set(preview.filter((r) => !r.known).map((r) => r.videoId)))
                  }
                >
                  Select new
                </button>
                <button
                  className="tag-chip"
                  onClick={() => setPicked(new Set(preview.map((r) => r.videoId)))}
                >
                  All
                </button>
                <button className="tag-chip" onClick={() => setPicked(new Set())}>
                  None
                </button>
              </div>
            </div>

            <div className="inspo-pl-list">
              {preview.map((r) => (
                <label
                  key={r.videoId}
                  className={`inspo-pl-row${r.known ? " known" : ""}${
                    picked.has(r.videoId) ? " on" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={picked.has(r.videoId)}
                    onChange={() => toggle(r.videoId)}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrlFor(r.videoId)} alt="" loading="lazy" />
                  <span className="inspo-pl-meta">
                    <span className="inspo-pl-title">{r.title || "Untitled"}</span>
                    {r.channel && <span className="inspo-pl-channel">{r.channel}</span>}
                  </span>
                  {r.known && <span className="inspo-pl-known">In library</span>}
                </label>
              ))}
            </div>

            <div className="inspo-add-actions">
              <button
                className="inspo-add-link"
                onClick={() => {
                  setPreview(null);
                  setPicked(new Set());
                }}
              >
                ← Back
              </button>
              <button
                className="btn btn-amber"
                disabled={picked.size === 0}
                onClick={importPicked}
              >
                <Plus size={14} /> Add {picked.size || ""} to library
              </button>
            </div>
          </>
        )}

        {!preview && added.length > 0 && (
          <>
            <div className="inspo-add-grid">
              {added.slice(0, 12).map((it) => (
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
