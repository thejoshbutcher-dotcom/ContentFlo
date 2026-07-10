"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { activeAccountId, profileKey } from "./accounts";
import {
  DEFAULT_ACTIONS,
  DEFAULT_FEELINGS,
  DEFAULT_FORMATS,
  DEFAULT_TOPICS,
} from "./ideation";
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

export interface ProfileFormat {
  id: string;
  name: string;
  hint?: string;
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

function defaultBuckets(): ProfileBucket[] {
  return BUCKETS.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
  }));
}

function defaultFormats(): ProfileFormat[] {
  return DEFAULT_FORMATS.map((f) => ({
    id: newId("fmt"),
    name: f.name,
    hint: f.hint,
  }));
}

type ProfileData = {
  brandName: string;
  niche: string;
  audience: string;
  offer: string;
  socials: SocialAccount[];
  buckets: ProfileBucket[];
  topics: string[];
  formats: ProfileFormat[];
  feelings: string[];
  actions: string[];
  setupComplete: boolean;
};

interface ProfileState extends ProfileData {
  update: (patch: Partial<ProfileData>) => void;
}

// A ready-to-use starting point — broad enough for any niche, editable in Setup.
export function defaultProfileData(): ProfileData {
  return {
    brandName: "",
    niche: "",
    audience: "",
    offer: "",
    socials: [],
    buckets: defaultBuckets(),
    topics: [...DEFAULT_TOPICS],
    formats: defaultFormats(),
    feelings: [...DEFAULT_FEELINGS],
    actions: [...DEFAULT_ACTIONS],
    setupComplete: false,
  };
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      ...defaultProfileData(),
      update: (patch) => set(patch),
    }),
    { name: profileKey(activeAccountId()) }
  )
);

export function newSocial(): SocialAccount {
  return { id: newId("soc"), platform: "YouTube", handle: "" };
}

export function newBucket(name = "", description = ""): ProfileBucket {
  return { id: newId("bucket"), name, description };
}

export function newFormat(name = "", hint = ""): ProfileFormat {
  return { id: newId("fmt"), name, hint };
}

// Rule-based starter buckets shaped around proven content-pillar archetypes.
export function suggestBuckets(
  niche: string,
  audience: string
): { name: string; description: string }[] {
  const n = niche.trim() || "your niche";
  const a = audience.trim() || "your audience";
  return [
    {
      name: "Educational",
      description: `Teach ${a} something useful in ${n} — tips, how-tos, breakdowns.`,
    },
    {
      name: "Entertaining",
      description: "Fun, relatable, shareable content that stops the scroll.",
    },
    {
      name: "Inspirational",
      description: "Stories, wins, and motivation that make people feel something.",
    },
    {
      name: "Personal / BTS",
      description: "Your journey, behind the scenes, the real you.",
    },
    {
      name: "Authority",
      description: `Opinions and hot takes that build trust in ${n}.`,
    },
    {
      name: "Promotional",
      description: "Offers, products, and clear calls to action.",
    },
  ];
}
