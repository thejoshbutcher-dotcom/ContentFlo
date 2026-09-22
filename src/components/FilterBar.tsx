"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, ChevronDown, Filter, User, X } from "lucide-react";
import { useProfile } from "@/lib/profile";
import { personName, useTeam } from "@/lib/team";
import { ContentCard, Who } from "@/lib/types";
import {
  activeFilterCount,
  BOARD_SORT_LABEL,
  BoardSort,
  Filters,
  NONE,
  POSTING_LABEL,
  PostingFilter,
  ViewPrefs,
} from "@/lib/viewPrefs";

type ListKey = Exclude<keyof Filters, "mine" | "posting" | "openNotes">;

interface Option {
  value: string;
  label: string;
}

/**
 * The strip above a board or the table: "Mine", the Filter popover, and (on
 * boards) the sort menu, then a chip for every active filter. Everything here
 * is this person's own view — see viewPrefs.ts.
 */
export default function FilterBar({
  prefs,
  update,
  cards,
  mode,
}: {
  prefs: ViewPrefs;
  update: (fn: (p: ViewPrefs) => ViewPrefs) => void;
  /** The cards in scope, to offer only values that actually occur. */
  cards: ContentCard[];
  mode: "board" | "table";
}) {
  const me = useTeam((s) => s.me);
  const roster = useTeam((s) => s.roster);
  useTeam((s) => s.directory);
  const buckets = useProfile((s) => s.buckets);
  const pipelines = useProfile((s) => s.pipelines);
  const [open, setOpen] = useState<"filter" | "sort" | null>(null);
  const [more, setMore] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const f = prefs.filters;
  const setFilters = (patch: Partial<Filters>) =>
    update((p) => ({ ...p, filters: { ...p.filters, ...patch } }));
  const toggle = (key: ListKey, value: string) => {
    const cur = (f[key] as string[] | undefined) ?? [];
    setFilters({
      [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
    } as Partial<Filters>);
  };

  // Offer only values that exist, so no filter is a guaranteed empty board.
  const present = (pick: (c: ContentCard) => string | undefined): Option[] => {
    const seen = new Set<string>();
    for (const c of cards) {
      const v = pick(c);
      if (v) seen.add(v);
    }
    return [...seen].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
  };
  const withNone = (opts: Option[], has: boolean, label = "None") =>
    has ? [...opts, { value: NONE, label }] : opts;

  const groups = useMemo(() => {
    const g: { key: ListKey; title: string; options: Option[]; more?: boolean }[] = [];
    if (me && roster.length) {
      g.push({
        key: "assignees",
        title: "Assigned to",
        options: [
          ...roster.map((p) => ({ value: p.email, label: personName(p.email, me.email) })),
          { value: NONE, label: "Unassigned" },
        ],
      });
    }
    if (mode === "table") {
      g.push({
        key: "pipelines",
        title: "Pipeline",
        options: pipelines.map((p) => ({ value: p.id, label: p.name })),
      });
      const names = [...new Set(pipelines.flatMap((p) => p.stages.map((s) => s.name)))];
      g.push({ key: "statuses", title: "Status", options: names.map((n) => ({ value: n, label: n })) });
    }
    const usedBuckets = new Set(cards.map((c) => c.bucketId).filter(Boolean));
    g.push({
      key: "buckets",
      title: "Content bucket",
      options: withNone(
        buckets.filter((b) => usedBuckets.has(b.id)).map((b) => ({ value: b.id, label: b.name })),
        cards.some((c) => !c.bucketId)
      ),
    });
    g.push({
      key: "formats",
      title: "Content format",
      options: withNone(present((c) => c.format), cards.some((c) => !c.format)),
    });
    g.push({
      key: "who",
      title: "Funnel",
      more: true,
      options: withNone(
        (["TOF", "MOF", "BOF"] as Who[]).map((w) => ({ value: w, label: w })),
        cards.some((c) => !c.who)
      ),
    });
    g.push({ key: "topics", title: "Topic", more: true, options: present((c) => c.topic) });
    g.push({ key: "lenses", title: "Lens", more: true, options: present((c) => c.pillar) });
    g.push({ key: "feelings", title: "Feeling", more: true, options: present((c) => c.feeling) });
    g.push({ key: "actions", title: "Goal action", more: true, options: present((c) => c.action) });
    return g.filter((x) => x.options.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, roster, me, buckets, pipelines, mode]);

  const labelFor = (key: ListKey, value: string) =>
    groups.find((g) => g.key === key)?.options.find((o) => o.value === value)?.label ??
    (value === NONE ? "None" : value);

  const chips: { id: string; label: string; clear: () => void }[] = [];
  for (const g of groups) {
    const vals = (f[g.key] as string[] | undefined) ?? [];
    if (vals.length) {
      chips.push({
        id: g.key,
        label: `${g.title}: ${vals.map((v) => labelFor(g.key, v)).join(", ")}`,
        clear: () => setFilters({ [g.key]: [] } as Partial<Filters>),
      });
    }
  }
  if (f.posting) {
    chips.push({
      id: "posting",
      label: `Posting: ${POSTING_LABEL[f.posting]}`,
      clear: () => setFilters({ posting: undefined }),
    });
  }
  if (f.openNotes) {
    chips.push({ id: "notes", label: "Has open review notes", clear: () => setFilters({ openNotes: false }) });
  }

  const count = activeFilterCount(f);
  const main = groups.filter((g) => !g.more);
  const extra = groups.filter((g) => g.more);

  const renderGroup = (g: (typeof groups)[number]) => {
    const vals = (f[g.key] as string[] | undefined) ?? [];
    return (
      <div className="fb-group" key={g.key}>
        <div className="fb-group-title">{g.title}</div>
        <div className="fb-options">
          {g.options.map((o) => (
            <button
              key={o.value}
              className={`fb-opt${vals.includes(o.value) ? " on" : ""}${o.value === NONE ? " none" : ""}`}
              onClick={() => toggle(g.key, o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="filter-bar" ref={wrap}>
      <div className="fb-row">
        {me && (
          <button
            className={`fb-btn${f.mine ? " on" : ""}`}
            onClick={() => setFilters({ mine: !f.mine })}
            title="Only cards assigned to you"
          >
            <User size={14} /> Mine
          </button>
        )}

        <div className="fb-anchor">
          <button
            className={`fb-btn${count ? " active" : ""}`}
            onClick={() => setOpen((o) => (o === "filter" ? null : "filter"))}
          >
            <Filter size={14} /> Filter{count ? ` · ${count}` : ""}
          </button>
          {open === "filter" && (
            <div className="fb-pop">
              {main.map(renderGroup)}
              <div className="fb-group">
                <div className="fb-group-title">Posting date</div>
                <div className="fb-options">
                  {(Object.keys(POSTING_LABEL) as PostingFilter[]).map((k) => (
                    <button
                      key={k}
                      className={`fb-opt${f.posting === k ? " on" : ""}`}
                      onClick={() => setFilters({ posting: f.posting === k ? undefined : k })}
                    >
                      {POSTING_LABEL[k]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="fb-group">
                <div className="fb-options">
                  <button
                    className={`fb-opt${f.openNotes ? " on" : ""}`}
                    onClick={() => setFilters({ openNotes: !f.openNotes })}
                  >
                    Has open review notes
                  </button>
                </div>
              </div>
              {extra.length > 0 && (
                <>
                  <button className="fb-more" onClick={() => setMore((m) => !m)}>
                    <ChevronDown size={13} className={more ? "flip" : ""} />
                    {more ? "Fewer filters" : "More filters"}
                    <span className="fb-more-sub">funnel, topic, lens, feeling, goal</span>
                  </button>
                  {more && extra.map(renderGroup)}
                </>
              )}
            </div>
          )}
        </div>

        {mode === "board" && (
          <div className="fb-anchor">
            <button
              className={`fb-btn${prefs.sort !== "manual" ? " active" : ""}`}
              onClick={() => setOpen((o) => (o === "sort" ? null : "sort"))}
            >
              <ArrowUpDown size={14} /> Sort: {BOARD_SORT_LABEL[prefs.sort]}
            </button>
            {open === "sort" && (
              <div className="fb-pop fb-pop-sort">
                {(Object.keys(BOARD_SORT_LABEL) as BoardSort[]).map((s) => (
                  <button
                    key={s}
                    className={`fb-sort-opt${prefs.sort === s ? " on" : ""}`}
                    onClick={() => {
                      update((p) => ({ ...p, sort: s }));
                      setOpen(null);
                    }}
                  >
                    {BOARD_SORT_LABEL[s]}
                    {s === "manual" && <span>drag cards into any order</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {chips.map((c) => (
          <span key={c.id} className="fb-chip">
            {c.label}
            <button onClick={c.clear} aria-label={`Clear ${c.label}`}>
              <X size={11} />
            </button>
          </span>
        ))}
        {(chips.length > 1 || (chips.length > 0 && Boolean(f.mine))) && (
          <button
            className="fb-clear"
            onClick={() => update((p) => ({ ...p, filters: {} }))}
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
