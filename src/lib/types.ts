export type ContentType = "Short form" | "Long form" | "Podcast" | "Carousel";

export type Who = "TOF" | "MOF" | "BOF";

export type SectionKind = "text" | "checklist";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export type SectionPhase = "plan" | "script" | "post";

export interface Section {
  id: string;
  title: string;
  hint?: string;
  kind: SectionKind;
  phase?: SectionPhase;
  content: string;
  items?: ChecklistItem[];
  images?: string[];
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
  | "board-short"
  | "board-long"
  | "board-podcast"
  | "board-carousel"
  | "board-buckets"
  | "calendar"
  | "table";
