// Niche-agnostic defaults + larger suggestion pools.
// Everything here is only a STARTING POINT — the profile store (profile.ts)
// holds the user's own editable copies, seeded from these on first run.

export interface FormatDef {
  name: string;
  hint: string; // narrative beat / structure to guide the script
}

// ————— Relatable topics: audience struggles & desires that cut across niches —————
export const DEFAULT_TOPICS = [
  "Feeling overwhelmed by options",
  "Never enough time",
  "Fear of getting started",
  "Procrastination",
  "Comparing yourself to others",
  "Imposter syndrome",
  "Perfectionism holding you back",
  "Burnout",
  "Losing motivation",
  "Information overload",
  "Feeling stuck",
  "Wanting results faster",
  "Self-doubt",
  "Struggling to stay consistent",
];

export const TOPIC_SUGGESTIONS = [
  ...DEFAULT_TOPICS,
  "Money stress",
  "Work–life balance",
  "Feeling behind everyone else",
  "Shiny object syndrome",
  "Trying to do it all alone",
  "Not knowing where to start",
  "Overthinking every decision",
  "Fear of failure",
  "Fear of judgment",
  "Saying yes to too much",
  "Not feeling good enough",
  "Chasing motivation instead of discipline",
  "Comparing your start to someone's middle",
  "Wanting an overnight fix",
  "Being your own worst critic",
];

// ————— Formats: content structures with a beat to guide the script —————
export const DEFAULT_FORMATS: FormatDef[] = [
  { name: "Quick tip", hint: "Hook → the tip → why it matters → CTA" },
  { name: "How-to / tutorial", hint: "Hook → steps → the result → CTA" },
  { name: "Story time", hint: "Setup → conflict → turning point → lesson → CTA" },
  { name: "List / top picks", hint: "Hook → the items → recap → CTA" },
  { name: "Hot take / opinion", hint: "Claim → reasoning → reframe → CTA" },
  { name: "Myth busting", hint: "The myth → why it's wrong → the truth → CTA" },
  { name: "Behind the scenes", hint: "POV → real moments → the insight → CTA" },
  { name: "Review / reaction", hint: "The subject → your take → verdict → CTA" },
  { name: "Skit / entertainment", hint: "Setup → escalation → punchline" },
  { name: "Carousel", hint: "Hook slide → value slides → CTA slide" },
];

export const FORMAT_SUGGESTIONS: FormatDef[] = [
  ...DEFAULT_FORMATS,
  { name: "Q&A", hint: "Question → answer → example → CTA" },
  { name: "Mistakes to avoid", hint: "The mistake → why it hurts → the fix → CTA" },
  { name: "Before & after", hint: "Before → what changed → after → CTA" },
  { name: "Day in the life", hint: "Morning → key moments → reflection" },
  { name: "Challenge / experiment", hint: "The challenge → the attempt → the result" },
  { name: "Case study", hint: "Situation → approach → outcome → takeaway" },
  { name: "Rant", hint: "The trigger → build → the point → CTA" },
  { name: "Looping video", hint: "Hook → payoff → loop back into the hook" },
];

// ————— Feelings: what the viewer should feel (feeling > action) —————
export const DEFAULT_FEELINGS = [
  "Inspired",
  "Motivated",
  "Understood / seen",
  "Curious",
  "Entertained",
  "Surprised",
  "Empowered",
  "Reassured",
];

export const FEELING_SUGGESTIONS = [
  ...DEFAULT_FEELINGS,
  "Excited",
  "Hopeful",
  "Nostalgic",
  "Fired up",
  "Relieved",
  "Validated",
  "Challenged",
  "Amused",
  "Comforted",
  "Determined",
];

// ————— Goal actions: the CTA you want them to take —————
export const DEFAULT_ACTIONS = [
  "Follow",
  "Share",
  "Save",
  "Comment",
  "Click the link",
];

export const ACTION_SUGGESTIONS = [
  ...DEFAULT_ACTIONS,
  "Sign up",
  "Buy now",
  "Book a call",
  "Join the community",
  "DM a keyword",
  "Tag a friend",
  "Try it yourself",
  "Subscribe",
  "Download the freebie",
];

// ————— Who (funnel depth) — a fixed framework, not user data —————
export const WHO_OPTIONS = [
  { id: "TOF", label: "TOF", hint: "Top of funnel — broad, relatable, reach" },
  { id: "MOF", label: "MOF", hint: "Middle — knows the space, wants depth" },
  { id: "BOF", label: "BOF", hint: "Bottom — ready to act, go specific" },
] as const;

// ————— Optional card-level extras (kept generic) —————
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

export const DELIVERIES = [
  "At desk",
  "Walking / lifestyle",
  "Talking to camera",
  "Voiceover",
  "Calm",
  "High energy",
];

export function randomOf<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
