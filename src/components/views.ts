import { ContentCard, ViewId } from "@/lib/types";

export interface ViewDef {
  id: ViewId;
  label: string;
  title: string;
  note: string;
  kind: "board" | "calendar" | "table" | "slate";
  groupBy?: "status" | "bucket";
  filter?: (c: ContentCard) => boolean;
  newCardType?: ContentCard["contentType"];
}

export const VIEW_DEFS: ViewDef[] = [
  {
    id: "ideate",
    label: "Brainstorm",
    title: "Brainstorm",
    note: "Stack the deck, then send it to the pipeline",
    kind: "slate",
  },
  {
    id: "board-short",
    label: "Short Form",
    title: "Video Status · Short",
    note: "Shorts pipeline, idea → posted",
    kind: "board",
    groupBy: "status",
    filter: (c) => c.contentType === "Short form",
    newCardType: "Short form",
  },
  {
    id: "board-long",
    label: "Long Form",
    title: "Video Status · Long",
    note: "Long form (talking head) pipeline",
    kind: "board",
    groupBy: "status",
    filter: (c) => c.contentType === "Long form",
    newCardType: "Long form",
  },
  {
    id: "board-podcast",
    label: "Podcast",
    title: "Video Status · Podcast",
    note: "Episodes and clips",
    kind: "board",
    groupBy: "status",
    filter: (c) => c.contentType === "Podcast",
    newCardType: "Podcast",
  },
  {
    id: "board-carousel",
    label: "Carousels",
    title: "Carousels",
    note: "Instagram carousel pipeline",
    kind: "board",
    groupBy: "status",
    filter: (c) => c.contentType === "Carousel",
    newCardType: "Carousel",
  },
  {
    id: "board-buckets",
    label: "Content Buckets",
    title: "Content Buckets",
    note: "Everything not yet posted, grouped by bucket",
    kind: "board",
    groupBy: "bucket",
    filter: (c) => c.status !== "posted",
  },
  {
    id: "calendar",
    label: "Posting Schedule",
    title: "Posting Schedule",
    note: "Everything with a posting date",
    kind: "calendar",
  },
  {
    id: "table",
    label: "All Content",
    title: "All Content",
    note: "Every card, every property",
    kind: "table",
  },
];
