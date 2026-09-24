"use client";

import { useSyncExternalStore } from "react";
import { Pipeline } from "./pipelines";
import { isBlankContent } from "./richtext";
import { newId, sectionsFor } from "./templates";
import { ContentCard } from "./types";

/**
 * Copy cards on one board, paste them on another — another pipeline, or
 * another profile (channel) entirely. The clipboard lives in localStorage, so
 * it survives switching profiles and reloads (and other tabs see it), but it
 * is this browser's alone: nothing is synced until you actually paste.
 */

const KEY = "cf-card-clipboard";

interface Clip {
  /** Profile the cards were copied from — decides what carries over. */
  from: string;
  at: string;
  cards: ContentCard[];
  /** card id → its content bucket's NAME, so a paste into another profile can
   *  match a bucket of the same name there. */
  bucketNames?: Record<string, string>;
}

const listeners = new Set<() => void>();
let cache: { raw: string | null; clip: Clip | null } = { raw: null, clip: null };

function read(): Clip | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw !== cache.raw) {
    let clip: Clip | null = null;
    try {
      clip = raw ? (JSON.parse(raw) as Clip) : null;
    } catch {
      clip = null;
    }
    cache = { raw, clip };
  }
  return cache.clip;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

/** How many cards are waiting to be pasted (0 = nothing copied). */
export function useClipboardCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => read()?.cards.length ?? 0,
    () => 0
  );
}

export function copyCards(
  cards: ContentCard[],
  fromProfile: string,
  buckets: { id: string; name: string }[]
): void {
  if (!cards.length) return;
  const bucketNames: Record<string, string> = {};
  for (const c of cards) {
    const b = buckets.find((x) => x.id === c.bucketId);
    if (b) bucketNames[c.id] = b.name;
  }
  const clip: Clip = { from: fromProfile, at: new Date().toISOString(), cards, bucketNames };
  try {
    localStorage.setItem(KEY, JSON.stringify(clip));
  } catch {
    return; // quota — very large pasted images; nothing to copy with
  }
  listeners.forEach((fn) => fn());
}

function isEmptyCard(c: ContentCard): boolean {
  return c.sections.every(
    (s) => isBlankContent(s.content) && !s.images?.length && !s.refs?.length
  );
}

/**
 * Fresh copies of the clipboard, placed in `pipeline` at `stageId`.
 *
 * A different format converts exactly as changing a card's pipeline does: an
 * untouched card takes the new template; one with writing keeps its boxes and
 * is rebuilt into the new layout when opened, carrying everything written.
 * Across profiles, things that only mean something in the old profile — its
 * content buckets and its team — are matched by name / membership or dropped.
 */
export function buildPaste(opts: {
  pipeline: Pipeline;
  stageId?: string;
  bucketId?: string;
  toProfile: string;
  buckets: { id: string; name: string }[];
  roster: string[];
}): ContentCard[] {
  const clip = read();
  if (!clip) return [];
  const sameProfile = clip.from === opts.toProfile;
  const now = new Date().toISOString();
  const stage = opts.stageId ?? opts.pipeline.stages[0]?.id ?? "ideas";

  return clip.cards.map((c) => {
    const convert = c.contentType !== opts.pipeline.format;
    const sections =
      convert && isEmptyCard(c)
        ? sectionsFor(opts.pipeline.format)
        : c.sections.map((s) => ({
            ...s,
            id: newId("sec"),
            items: s.items?.map((it) => ({ ...it, id: newId("chk") })),
            images: s.images ? [...s.images] : undefined,
          }));

    let bucketId = opts.bucketId ?? c.bucketId;
    if (!opts.bucketId && !sameProfile) {
      // Bucket ids are per profile: use the bucket with the same name, if any.
      const name = clip.bucketNames?.[c.id]?.toLowerCase();
      bucketId = name
        ? opts.buckets.find((b) => b.name.toLowerCase() === name)?.id
        : undefined;
    }

    return {
      ...c,
      id: newId("card"),
      pipelineId: opts.pipeline.id,
      contentType: opts.pipeline.format,
      status: stage,
      bucketId,
      assignees: (c.assignees ?? []).filter((e) => sameProfile || opts.roster.includes(e)),
      sections,
      createdAt: now,
      updatedAt: now,
    };
  });
}
