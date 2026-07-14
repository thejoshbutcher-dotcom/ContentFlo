import { ChecklistItem, ContentType, Section, SectionPhase } from "./types";

let uid = 0;
export function newId(prefix = "id"): string {
  uid += 1;
  return `${prefix}-${Date.now().toString(36)}-${uid}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function text(
  title: string,
  hint?: string,
  content = "",
  phase: SectionPhase = "plan"
): Section {
  return { id: newId("sec"), title, hint, kind: "text", phase, content };
}

function script(title: string, hint?: string, content = ""): Section {
  return text(title, hint, content, "script");
}

function post(title: string, hint?: string, content = ""): Section {
  return text(title, hint, content, "post");
}

function checklist(title: string, items: string[]): Section {
  const list: ChecklistItem[] = items.map((t) => ({
    id: newId("chk"),
    text: t,
    done: false,
  }));
  return {
    id: newId("sec"),
    title,
    kind: "checklist",
    phase: "post",
    content: "",
    items: list,
  };
}

// Fallbacks for cards saved before sections carried a phase
const SCRIPT_TITLES = [
  "Visual Hook",
  "My Script ✍️",
  "Outline",
  "🪝 Hook",
  "💭 Intro",
  "💰 Value",
  "↪ Outro",
  "Hook Slide",
  "Slides 2–9",
  "CTA Slide",
  "Talking Points",
  "Stories to Tell",
  "Episode Premise",
];

const POST_TITLES = [
  "Caption for Posting 📱",
  "Publishing Checklist ✅",
  "Video Description for YouTube",
  "Email (for sharing video)",
];

export function sectionPhase(sec: Section): SectionPhase {
  if (sec.phase === "plan" && POST_TITLES.includes(sec.title)) return "post";
  if (sec.phase) return sec.phase;
  if (SCRIPT_TITLES.includes(sec.title)) return "script";
  if (POST_TITLES.includes(sec.title)) return "post";
  return "plan";
}

// Sections whose wording improved after cards were already saved
export const HINT_OVERRIDES: Record<string, string> = {
  "Goal of Video": "What should this video DO for the viewer?",
};

// ————— Page templates, mirroring the Notion CONTENT database templates —————

export function shortFormSections(): Section[] {
  return [
    text(
      "Visual Hook",
      "Summarize in 3–7 key words · at least one POWER word · graphic that previews value, borrows interest, or shows before→after"
    ),
    text("Outline", "Beat-by-beat structure before you write the full script"),
    text("Reference Link 🔗", "Link to the video you're modeling"),
    text("Original Script", "Transcript / beats of the reference video"),
    script(
      "My Script ✍️",
      "Hook → Build Up → Value → Resolution → CTA → Loop Back"
    ),
    post("Caption for Posting 📱", "Caption + comment word if running ManyChat"),
    text("Notes", ""),
  ];
}

export function longFormSections(): Section[] {
  return [
    text("Goal of Video", "What should this video DO for the viewer?"),
    text("Title Ideas", "Write 3+ options", "1. \n2. \n3. "),
    text("Thumbnail Ideas (3–5 words)", "Write 3+ options", "1. \n2. \n3. "),
    text(
      "Thumbnail References",
      "Other creators' thumbnails to model — paste screenshots straight from your clipboard"
    ),
    text("Video References 🔗", "Other creators' videos"),
    text(
      "Questions ❓ (from reference video)",
      "Reference title · goal · 3 points/secrets to reveal · main question · what the viewer wants to know · what I want them to LEARN · objections",
      "Reference video title: \n\nGoal of the reference video: \n\n3 points or secrets to reveal:\n1. \n2. \n3. \n\nMain question: \n\nWhat does the viewer want to know?\n- \n\nWhat do I want the viewer to know?\n- \n\nWhat do I want the viewer to LEARN?\n- \n\nObjections or obvious answers:\n- "
    ),
    script("Outline", "Beat-by-beat structure before you write the full script"),
    script("Script", "Hook → Intro → Value → CTA"),
    checklist("Publishing Checklist ✅", [
      "Upload ad-free version if sponsored",
      "Add description (friendly, no 'hey guys' — below sponsor CTA)",
      "Ensure sponsor CTA has details + test the link",
      "Add tags",
      "Add end screen (custom playlist if needed)",
      "Send for captioning once uploaded as Unlisted",
      "Add video to most relevant playlist",
      "Schedule for publish at 5–6pm GMT",
    ]),
    post("Video Description for YouTube", "", "00:00 - Intro\n"),
    post("Email (for sharing video)", "", "Subject: \n\nBody:\n"),
  ];
}

export function carouselSections(): Section[] {
  return [
    script(
      "Hook Slide",
      "3–7 key words + power word — stops the scroll on slide 1"
    ),
    script(
      "Slides 2–9",
      "One idea per slide · big text · keep them swiping",
      "Slide 2: \nSlide 3: \nSlide 4: \nSlide 5: \nSlide 6: \nSlide 7: \nSlide 8: \nSlide 9: "
    ),
    script("CTA Slide", "Share / Save / Follow / Comment word"),
    post("Caption for Posting 📱", ""),
    text("Design Notes", "Colors, imagery, template to reuse"),
  ];
}

export function podcastSections(): Section[] {
  return [
    script("Episode Premise", "What's the conversation really about?"),
    script("Talking Points", "", "1. \n2. \n3. \n4. \n5. "),
    script("Stories to Tell", "Personal stories that anchor each point"),
    text("Clips to Cut 🎬", "Moments likely to work as shorts"),
    text("Title + Thumbnail Ideas", "", "1. \n2. \n3. "),
    checklist("Publishing Checklist ✅", [
      "Edit full episode",
      "Cut 3–5 short clips",
      "Write episode description",
      "Schedule audio + video versions",
      "Post clips across platforms",
    ]),
  ];
}

export function sectionsFor(type?: ContentType): Section[] {
  switch (type) {
    case "Long form":
      return longFormSections();
    case "Carousel":
      return carouselSections();
    case "Podcast":
      return podcastSections();
    case "Short form":
    default:
      return shortFormSections();
  }
}

// ————— Reference library (the collapsible guides inside the Notion templates) —————

export interface RefEntry {
  title: string;
  body: string;
}

export interface RefGroup {
  title: string;
  entries: RefEntry[];
}

export const SHORT_FORM_LIBRARY: RefGroup[] = [
  {
    title: "Viral Script Formula",
    entries: [
      {
        title: "The 6 beats",
        body: "HOOK — the entire video concept; must generate enough curiosity to crave a resolution.\n\nBUILD UP — build suspense, evoke emotion, clear objections, entertain.\n\nVALUE — actionable steps/tips/insights. High value brings in followers.\n\nRESOLUTION — pay off the hook. Retention drops after this point.\n\nCTA — comment, share, save. Use reciprocity.\n\nLOOP BACK — last few words loop seamlessly back into the hook.",
      },
    ],
  },
  {
    title: "Viral Hook Formulas",
    entries: [
      {
        title: "Call-out mistakes",
        body: "• You are ruining your [desired result] if you are not [solution]\n• The #1 mistake new [X] make\n• The biggest mistake I made when it comes to [X]\n• Stop doing [X] if you want [Y]\n• [Audience] do not understand / don't know how [Y]",
      },
      {
        title: "Authority + experience",
        body: "• What I wish I knew at [X] instead of [Y] years old\n• If I was starting over in [X], here's the 1 mistake I'd avoid\n• My favorite thing to do to increase [X] is...\n• One of my favorite ways to increase/decrease [X] as a [Y]",
      },
      {
        title: "Curiosity + proof",
        body: "• Achieving [result] is not luck, it's calculated (show formula)\n• Here's a secret [resource] that gives you unlimited [X] — and it's free\n• Here's how you turn 1 [negative] into [desired result]\n• This is the ultimate guide for [X] on [Y]\n• If you're worried about [X], try [Y]",
      },
    ],
  },
  {
    title: "Hook Angles",
    entries: [
      {
        title: "The full list",
        body: "• The 'overrated norm' — don't X, do Y instead / why I don't use X\n• The 'controversial take' — this may be controversial but...\n• The 'I tried X' — I tried EVERY X so you don't have to\n• 'Stop scrolling if you want...' / 'I discovered the secret to...'\n• The 'my story' — here's how I did X\n• The 'before you buy/try' — don't do X until you watch this\n• The 'authority advice' — 3 questions I get asked all the time\n• The 'this is your sign' / 'here are 3 signs'\n• The 'red flags'\n• The 'day in the life'\n• The 'hidden in plain sight' — you've been using X all wrong\n• The 'specific avatar callout' — this video is only for [person]\n• The 'tips and tricks' — X things that feel illegal to know\n• The 'pain point remover' — this is why you suck at [pain point]",
      },
    ],
  },
  {
    title: "Interest Peaks",
    entries: [
      {
        title: "Risk reversal",
        body: "Reassure the viewer the video is worth their time. \"This will only take a minute to set up and costs less than a cup of coffee.\" \"Even if you suck at ___, this will work for you, I promise.\"",
      },
      {
        title: "Authority endorsement",
        body: "Borrow credibility. \"This is the same secret sauce Hormozi, Gadzhi and Abdaal are using right now.\"",
      },
      {
        title: "Controversial",
        body: "Validate or challenge an opinion — either way you get an emotional response. \"What I'm about to say might make everyone upset.\"",
      },
      {
        title: "Personal story",
        body: "Use your own social proof to validate the value. \"This is the same thing I've done to reach [result].\"",
      },
      {
        title: "Negative assumption",
        body: "Presume the viewer's objections and kill them early. \"And NO, it's not ___ or ___.\"",
      },
      {
        title: "Hype up",
        body: "Build anticipation for the value. \"This is seriously so sick, check this out!\"",
      },
      {
        title: "Call out",
        body: "Name what the viewer is doing right now. \"Just like you right now doom-scrolling social media...\" (be careful with this one)",
      },
      {
        title: "Cost narration",
        body: "Raise perceived worth by naming what it cost you. \"I spent $20,000 to attend this event — here are the 3 most valuable takeaways.\"",
      },
    ],
  },
  {
    title: "Visual Hook — S.P.G.",
    entries: [
      {
        title: "The 3 rules",
        body: "S — SUMMARIZE the video and its hook in 3–7 key words.\n\nP — at least one POWER WORD that strikes an emotional response.\n\nG — at least one GRAPHIC that: previews the value, borrows interest from something more popular, or shows the before→after transformation.",
      },
    ],
  },
];

export const LONG_FORM_LIBRARY: RefGroup[] = [
  {
    title: "Script Templates",
    entries: [
      {
        title: "Storytelling — Confronting the Norm",
        body: "0:00 Bold hook — provocative claim against conventional wisdom\n0:15 Context setting — your situation, hint the tension\n0:45 Trend observation — others succeeding with the approach\n1:15 Decision point — why you followed the trend\n1:45 Initial implementation — early positive feelings\n2:15 Reality check — disappointing results, real metrics\n3:00 Rock bottom — internal struggle, crisis\n3:30 Epiphany — what went wrong, the misunderstanding\n4:00 Final attempt — one last approach, obstacles\n4:45 Apparent failure — false defeat\n5:15 Unexpected turnaround — surprising success\n5:45 Lesson — actionable insight + strong CTA",
      },
      {
        title: "Storytelling — Fail to Success",
        body: "0:00 The rock bottom — vivid lowest point\n0:45 The wake-up call — the exact trigger moment\n1:30 The mindset shift — internal change before external results\n2:30 The extreme commitment — routine, sacrifices\n3:45 The initial failure — pivot instead of quitting\n5:00 First breakthrough — specific metrics\n6:15 Doubling down — second phase of commitment\n7:30 The major success — real numbers, humble tone\n8:30 Philosophical reflection — what actually matters\n9:45 Inspirational close — accessible takeaways",
      },
      {
        title: "Kallaway Style (framework teach)",
        body: "0:00 Hook & problem — what they'll learn + name-drop examples\n0:30 Psychological foundation — the principle + simple analogy\n1:30 Core framework — 3–5 components defined\n3:00 Technique 1 — name it, why it matters, example, tips\n4:30 Technique 2 — connect to previous\n6:00 Brief product mention (if applicable)\n7:30 Technique 3 — include a common mistake\n9:00 Technique 4 — tie back to framework\n10:30 Summary & application\n11:30 CTA — engagement + what's next",
      },
      {
        title: "My Discovery / Deep Dive",
        body: "0:00 Hook — most impressive stat + central question\n0:30 Context — background, growth chart, your credibility\n1:30 Initial discovery — debunk assumptions, income breakdown\n3:00 The turning point — the strategy that changed everything\n5:00 Strategy breakdown pt 1 — examples + quotes\n7:00 Strategy breakdown pt 2 — how it compounds\n9:00 Scaling — current results\n11:00 Viewer application — actionable steps + obstacles\n12:30 Conclusion & CTA — tease next video",
      },
      {
        title: "Short Story — Life-Changing Idea",
        body: "0:00 Hook — bold claim about what's holding them back\n0:15 Empathy — describe the frustration with 'you' statements\n0:45 Turning point — your realization, the 'but then' moment\n1:15 The solution — simple mindset shift + metaphor\n1:45 Address objections — 'the pain of doing nothing...'\n2:15 Results & proof — honest timeline\n2:45 CTA + memorable closing line",
      },
      {
        title: "Short Story — Problem Solve",
        body: "0:00 Hook & relatability — bold statement, you've been there\n0:30 Vulnerability — your own hesitation, credibility\n1:00 Core problem — the flawed thinking pattern, 'aha' moment\n1:45 The solution — action before motivation, why it works\n2:30 Make it actionable — beginning beats perfection\n3:15 Powerful close — direct challenge, lingering thought",
      },
    ],
  },
];

export const REFERENCE_LIBRARY: Record<string, RefGroup[]> = {
  "Short form": SHORT_FORM_LIBRARY,
  Carousel: SHORT_FORM_LIBRARY,
  "Long form": LONG_FORM_LIBRARY,
  Podcast: LONG_FORM_LIBRARY,
};
