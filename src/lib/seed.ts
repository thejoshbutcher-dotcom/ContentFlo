import { sectionsFor, newId } from "./templates";
import { Bucket, ContentCard, ContentType, Status, StatusColor, Who } from "./types";

export const STATUSES: Status[] = [
  { id: "ideas", name: "Ideas", color: "slate" },
  { id: "up-next", name: "Up Next", color: "pink" },
  { id: "packaged", name: "Packaged", color: "yellow" },
  { id: "scripting", name: "Scripting", color: "blue" },
  { id: "filming", name: "Filming", color: "red" },
  { id: "editing", name: "Editing", color: "purple" },
  { id: "ready", name: "Ready for Posting", color: "orange" },
  { id: "posted", name: "Posted", color: "green" },
];

// "Packaged" is a long-form-only stage (titles + thumbnails before scripting)
export function statusesFor(contentType?: string): Status[] {
  return STATUSES.filter(
    (s) => s.id !== "packaged" || contentType === "Long form"
  );
}

// Broad, niche-agnostic starting buckets. Users rename/replace these in Setup.
export const BUCKETS: Bucket[] = [
  {
    id: "educational",
    name: "Educational",
    description: "Teach your audience something useful — tips, how-tos, breakdowns.",
  },
  {
    id: "entertaining",
    name: "Entertaining",
    description: "Fun, relatable, shareable content that stops the scroll.",
  },
  {
    id: "inspirational",
    name: "Inspirational",
    description: "Stories, wins, and motivation that make people feel something.",
  },
  {
    id: "personal",
    name: "Personal / BTS",
    description: "Your journey, behind the scenes, the real you.",
  },
  {
    id: "authority",
    name: "Authority",
    description: "Opinions and hot takes that build trust in your niche.",
  },
  {
    id: "promotional",
    name: "Promotional",
    description: "Offers, products, and clear calls to action.",
  },
];

// Dark-theme chips: translucent tint background + light foreground (CreatorFlo palette)
export const STATUS_COLORS: Record<
  StatusColor,
  { dot: string; bg: string; fg: string }
> = {
  brown: { dot: "#B08968", bg: "rgba(176,137,104,0.16)", fg: "#D6B597" },
  gray: { dot: "#8A9099", bg: "rgba(138,144,153,0.16)", fg: "#C3C9D2" },
  slate: { dot: "#8A9099", bg: "rgba(138,144,153,0.16)", fg: "#C3C9D2" },
  pink: { dot: "#F06BAE", bg: "rgba(240,107,174,0.15)", fg: "#F8A8CF" },
  yellow: { dot: "#F7C948", bg: "rgba(247,201,72,0.15)", fg: "#FFD966" },
  blue: { dot: "#5B9DF5", bg: "rgba(91,157,245,0.15)", fg: "#9CC4FA" },
  red: { dot: "#F04438", bg: "rgba(240,68,56,0.15)", fg: "#F97066" },
  purple: { dot: "#A78BFA", bg: "rgba(167,139,250,0.15)", fg: "#C4B0FC" },
  orange: { dot: "#F79009", bg: "rgba(247,144,9,0.15)", fg: "#FDB022" },
  green: { dot: "#32D583", bg: "rgba(50,213,131,0.15)", fg: "#6CE9A6" },
};

function sample(
  title: string,
  status: string,
  contentType: ContentType,
  bucketId: string,
  extra: Partial<ContentCard> = {}
): ContentCard {
  const now = new Date().toISOString();
  return {
    id: newId("card"),
    title,
    status,
    contentType,
    bucketId,
    sections: sectionsFor(contentType),
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function seedCards(): ContentCard[] {
  return [
    sample(
      "The one habit that fixed my consistency",
      "ideas",
      "Short form",
      "inspirational",
      {
        topic: "Struggling to stay consistent",
        who: "TOF" as Who,
        feeling: "Understood / seen",
        hook: "hear me out.",
        delivery: "Walking / lifestyle",
        format: "Story time",
        goalOfVideo: "Make them feel seen so they share it",
        action: "Share",
      }
    ),
    sample(
      "I tried planning a month of content in one sitting",
      "scripting",
      "Long form",
      "educational",
      {
        topic: "Never enough time",
        who: "MOF" as Who,
        format: "Review / reaction",
        goalOfVideo: "Show the system works — drive to the freebie",
        postingDate: daysFromNow(12),
      }
    ),
    sample(
      "5 tools I actually pay for",
      "up-next",
      "Carousel",
      "educational",
      {
        who: "TOF" as Who,
        format: "List / top picks",
        feeling: "Fired up",
        action: "Comment",
        postingDate: daysFromNow(5),
      }
    ),
    sample(
      "The moment I almost quit",
      "up-next",
      "Short form",
      "personal",
      {
        topic: "Feeling behind everyone else",
        who: "TOF" as Who,
        feeling: "Inspired",
        hook: "this is gonna sound dramatic...",
        delivery: "Talking to camera",
        format: "Story time",
      }
    ),
    sample(
      "Why 'learn more' is keeping you stuck",
      "editing",
      "Short form",
      "authority",
      {
        topic: "Chasing motivation instead of discipline",
        who: "MOF" as Who,
        feeling: "Fired up",
        format: "Hot take / opinion",
        postingDate: daysFromNow(2),
      }
    ),
    sample(
      "Explaining what I do at family dinner",
      "ideas",
      "Short form",
      "entertaining",
      {
        topic: "Fear of judgment",
        who: "TOF" as Who,
        feeling: "Amused",
        format: "Skit / entertainment",
        delivery: "High energy",
      }
    ),
    sample(
      "Ep. 12 — Why you feel one step away from success",
      "ideas",
      "Podcast",
      "personal",
      {
        topic: "Wanting results faster",
        who: "MOF" as Who,
        format: "Story time",
      }
    ),
    sample(
      "How I plan a week of content in 90 minutes",
      "ready",
      "Long form",
      "educational",
      {
        who: "BOF" as Who,
        format: "How-to / tutorial",
        goalOfVideo: "Build authority + drive to the newsletter",
        postingDate: daysFromNow(1),
      }
    ),
  ];
}
