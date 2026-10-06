"use client";

import { useEffect, useMemo, useState } from "react";
import { Clapperboard, ExternalLink, Plus, Tag, Trash2 } from "lucide-react";
import { useProfile } from "@/lib/profile";
import { usePlanner } from "@/lib/store";
import { useTeam } from "@/lib/team";
import { recreateCardFields, recreatePipeline } from "@/lib/recreate";
import {
  allTags,
  InspoItem,
  matchesQuery,
  TAG_SUGGESTIONS,
  thumbUrlFor,
} from "@/lib/inspo";
import InspoAddDialog from "./InspoAddDialog";

/** Videos already looked up this session, so a lookup that finds nothing
 *  isn't repeated on every visit. */
const backfilled = new Set<string>();

/**
 * The inspiration library: everything you've swiped, as a wall of thumbnails.
 * One library, not separate packaging/format shelves — tags carry that
 * distinction, and an item is usually more than one thing at once.
 */
export default function InspoView({
  search,
  onOpen,
}: {
  search: string;
  onOpen: (cardId: string) => void;
}) {
  const inspo = useProfile((s) => s.inspo);
  const pipelines = useProfile((s) => s.pipelines);
  const addCard = usePlanner((s) => s.addCard);
  const viewOnly = useTeam((s) => s.role === "viewer");
  const target = recreatePipeline(pipelines);
  const updateInspo = useProfile((s) => s.updateInspo);
  const removeInspo = useProfile((s) => s.removeInspo);

  const [adding, setAdding] = useState(false);
  const [active, setActive] = useState<string[]>([]);
  const [tagging, setTagging] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Saves made while YouTube's lookup was failing came in "Untitled" with no
  // channel. Fill in whatever is missing — never overwriting a title someone
  // typed themselves.
  useEffect(() => {
    if (viewOnly) return;
    const missing = inspo
      .filter((i) => (!i.title.trim() || !i.channel) && !backfilled.has(i.videoId))
      .slice(0, 40);
    if (!missing.length) return;
    missing.forEach((i) => backfilled.add(i.videoId));
    void (async () => {
      try {
        const res = await fetch("/api/inspo/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ urls: missing.map((i) => i.url) }),
        });
        if (!res.ok) return;
        const found: { videoId?: string; title?: string; channel?: string }[] =
          (await res.json()).items ?? [];
        const byId = new Map(found.filter((f) => f.videoId).map((f) => [f.videoId!, f]));
        const latest = useProfile.getState().inspo;
        for (const m of missing) {
          const cur = latest.find((x) => x.id === m.id);
          const f = byId.get(m.videoId);
          if (!cur || !f) continue;
          const patch: { title?: string; channel?: string } = {};
          if (!cur.title.trim() && f.title) patch.title = f.title;
          if (!cur.channel && f.channel) patch.channel = f.channel;
          if (patch.title || patch.channel) updateInspo(cur.id, patch);
        }
      } catch {
        /* offline — try again next session */
      }
    })();
  }, [inspo, viewOnly, updateInspo]);

  const tags = useMemo(() => allTags(inspo), [inspo]);

  const shown = useMemo(
    () =>
      inspo.filter(
        (i) =>
          matchesQuery(i, search) &&
          (active.length === 0 || active.every((t) => i.tags.includes(t)))
      ),
    [inspo, search, active]
  );

  function toggleTag(t: string) {
    setActive((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]
    );
  }

  /** A new idea on the Long Form board with this video already pinned as
   *  its reference — then straight into it to start on your own version. */
  function recreate(item: InspoItem) {
    const card = addCard(recreateCardFields(item, target));
    onOpen(card.id);
  }

  function addTag(item: InspoItem, raw: string) {
    const clean = raw.trim();
    if (clean && !item.tags.includes(clean)) {
      updateInspo(item.id, { tags: [...item.tags, clean] });
    }
    setDraft("");
    setTagging(null);
  }

  return (
    <div className="inspo-view">
      <div className="inspo-bar">
        <button className="btn btn-amber" onClick={() => setAdding(true)}>
          <Plus size={15} /> <span className="btn-label">Add inspiration</span>
        </button>

        {tags.length > 0 && (
          <div className="inspo-filters">
            {tags.map((t) => (
              <button
                key={t}
                className={`tag-chip${active.includes(t) ? " on" : ""}`}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
            {active.length > 0 && (
              <button className="tag-chip clear" onClick={() => setActive([])}>
                Clear
              </button>
            )}
          </div>
        )}

        <span className="inspo-count t-mono">
          {shown.length}
          {shown.length !== inspo.length && ` / ${inspo.length}`}
        </span>
      </div>

      {inspo.length === 0 ? (
        <div className="inspo-empty">
          <h3>Your swipe file starts here</h3>
          <p>
            Scrolling YouTube and something catches your eye? Copy the link, hit
            Add inspiration, paste. The thumbnail and title are saved for when
            you&apos;re packaging your own video.
          </p>
          <button className="btn btn-amber" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add your first
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="inspo-empty">
          <h3>Nothing matches</h3>
          <p>Try clearing a filter or the search box.</p>
        </div>
      ) : (
        <div className="inspo-grid">
          {shown.map((it) => (
            <div className="inspo-card" key={it.id}>
              <a
                className="inspo-thumb"
                href={it.url}
                target="_blank"
                rel="noreferrer"
                title="Open on YouTube"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbUrlFor(it.videoId)} alt="" loading="lazy" />
                <span className="inspo-thumb-open">
                  <ExternalLink size={13} />
                </span>
              </a>

              {/* A textarea, not an input: the title IS the thing you're
                  studying, so it has to wrap rather than truncate. */}
              <textarea
                className="inspo-title"
                rows={2}
                value={it.title}
                placeholder="Untitled — add a title"
                onChange={(e) => updateInspo(it.id, { title: e.target.value })}
              />

              {it.channel && <div className="inspo-channel">{it.channel}</div>}

              <div className="inspo-tags">
                {it.tags.map((t) => (
                  <button
                    key={t}
                    className="tag-chip sm"
                    title="Remove tag"
                    onClick={() =>
                      updateInspo(it.id, {
                        tags: it.tags.filter((x) => x !== t),
                      })
                    }
                  >
                    {t}
                  </button>
                ))}

                {tagging === it.id ? (
                  <input
                    className="inspo-tag-input sm"
                    autoFocus
                    value={draft}
                    list="inspo-tag-list"
                    placeholder="tag…"
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => addTag(it, draft)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addTag(it, draft);
                      if (e.key === "Escape") {
                        setDraft("");
                        setTagging(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    className="tag-chip add"
                    onClick={() => {
                      setDraft("");
                      setTagging(it.id);
                    }}
                  >
                    <Tag size={10} /> tag
                  </button>
                )}
              </div>

              {!viewOnly && (
                <button
                  className="inspo-recreate"
                  onClick={() => recreate(it)}
                  title={`New idea in ${target?.name ?? "your pipeline"} with this video as its reference`}
                >
                  <Clapperboard size={13} /> Recreate this video
                </button>
              )}

              <button
                className="inspo-del"
                aria-label="Remove from library"
                onClick={() => removeInspo(it.id)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <datalist id="inspo-tag-list">
        {(tags.length ? tags : TAG_SUGGESTIONS).map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {adding && <InspoAddDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
