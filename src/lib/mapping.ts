import { ContentCard } from "./types";
import { ProfileFormat, ProfileBucket, SocialAccount } from "./profile";

/** Shape of a row in public.cards. */
export interface CardRow {
  id: string;
  profile_id: string;
  user_id: string;
  title: string;
  status: string;
  content_type: string | null;
  posting_date: string | null;
  body: ContentCard;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProfileRow {
  id: string;
  user_id: string;
  name: string;
  sort: number;
  data: ProfileDataRow;
  updated_at: string;
}

export interface ProfileDataRow {
  brandName?: string;
  niche?: string;
  audience?: string;
  offer?: string;
  socials?: SocialAccount[];
  buckets?: ProfileBucket[];
  topics?: string[];
  formats?: ProfileFormat[];
  feelings?: string[];
  actions?: string[];
  setupComplete?: boolean;
}

/**
 * The whole card goes into `body`. The promoted columns are derived copies,
 * kept only so the board/calendar/table can be queried server-side later.
 * Duplicating a few small fields is cheaper than a lossy round-trip.
 */
export function cardToRow(
  card: ContentCard,
  userId: string,
  profileId: string
): Omit<CardRow, "deleted_at"> {
  return {
    id: card.id,
    profile_id: profileId,
    user_id: userId,
    title: card.title ?? "",
    status: card.status,
    content_type: card.contentType ?? null,
    // A card with no posting date must send null, not "" — Postgres `date`
    // rejects the empty string.
    posting_date: card.postingDate ? card.postingDate : null,
    body: card,
    updated_at: card.updatedAt ?? new Date().toISOString(),
  };
}

export function rowToCard(row: CardRow): ContentCard {
  // `body` is the source of truth; the columns are just indexes onto it.
  // Fall back defensively in case a row was written by an older client.
  const body = (row.body ?? {}) as ContentCard;
  return {
    ...body,
    id: row.id,
    title: body.title ?? row.title ?? "",
    status: body.status ?? row.status,
    updatedAt: body.updatedAt ?? row.updated_at,
    sections: body.sections ?? [],
  };
}
