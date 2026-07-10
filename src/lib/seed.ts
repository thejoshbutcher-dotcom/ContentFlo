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

export const BUCKETS: Bucket[] = [
  { id: "shorts", name: "Shorts" },
  { id: "carousels", name: "Carousels", description: "Carousel posts for Instagram" },
  {
    id: "content-creation",
    name: "Content Creation",
    description:
      "Tools and frameworks for producing better content — how to show up, find your voice, build consistency, and make things people actually watch without burning out.",
  },
  {
    id: "ai-tools",
    name: "AI Tools/Workflows",
    description:
      "The actual stack for solo creators: tutorials, workflows, honest reviews from someone who uses these tools daily.",
  },
  {
    id: "millennial-money",
    name: "Millennial Money Mindset",
    description:
      "Money mindset, misconceptions, hot takes and inspiration about making money online — the honest psychology of money, worth, and building without a salary net.",
  },
  {
    id: "solo-biz",
    name: "Online solo biz life",
    description:
      "The real texture of building something solo — clients, pivots, pricing, burnout, loneliness, wins with nobody to tell.",
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
      "You don't have shiny object syndrome — you have no filter",
      "ideas",
      "Short form",
      "shorts",
      {
        topic: "Shiny object syndrome",
        pillar: "Content production",
        subPillar: "Strategy",
        who: "TOF" as Who,
        feeling: "Understood/Seen",
        hook: "hear me out.",
        delivery: "Walking/Lifestyle (somewhere random)",
        format: "Rant/Story Time",
        goalOfVideo: "Relatability → shares from multi-passionate creators",
        action: "Share",
      }
    ),
    sample(
      "I let AI plan my content for 30 days",
      "scripting",
      "Long form",
      "ai-tools",
      {
        who: "MOF" as Who,
        format: "Results/Review",
        goalOfVideo: "Prove the workflow works — drive to lead magnet",
        postingDate: daysFromNow(12),
      }
    ),
    sample(
      "5 AI tools I actually pay for as a solo creator",
      "up-next",
      "Carousel",
      "carousels",
      {
        who: "TOF" as Who,
        format: "List (Top/Best)",
        feeling: "Fired up/Excited",
        action: "Comment word (ManyChat)",
        postingDate: daysFromNow(5),
      }
    ),
    sample(
      "Millennial career crisis: the spreadsheet that made me quit",
      "up-next",
      "Short form",
      "shorts",
      {
        topic: "Millennial career crisis",
        pillar: "Millennial money",
        subPillar: "Oversharing",
        who: "TOF" as Who,
        feeling: "Inspired/Motivated",
        hook: "this is gonna sound dramatic...",
        delivery: "At desk",
        format: "Rant/Story Time",
      }
    ),
    sample(
      "Why 'learn more' is keeping you broke (action > planning)",
      "editing",
      "Short form",
      "shorts",
      {
        topic: "Learning more than doing (action > planning)",
        pillar: "Online business lifestyle",
        subPillar: "Hot takes",
        who: "MOF" as Who,
        feeling: "Fired up/Excited",
        format: "Quick actionable tip",
        postingDate: daysFromNow(2),
      }
    ),
    sample(
      "The muggle conversation: explaining my job at Thanksgiving",
      "ideas",
      "Short form",
      "shorts",
      {
        topic: "Family/friends not understanding what I do",
        pillar: "Online business lifestyle",
        subPillar: "Stories",
        who: "TOF" as Who,
        feeling: "Laughter/Joy",
        format: "Fun/Skit",
        delivery: "Excited",
      }
    ),
    sample(
      "Ep. 12 — One discovery away syndrome (with receipts)",
      "ideas",
      "Podcast",
      "content-creation",
      {
        topic: "One discovery away syndrome",
        who: "MOF" as Who,
        format: "Podcast/Yap",
      }
    ),
    sample(
      "How I schedule a week of content in 90 minutes",
      "ready",
      "Long form",
      "content-creation",
      {
        who: "BOF" as Who,
        format: "Tutorial (Step By Step)",
        goalOfVideo: "Authority + drive to newsletter",
        postingDate: daysFromNow(1),
      }
    ),
  ];
}
