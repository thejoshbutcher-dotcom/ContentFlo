"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Plus, Tag, Trash2 } from "lucide-react";
import { useProfile } from "@/lib/profile";
import {
  allTags,
  InspoItem,
  matchesQuery,
  TAG_SUGGESTIONS,
  thumbUrlFor,
} from "@/lib/inspo";
import InspoAddDialog from "./InspoAddDialog";

/**
 * The inspiration library: everything you've swiped, as a wall of thumbnails.
 * One library, not separate packaging/format shelves — tags carry that
 * distinction, and an item is usually more than one thing at once.
 */
export default function InspoView({ search }: { search: string }) {
  const inspo = useProfile((s) => s.inspo);
  const updateInspo = useProfile((s) => s.updateInspo);
  const removeInspo = useProfile((s) => s.removeInspo);

  const [adding, setAdding] = useState(false);
  const [active, setActive] = useState<string[]>([]);
  const [tagging, setTagging] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

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
