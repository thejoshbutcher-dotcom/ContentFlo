export type ContentType = "Short form" | "Long form" | "Podcast" | "Carousel";

export type Who = "TOF" | "MOF" | "BOF";

export type SectionKind = "text" | "checklist";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export type SectionPhase = "plan" | "script" | "post";

import type { SectionRef } from "./inspo";

export interface Section {
  id: string;
  title: string;
  hint?: string;
  kind: SectionKind;
  phase?: SectionPhase;
  content: string;
  /** Ghost guide text shown only while the box is completely empty —
   *  scaffolds like "1. / 2. / 3." live here, never as real blocks. */
  placeholder?: string;
  items?: ChecklistItem[];
  images?: string[];
  /** Items pinned from the inspiration library (hotlinked, not copied). */
  refs?: SectionRef[];
  /** Whether this box offers the "Inspiration" button — only the reference
   *  and ideas boxes do, so the control stays where it's actually wanted. */
  allowRefs?: boolean;
}

export interface ContentCard {
  id: string;
  title: string;
  status: string;
  bucketId?: string;
  contentType?: ContentType;
  format?: string;
  who?: Who;
  postingDate?: string;
  description?: string;
  goalOfVideo?: string;
  postDescription?: string;
  ctaLink?: string;
  series?: string;
  referenceUrl?: string;
  // Long-form video thumbnail (compressed JPEG data URL); shown on the board.
  thumbnail?: string;
  // Ideation flow fields
  topic?: string;
  pillar?: string;
  subPillar?: string;
  action?: string;
  feeling?: string;
  hook?: string;
  delivery?: string;
  sections: Section[];
  createdAt: string;
  updatedAt: string;
}

export interface Bucket {
  id: string;
  name: string;
  description?: string;
}

export type StatusColor =
  | "brown"
  | "gray"
  | "slate"
  | "pink"
  | "yellow"
  | "blue"
  | "red"
  | "purple"
  | "orange"
  | "green";

export interface Status {
  id: string;
  name: string;
  color: StatusColor;
}

export type ViewId =
  | "ideate"
  | "inspo"
  | "competitors"
  | "board-short"
  | "board-long"
  | "board-podcast"
  | "board-carousel"
  | "board-buckets"
  | "calendar"
  | "table";
