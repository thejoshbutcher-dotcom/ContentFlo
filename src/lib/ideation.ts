// The Content Ideation Flow — mirrors Josh's brainstorming framework.

export interface Pillar {
  name: string;
  subs: string[];
}

export const RELATABLE_TOPICS = [
  "Overthinking",
  "Feeling alone/isolated",
  "Lack of consistency",
  "Comparing to others",
  "Millennial career crisis",
  "Too many interests — multi-passionate",
  "Shiny object syndrome",
  "Phobia of commitment",
  "Procrastination king",
  "Anxious",
  "Second guessing everything — perfectionism",
  "Control freak — wearing too many hats — fear of delegating",
  "Imposter syndrome",
  "One discovery away syndrome",
  "Delaying satisfaction (not letting yourself be happy until X)",
  "Indecisive",
  "Avoiding family time for grinding",
  "Learning more than doing (action > planning)",
  "Family/friends not understanding what I do",
  "Peers having real jobs (muggles)",
  "Shame of sharing wins (or losses)",
  "Not enough time for personal projects",
  "Feeling guilty taking time off",
];

export const PILLARS: Pillar[] = [
  {
    name: "Content production",
    subs: ["Strategy", "Production tools", "Funnels"],
  },
  {
    name: "AI tools/workflows",
    subs: ["AI Video/Image", "Vibe Coding", "Productivity"],
  },
  {
    name: "Online business lifestyle",
    subs: ["POV", "Stories", "Hot takes"],
  },
  {
    name: "Millennial money",
    subs: ["Success stories", "Oversharing", "Raw breakdowns"],
  },
];

export const WHO_OPTIONS = [
  { id: "TOF", label: "TOF", hint: "Top of funnel — broad, relatable" },
  { id: "MOF", label: "MOF", hint: "Middle — knows the space, wants depth" },
  { id: "BOF", label: "BOF", hint: "Bottom — ready to act, go specific" },
] as const;

export const ACTIONS = ["Share", "Follow", "Comment word (ManyChat)"];

export const FEELINGS = [
  "Inspired/Motivated",
  "Hopeful",
  "Understood/Seen",
  "Fired up/Excited",
  "Laughter/Joy",
];

// Format flow: Recognition/Relate → Story (trust) → Reframe (aha) → Solution (teach/value) → Invitation (CTA)
export const FORMATS = [
  {
    name: "Check this out — discovery",
    beat: "Recognition → Story → Reframe → Solution → Invitation",
  },
  {
    name: "Quick actionable tip",
    beat: "Recognition → Quick win → Why it matters → Teach → CTA",
  },
  {
    name: "Step by step tutorial",
    beat: "Recognition → Quick answer → Why this REALLY matters → Teach → CTA",
  },
  {
    name: "List of tips or examples",
    beat: "Recognition → Story → Reframe → Solution → Invitation",
  },
  {
    name: "Rant/Story time",
    beat: "Recognition → Story (trust) → Reframe (aha) → Solution → Invitation",
  },
  {
    name: "POV + voice over (lifestyle/vlog)",
    beat: "Recognition → Story → Reframe → Solution → Invitation",
  },
  {
    name: "Fun/Skit",
    beat: "Recognition → Story → Reframe → Solution → Invitation",
  },
  {
    name: "Looping video",
    beat: "Hook → Build → Value → Loop back into hook",
  },
  {
    name: "Carousel",
    beat: "Hook slide → Value slides → Reframe → CTA slide",
  },
];

export const VERBAL_HOOKS = [
  "okay wait...",
  "i have a theory.",
  "i've been thinking about this all week.",
  "this is oddly specific but...",
  "i don't think enough people talk about this.",
  "hear me out.",
  "i've changed my mind.",
  "this is gonna sound dramatic...",
  "this might just be me...",
  "okay... can we talk about this?",
];

export const HOOK_STYLES = ["Written verbal script", "Text hook + OS visual"];

export const DELIVERIES = [
  "At desk",
  "Walking/Lifestyle (somewhere random)",
  "Calm",
  "Excited",
];

// Map ideation format → the Content Format select from the Notion database
export const FORMAT_TO_CONTENT_FORMAT: Record<string, string> = {
  "Check this out — discovery": "Deep Dive (Desired Outcome)",
  "Quick actionable tip": "List (Top/Best)",
  "Step by step tutorial": "Tutorial (Step By Step)",
  "List of tips or examples": "List (Top/Best)",
  "Rant/Story time": "Rant/Story Time",
  "POV + voice over (lifestyle/vlog)": "Results/Review",
  "Fun/Skit": "Fun/Skit",
  "Looping video": "Looping Video",
  Carousel: "List (Top/Best)",
};

export const CONTENT_FORMATS = [
  "List (Top/Best)",
  "Deep Dive (Desired Outcome)",
  "Tutorial (Step By Step)",
  "Results/Review",
  "Challenge",
  "Podcast/Yap",
  "Looping Video",
  "Fun/Skit",
  "Rant/Story Time",
];

export function randomOf<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
