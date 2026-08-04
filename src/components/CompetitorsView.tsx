"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookmarkPlus,
  Check,
  ExternalLink,
  Flame,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useProfile } from "@/lib/profile";
import {
  clearSnapshot,
  Competitor,
  CompetitorSnapshot,
  CompetitorVideo,
  formatAge,
  formatDuration,
  formatViews,
  isShort,
  loadSnapshot,
  OUTLIER_MIN,
  OUTLIER_NOTE,
  OUTLIER_STRONG,
  saveSnapshot,
  thumbUrl,
  watchUrl,
} from "@/lib/competitors";
import { newId } from "@/lib/templates";

type Sort = "views" | "newest";
type Kind = "all" | "long" | "short";

/**
 * Competitor research: the channels you study, and their video walls.
 * Recent uploads sit next to all-time winners, so "what are they doing now"
 * and "what actually worked" are one screen apart.
 */
export default function CompetitorsView({ search }: { search: string }) {
  const competitors = useProfile((s) => s.competitors);
  const addCompetitor = useProfile((s) => s.addCompetitor);
  const removeCompetitor = useProfile((s) => s.removeCompetitor);

  const [openId, setOpenId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const open = competitors.find((c) => c.id === openId) ?? null;

  async function add() {
    const raw = input.trim();
    if (!raw || adding) return;
    setAdding(true);
    setError("");
    try {
      const res = await fetch("/api/competitors/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: raw }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.channelId) {
        setError(data?.error ?? "Couldn't add that channel.");
        return;
      }
      if (competitors.some((c) => c.channelId === data.channelId)) {
        setError(`${data.name} is already on your list.`);
        return;
      }
      addCompetitor({
        id: newId("comp"),
        channelId: data.channelId,
        name: data.name,
        handle: data.handle,
        subscribersText: data.subscribersText,
        videoCountText: data.videoCountText,
        addedAt: new Date().toISOString(),
      });
      setInput("");
    } catch {
      setError("Couldn't reach YouTube — try again in a moment.");
    } finally {
      setAdding(false);
    }
  }

  function drop(c: Competitor) {
    clearSnapshot(c.channelId);
    removeCompetitor(c.id);
    if (openId === c.id) setOpenId(null);
  }

  if (open) {
    return (
      <CompetitorWall
        competitor={open}
        search={search}
        onBack={() => setOpenId(null)}
      />
    );
  }

  const shown = search
    ? competitors.filter((c) =>
        `${c.name} ${c.handle ?? ""}`.toLowerCase().includes(search.toLowerCase())
      )
    : competitors;

  return (
    <div className="comp-view">
      <div className="comp-add">
        <input
          className="comp-add-input"
          value={input}
          placeholder="Paste a channel — @handle or youtube.com/@handle"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
        />
        <button className="btn btn-amber" disabled={adding || !input.trim()} onClick={() => void add()}>
          {adding ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
          <span className="btn-label">Add channel</span>
        </button>
      </div>

      {error && <div className="comp-error">{error}</div>}

      {competitors.length === 0 ? (
        <div className="comp-empty">
          <h3>Study what already works</h3>
          <p>
            Add 2–5 channels you admire in your niche. CreatorFlo pulls their
            recent uploads and their all-time most-watched videos into one wall,
            and flags the ones that beat their own average — the videos worth
            taking apart before you package your next one.
          </p>
        </div>
      ) : (
        <div className="comp-grid">
          {shown.map((c) => (
            <CompetitorCard
              key={c.id}
              competitor={c}
              onOpen={() => setOpenId(c.id)}
              onRemove={() => drop(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One channel tile — shows what's cached so the wall feels instant later. */
function CompetitorCard({
  competitor,
  onOpen,
  onRemove,
}: {
  competitor: Competitor;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const [snap, setSnap] = useState<CompetitorSnapshot | null>(null);
  useEffect(() => {
    setSnap(loadSnapshot(competitor.channelId));
  }, [competitor.channelId]);

  const best = useMemo(() => {
    if (!snap) return null;
    return [...snap.videos].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0] ?? null;
  }, [snap]);

  return (
    <div className="comp-card" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
    >
      <div className="comp-card-head">
        <span className="comp-avatar">{competitor.name.charAt(0).toUpperCase()}</span>
        <span className="comp-card-meta">
          <span className="comp-card-name">{competitor.name}</span>
          <span className="comp-card-sub">
            {competitor.subscribersText ?? competitor.handle ?? ""}
          </span>
        </span>
        <button
          className="comp-card-del"
          aria-label={`Remove ${competitor.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {best ? (
        <div className="comp-card-best">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl(best.videoId)} alt="" loading="lazy" />
          <span className="comp-card-beststat">
            Top video {formatViews(best.views)} views
          </span>
        </div>
      ) : (
        <div className="comp-card-blank">Open to pull their videos</div>
      )}
    </div>
  );
}

/** The wall: every video we know about for one channel, sortable and filterable. */
function CompetitorWall({
  competitor,
  search,
  onBack,
}: {
  competitor: Competitor;
  search: string;
  onBack: () => void;
}) {
  // Spotting a winner and saving it should be the same gesture — this is the
  // whole point of researching competitors next to your own swipe file.
  const inspo = useProfile((s) => s.inspo);
  const addInspo = useProfile((s) => s.addInspo);
  const saved = useMemo(() => new Set(inspo.map((i) => i.videoId)), [inspo]);

  const save = useCallback(
    (v: CompetitorVideo) => {
      if (saved.has(v.videoId)) return;
      addInspo([
        {
          id: newId("inspo"),
          source: "youtube",
          videoId: v.videoId,
          url: watchUrl(v.videoId),
          title: v.title,
          channel: competitor.name,
          tags: [],
          addedAt: new Date().toISOString(),
        },
      ]);
    },
    [addInspo, saved, competitor.name]
  );

  const [snap, setSnap] = useState<CompetitorSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<Sort>("views");
  const [kind, setKind] = useState<Kind>("all");

  const pull = useCallback(
    async (force: boolean) => {
      if (!force) {
        const cached = loadSnapshot(competitor.channelId);
        if (cached) {
          setSnap(cached);
          return;
        }
      }
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/competitors/videos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: competitor.channelId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.videos) {
          setError(data?.error ?? "Couldn't load that channel's videos.");
          return;
        }
        saveSnapshot(data as CompetitorSnapshot);
        setSnap(data as CompetitorSnapshot);
      } catch {
        setError("Couldn't reach YouTube — try again in a moment.");
      } finally {
        setLoading(false);
      }
    },
    [competitor.channelId]
  );

  useEffect(() => {
    void pull(false);
  }, [pull]);

  const videos = useMemo(() => {
    const all = snap?.videos ?? [];
    const q = search.trim().toLowerCase();
    const filtered = all.filter((v) => {
      if (kind === "short" && !isShort(v)) return false;
      if (kind === "long" && isShort(v)) return false;
      if (q && !v.title.toLowerCase().includes(q)) return false;
      return true;
    });
    return filtered.sort((a, b) =>
      sort === "views"
        ? (b.views ?? 0) - (a.views ?? 0)
        : (b.published ?? "").localeCompare(a.published ?? "")
    );
  }, [snap, sort, kind, search]);

  return (
    <div className="comp-view">
      <div className="comp-wall-bar">
        <button className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={15} /> <span className="btn-label">Channels</span>
        </button>
        <span className="comp-wall-title">
          {competitor.name}
          {competitor.subscribersText && (
            <span className="comp-wall-subs">
              <Users size={11} /> {competitor.subscribersText}
            </span>
          )}
        </span>

        <div className="comp-controls">
          <div className="comp-seg">
            <button className={sort === "views" ? "on" : ""} onClick={() => setSort("views")}>
              Most viewed
            </button>
            <button className={sort === "newest" ? "on" : ""} onClick={() => setSort("newest")}>
              Newest
            </button>
          </div>
          <div className="comp-seg">
            <button className={kind === "all" ? "on" : ""} onClick={() => setKind("all")}>
              All
            </button>
            <button className={kind === "long" ? "on" : ""} onClick={() => setKind("long")}>
              Long
            </button>
            <button className={kind === "short" ? "on" : ""} onClick={() => setKind("short")}>
              Short
            </button>
          </div>
          <button
            className="btn btn-ghost"
            disabled={loading}
            onClick={() => void pull(true)}
            title="Re-pull this channel from YouTube"
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            <span className="btn-label">Refresh</span>
          </button>
        </div>
      </div>

      {snap && (
        <div className="comp-statline">
          {videos.length} videos · typical upload {formatViews(snap.medianViews)} views
          {snap.shortMedianViews ? (
            <> · typical Short {formatViews(snap.shortMedianViews)}</>
          ) : null}{" "}
          · flagged past {OUTLIER_NOTE}× its format&apos;s normal
        </div>
      )}

      {error && <div className="comp-error">{error}</div>}

      {loading && !snap ? (
        <div className="comp-empty">
          <Loader2 size={22} className="spin" />
          <p>Pulling their recent uploads and all-time top videos…</p>
        </div>
      ) : videos.length === 0 && snap ? (
        <div className="comp-empty">
          <p>Nothing matches that filter.</p>
        </div>
      ) : (
        <div className="comp-wall">
          {videos.map((v) => (
            <VideoTile
              key={v.videoId}
              video={v}
              saved={saved.has(v.videoId)}
              onSave={() => save(v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VideoTile({
  video: v,
  saved,
  onSave,
}: {
  video: CompetitorVideo;
  saved: boolean;
  onSave: () => void;
}) {
  const strong = v.multiple !== null && v.multiple >= OUTLIER_STRONG;
  const mid = v.multiple !== null && v.multiple >= OUTLIER_MIN;
  const flagged = v.multiple !== null && v.multiple >= OUTLIER_NOTE;

  return (
    // Deliberately not a link: with the whole tile clickable, saving a video
    // and opening it were the same gesture. The two buttons are the only
    // things that act.
    <div className={`comp-tile${strong ? " strong" : ""}`}>
      <span className="comp-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbUrl(v.videoId)} alt="" loading="lazy" />
        {v.durationSec !== null && (
          <span className="comp-dur">{formatDuration(v.durationSec)}</span>
        )}
        {flagged ? (
          <span
            className={`comp-flag${strong ? " strong" : mid ? " mid" : ""}`}
            title={
              v.basis === "fresh"
                ? `${v.multiple}× this channel's other recent uploads — still climbing`
                : `${v.multiple}× this channel's typical views for the format`
            }
          >
            {strong && <Flame size={10} />} {v.multiple}×
            {v.basis === "fresh" && <span className="comp-flag-note">new</span>}
          </span>
        ) : (
          // Too recent to have earned its views, and no same-age uploads to
          // measure it against — say so rather than imply it underperformed.
          v.fresh &&
          v.multiple === null && (
            <span
              className="comp-flag fresh"
              title="Posted recently — too early to compare"
            >
              <Sparkles size={10} /> new
            </span>
          )
        )}
        <span className="comp-actions">
          <button
            type="button"
            className={`comp-act comp-save${saved ? " on" : ""}`}
            title={saved ? "Already in your inspiration library" : "Save to inspiration"}
            aria-label={saved ? "Saved to inspiration" : "Save to inspiration"}
            onClick={onSave}
          >
            {saved ? <Check size={14} /> : <BookmarkPlus size={14} />}
          </button>
          <a
            className="comp-act comp-open"
            href={watchUrl(v.videoId)}
            target="_blank"
            rel="noreferrer"
            title="Open on YouTube"
            aria-label="Open on YouTube"
          >
            <ExternalLink size={14} />
          </a>
        </span>
      </span>
      <span className="comp-tile-title">{v.title}</span>
      <span className="comp-tile-meta">
        {/* Shorts publish no date, so don't leave a dangling separator. */}
        {[`${formatViews(v.views)} views`, formatAge(v)].filter(Boolean).join(" · ")}
      </span>
    </div>
  );
}
