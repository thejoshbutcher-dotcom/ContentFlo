"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { activeAccountId, plannerKey } from "./accounts";
import { seedCards } from "./seed";
import { newId, sectionsFor } from "./templates";
import { ContentCard, ContentType, Section } from "./types";

interface PlannerState {
  cards: ContentCard[];
  addCard: (partial: Partial<ContentCard> & { title: string }) => ContentCard;
  updateCard: (id: string, patch: Partial<ContentCard>) => void;
  deleteCard: (id: string) => void;
  moveCard: (id: string, status: string) => void;
  updateSection: (cardId: string, sectionId: string, patch: Partial<Section>) => void;
  toggleChecklistItem: (cardId: string, sectionId: string, itemId: string) => void;
  applyTemplate: (cardId: string, type: ContentType) => void;
  importAll: (cards: ContentCard[]) => void;
  resetToSeed: () => void;
}

export const usePlanner = create<PlannerState>()(
  persist(
    (set, get) => ({
      cards: seedCards(),

      addCard: (partial) => {
        const now = new Date().toISOString();
        const card: ContentCard = {
          id: newId("card"),
          status: "ideas",
          sections: sectionsFor(partial.contentType),
          createdAt: now,
          updatedAt: now,
          ...partial,
        };
        set({ cards: [card, ...get().cards] });
        return card;
      },

      updateCard: (id, patch) =>
        set({
          cards: get().cards.map((c) =>
            c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c
          ),
        }),

      deleteCard: (id) => set({ cards: get().cards.filter((c) => c.id !== id) }),

      moveCard: (id, status) => get().updateCard(id, { status }),

      updateSection: (cardId, sectionId, patch) =>
        set({
          cards: get().cards.map((c) =>
            c.id === cardId
              ? {
                  ...c,
                  updatedAt: new Date().toISOString(),
                  sections: c.sections.map((s) =>
                    s.id === sectionId ? { ...s, ...patch } : s
                  ),
                }
              : c
          ),
        }),

      toggleChecklistItem: (cardId, sectionId, itemId) =>
        set({
          cards: get().cards.map((c) =>
            c.id === cardId
              ? {
                  ...c,
                  sections: c.sections.map((s) =>
                    s.id === sectionId && s.items
                      ? {
                          ...s,
                          items: s.items.map((it) =>
                            it.id === itemId ? { ...it, done: !it.done } : it
                          ),
                        }
                      : s
                  ),
                }
              : c
          ),
        }),

      applyTemplate: (cardId, type) =>
        get().updateCard(cardId, { contentType: type, sections: sectionsFor(type) }),

      importAll: (cards) => set({ cards }),

      resetToSeed: () => set({ cards: seedCards() }),
    }),
    {
      name: plannerKey(activeAccountId()),
      version: 2,
      migrate: (persisted) => {
        const state = persisted as PlannerState;
        const IDEA_LANES: Record<string, string> = {
          "og-ideas": "ideas",
          "ideas-ref": "ideas",
          "ideas-2026": "ideas",
        };
        if (state?.cards) {
          state.cards = state.cards.map((c) => ({
            ...c,
            status:
              IDEA_LANES[c.status] ??
              (c.status === "packaged" && c.contentType !== "Long form"
                ? "up-next"
                : c.status),
          }));
        }
        return state;
      },
    }
  )
);
