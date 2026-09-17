import type { ContentCard, Section } from "./types";

/**
 * Three-way merges for shared profiles.
 *
 * Two teammates (or two of your own devices) can change the same card inside
 * the same sync window. Whole-row last-write-wins would silently drop one
 * side's work, so every conflicting save is merged against `base` — the last
 * version both sides agreed on:
 *
 *   • only they changed it  → take theirs
 *   • only we changed it    → keep ours
 *   • both changed it       → keep ours (we're the one still typing)
 *
 * The unit is a top-level card field, a whole section, or one library item,
 * so "you in the script, me in the title ideas" never collides. Two people
 * typing in the SAME box is the one case that stays last-write-wins.
 */

/**
 * Structural equality that ignores key order and treats `undefined` as
 * absent. Both matter: a card that round-trips through Postgres `jsonb` comes
 * back with its keys re-sorted and its undefined fields dropped, and must
 * still compare equal to the object it started as.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== "object" || typeof b !== "object") return false;

  const aArr = Array.isArray(a);
  if (aArr !== Array.isArray(b)) return false;
  if (aArr) {
    const x = a as unknown[];
    const y = b as unknown[];
    return x.length === y.length && x.every((v, i) => deepEqual(v, y[i]));
  }

  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) {
    if (!deepEqual(x[k], y[k])) return false;
  }
  return true;
}

/**
 * Merge two edited copies of an id-keyed list. Additions and removals from
 * both sides survive; an item both sides edited stays ours.
 */
export function mergeById<T>(
  base: T[],
  ours: T[],
  theirs: T[],
  idOf: (item: T) => string
): T[] {
  const baseBy = new Map(base.map((x) => [idOf(x), x]));
  const oursBy = new Map(ours.map((x) => [idOf(x), x]));
  const theirsBy = new Map(theirs.map((x) => [idOf(x), x]));

  const pick = (id: string): T | null => {
    const b = baseBy.get(id);
    const o = oursBy.get(id);
    const t = theirsBy.get(id);
    if (o !== undefined && t !== undefined) return deepEqual(o, b) ? t : o;
    if (o !== undefined) {
      // Missing on their side: they deleted it (if it was ever shared) —
      // unless we've changed it since, in which case our edit wins.
      if (b === undefined) return o;
      return deepEqual(o, b) ? null : o;
    }
    if (t !== undefined) {
      if (b === undefined) return t;
      return deepEqual(t, b) ? null : t;
    }
    return null;
  };

  // Our order if we reordered, otherwise theirs. Items only the OTHER side
  // knows about are slotted in after whatever preceded them over there — so
  // something added to the top of a newest-first list stays at the top.
  const baseOrder = base.map(idOf);
  const oursOrder = ours.map(idOf);
  const weReordered = !deepEqual(
    oursOrder.filter((id) => baseBy.has(id)),
    baseOrder.filter((id) => oursBy.has(id))
  );
  const lead = (weReordered ? ours : theirs).map(idOf);
  const tail = (weReordered ? theirs : ours).map(idOf);

  const order = [...lead];
  const placed = new Set(order);
  tail.forEach((id, i) => {
    if (placed.has(id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = order.indexOf(tail[j]);
      if (k !== -1) {
        at = k + 1;
        break;
      }
    }
    order.splice(at, 0, id);
    placed.add(id);
  });

  const out: T[] = [];
  for (const id of order) {
    const chosen = pick(id);
    if (chosen !== null) out.push(chosen);
  }
  return out;
}

/** Field-by-field three-way merge of a plain object. */
function mergeFields<T extends object>(
  base: T | undefined,
  ours: T,
  theirs: T,
  special: Partial<{ [K in keyof T]: (b: T[K] | undefined, o: T[K], t: T[K]) => T[K] }> = {}
): T {
  const out: Record<string, unknown> = {};
  const b = (base ?? {}) as Record<string, unknown>;
  const o = ours as Record<string, unknown>;
  const t = theirs as Record<string, unknown>;

  for (const k of new Set([...Object.keys(o), ...Object.keys(t)])) {
    const merger = (special as Record<string, unknown>)[k] as
      | ((b: unknown, o: unknown, t: unknown) => unknown)
      | undefined;
    let v: unknown;
    if (merger && o[k] !== undefined && t[k] !== undefined) {
      v = merger(b[k], o[k], t[k]);
    } else {
      v = deepEqual(o[k], b[k]) ? t[k] : o[k];
    }
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

export function mergeCard(
  base: ContentCard | undefined,
  ours: ContentCard,
  theirs: ContentCard
): ContentCard {
  const merged = mergeFields<ContentCard>(base, ours, theirs, {
    sections: (b, o, t) => mergeById<Section>(b ?? [], o, t, (s) => s.id),
  });
  // Not content — just "when was this last touched".
  merged.updatedAt =
    ours.updatedAt > theirs.updatedAt ? ours.updatedAt : theirs.updatedAt;
  return merged;
}

/**
 * The profile blob: brand setup plus the inspiration and competitor lists.
 * The lists merge per item, so two people saving inspiration at the same
 * moment both keep what they added.
 */
export function mergeProfileData<T extends object>(
  base: T | undefined,
  ours: T,
  theirs: T
): T {
  const byId =
    <I extends { id: string }>() =>
    (b: I[] | undefined, o: I[], t: I[]) =>
      Array.isArray(o) && Array.isArray(t)
        ? mergeById<I>(b ?? [], o, t, (x) => x.id)
        : o;
  const lists = ["inspo", "competitors", "buckets", "formats", "socials"];
  const special: Record<string, unknown> = {};
  for (const k of lists) special[k] = byId();
  return mergeFields<T>(base, ours, theirs, special as never);
}
