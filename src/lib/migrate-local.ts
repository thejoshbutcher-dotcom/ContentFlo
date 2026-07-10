"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Account, plannerKey, profileKey } from "./accounts";
import { cardToRow } from "./mapping";
import { defaultProfileData } from "./profile";
import { ContentCard } from "./types";

/** zustand's persist wrapper. */
interface Envelope<T> {
  state: T;
  version?: number;
}

function readEnvelope<T>(key: string): Envelope<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Envelope<T>) : null;
  } catch {
    return null;
  }
}

/** The same status remap `usePlanner`'s persist migration applies at v2. */
const IDEA_LANES: Record<string, string> = {
  "og-ideas": "ideas",
  "ideas-ref": "ideas",
  "ideas-2026": "ideas",
};

function normalizeCards(cards: ContentCard[], version: number | undefined) {
  if (version && version >= 2) return cards;
  return cards.map((c) => ({
    ...c,
    status:
      IDEA_LANES[c.status] ??
      (c.status === "packaged" && c.contentType !== "Long form"
        ? "up-next"
        : c.status),
  }));
}

export function readLocalAccounts(): Account[] {
  const env = readEnvelope<{ accounts: Account[] }>("jbo-planner-accounts");
  const accounts = env?.state?.accounts;
  if (accounts?.length) return accounts;
  // A pre-multi-profile install: one implicit account on the legacy keys.
  return [{ id: "default", name: "My Brand" }];
}

/** Is there anything in localStorage worth importing? */
export function hasLocalData(): boolean {
  return readLocalAccounts().some((a) => {
    const env = readEnvelope<{ cards: ContentCard[] }>(plannerKey(a.id));
    return Boolean(env?.state?.cards?.length);
  });
}

/** Does this user already have profiles in the cloud? */
export async function hasCloudData(supabase: SupabaseClient): Promise<boolean> {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return (count ?? 0) > 0;
}

export interface ImportResult {
  profiles: number;
  cards: number;
}

/**
 * Copy every local profile and card into the cloud, ids preserved.
 *
 * `plannerKey`/`profileKey` are reused deliberately: they already map the
 * "default" account onto the original unsuffixed keys, so a pre-multi-profile
 * install imports correctly for free.
 *
 * localStorage is never cleared — it stays as a backup and offline cache.
 */
export async function importLocalData(
  supabase: SupabaseClient,
  userId: string
): Promise<ImportResult> {
  const accounts = readLocalAccounts();
  let cardCount = 0;

  const profileRows = accounts.map((a, i) => {
    const env = readEnvelope<Record<string, unknown>>(profileKey(a.id));
    const { ...data } = env?.state ?? {};
    // `update` is an action, not data — never persisted, but be defensive.
    delete (data as Record<string, unknown>).update;
    return {
      id: a.id,
      user_id: userId,
      name: a.name,
      sort: i,
      data: Object.keys(data).length ? data : defaultProfileData(),
    };
  });

  const { error: pErr } = await supabase.from("profiles").upsert(profileRows);
  if (pErr) throw pErr;

  for (const a of accounts) {
    const env = readEnvelope<{ cards: ContentCard[] }>(plannerKey(a.id));
    const cards = normalizeCards(env?.state?.cards ?? [], env?.version);
    if (!cards.length) continue;

    const rows = cards.map((c) => cardToRow(c, userId, a.id));
    // Chunked so a large library doesn't blow the request size.
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from("cards").upsert(rows.slice(i, i + 100));
      if (error) throw error;
    }
    cardCount += rows.length;
  }

  return { profiles: profileRows.length, cards: cardCount };
}
