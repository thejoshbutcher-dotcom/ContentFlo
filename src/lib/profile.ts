"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { activeAccountId, profileKey } from "./accounts";
import { RELATABLE_TOPICS } from "./ideation";
import { BUCKETS } from "./seed";
import { newId } from "./templates";

export interface SocialAccount {
  id: string;
  platform: string;
  handle: string;
}

export interface ProfileBucket {
  id: string;
  name: string;
  description?: string;
}

export const PLATFORMS = [
  "YouTube",
  "Instagram",
  "TikTok",
  "X (Twitter)",
  "LinkedIn",
  "Facebook",
  "Threads",
  "Newsletter",
  "Podcast",
  "Other",
];

interface ProfileState {
  brandName: string;
  niche: string;
  audience: string;
  offer: string;
  socials: SocialAccount[];
  buckets: ProfileBucket[];
  topics: string[];
  setupComplete: boolean;
  update: (
    patch: Partial<
      Pick<
        ProfileState,
        | "brandName"
        | "niche"
        | "audience"
        | "offer"
        | "socials"
        | "buckets"
        | "topics"
        | "setupComplete"
      >
    >
  ) => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      brandName: "",
      niche: "",
      audience: "",
      offer: "",
      socials: [],
      // Existing planner data references these bucket ids, so they are the defaults
      buckets: BUCKETS.map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
      })),
      topics: [...RELATABLE_TOPICS],
      setupComplete: false,
      update: (patch) => set(patch),
    }),
    { name: profileKey(activeAccountId()) }
  )
);

export const EMPTY_PROFILE = {
  brandName: "",
  niche: "",
  audience: "",
  offer: "",
  socials: [] as SocialAccount[],
  buckets: [] as ProfileBucket[],
  topics: [...RELATABLE_TOPICS],
  setupComplete: false,
};

export function newSocial(): SocialAccount {
  return { id: newId("soc"), platform: "YouTube", handle: "" };
}

export function newBucket(name = "", description = ""): ProfileBucket {
  return { id: newId("bucket"), name, description };
}

// Rule-based starter buckets shaped around proven content pillar archetypes.
export function suggestBuckets(
  niche: string,
  audience: string
): { name: string; description: string }[] {
  const n = niche.trim() || "your niche";
  const a = audience.trim() || "your audience";
  return [
    {
      name: "Tutorials & how-tos",
      description: `Step-by-step teaching that builds authority in ${n}.`,
    },
    {
      name: "Behind the scenes",
      description: "Build in public — the real process, the wins, the messes.",
    },
    {
      name: "Hot takes & myths",
      description: `Opinions and misconceptions in ${n} that spark comments and shares.`,
    },
    {
      name: "Tools & workflows",
      description: "The stack you actually use — honest reviews, setups, systems.",
    },
    {
      name: "Results & lessons",
      description: "Numbers, case studies, receipts — proof content that converts.",
    },
    {
      name: "Personal stories",
      description: `The journey — failures and turning points that make ${a} feel seen.`,
    },
  ];
}
