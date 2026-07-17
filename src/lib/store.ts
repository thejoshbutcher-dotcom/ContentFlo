"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { activeAccountId, plannerKey } from "./accounts";
import { seedCards } from "./seed";
import { newId, sectionsFor } from "./templates";
import { ContentCard, ContentType, Section } from "./types";

// Undo history for card-level actions (delete / move / duplicate). Each entry
// knows how to reverse itself; kept small and never persisted.
type UndoAction =
  | { kind: "readd"; cards: ContentCard[] } // undo a delete
  | { kind: "patch"; patches: { id: string; patch: Partial<ContentCard> }[] } // undo a move
  | { kind: "remove"; ids: string[] }; // undo a duplicate

const HISTORY_MAX = 50;

interface PlannerState {
  cards: ContentCard[];
  history: UndoAction[];
  addCard: (partial: Partial<ContentCard> & { title: string }) => ContentCard;
  updateCard: (id: string, patch: Partial<ContentCard>) => void;
  deleteCard: (id: string) => void;
  deleteCards: (ids: string[]) => void;
  duplicateCards: (ids: string[]) => string[];
  moveCard: (id: string, status: string) => void;
  moveCardBucket: (id: string, bucketId: string) => void;
  updateSection: (cardId: string, sectionId: string, patch: Partial<Section>) => void;
  toggleChecklistItem: (cardId: string, sectionId: string, itemId: string) => void;
  applyTemplate: (cardId: string, type: ContentType) => void;
  importAll: (cards: ContentCard[]) => void;
  resetToSeed: () => void;
  /** Reverse the most recent card delete / move / duplicate. */
  undo: () => void;
}

export const usePlanner = create<PlannerState>()(
  persist(
    (set, get) => {
      const push = (action: UndoAction) =>
        set({ history: [...get().history, action].slice(-HISTORY_MAX) });

      return {
      cards: seedCards(),
      history: [],

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

      deleteCard: (id) => {
        const card = get().cards.find((c) => c.id === id);
        if (card) push({ kind: "readd", cards: [card] });
        set({ cards: get().cards.filter((c) => c.id !== id) });
      },

      deleteCards: (ids) => {
        const kill = new Set(ids);
        const removed = get().cards.filter((c) => kill.has(c.id));
        if (removed.length) push({ kind: "readd", cards: removed });
        set({ cards: get().cards.filter((c) => !kill.has(c.id)) });
      },

      duplicateCards: (ids) => {
        const pick = new Set(ids);
        const now = new Date().toISOString();
        // Fresh ids for the card and every nested section/checklist item so the
        // sync layer treats the copies as brand-new rows, not edits.
        const copies = get()
          .cards.filter((c) => pick.has(c.id))
          .map((c) => ({
            ...c,
            id: newId("card"),
            title: c.title ? `${c.title} (copy)` : "Untitled (copy)",
            sections: c.sections.map((s) => ({
              ...s,
              id: newId("sec"),
              items: s.items?.map((it) => ({ ...it, id: newId("chk") })),
              images: s.images ? [...s.images] : undefined,
            })),
            createdAt: now,
            updatedAt: now,
          }));
        set({ cards: [...copies, ...get().cards] });
        push({ kind: "remove", ids: copies.map((c) => c.id) });
        return copies.map((c) => c.id);
      },

      moveCard: (id, status) => {
        const card = get().cards.find((c) => c.id === id);
        if (card && card.status !== status) {
          push({ kind: "patch", patches: [{ id, patch: { status: card.status } }] });
        }
        get().updateCard(id, { status });
      },

      moveCardBucket: (id, bucketId) => {
        const card = get().cards.find((c) => c.id === id);
        if (card && card.bucketId !== bucketId) {
          push({ kind: "patch", patches: [{ id, patch: { bucketId: card.bucketId } }] });
        }
        get().updateCard(id, { bucketId });
      },

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
                  // Must bump updatedAt: it drives last-write-wins across
                  // devices, so a stale timestamp lets an older edit win.
                  updatedAt: new Date().toISOString(),
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

      undo: () => {
        const h = get().history;
        if (!h.length) return;
        const action = h[h.length - 1];
        set({ history: h.slice(0, -1) });
        const now = new Date().toISOString();

        if (action.kind === "readd") {
          // Bump updatedAt so the restore wins last-write-wins and clears the
          // cloud tombstone (via cardToRow's deleted_at: null on the upsert).
          const restored = action.cards.map((c) => ({ ...c, updatedAt: now }));
          const existing = new Set(get().cards.map((c) => c.id));
          set({
            cards: [
              ...restored.filter((c) => !existing.has(c.id)),
              ...get().cards,
            ],
          });
        } else if (action.kind === "patch") {
          const byId = new Map(action.patches.map((p) => [p.id, p.patch]));
          set({
            cards: get().cards.map((c) =>
              byId.has(c.id) ? { ...c, ...byId.get(c.id), updatedAt: now } : c
            ),
          });
        } else {
          const rm = new Set(action.ids);
          set({ cards: get().cards.filter((c) => !rm.has(c.id)) });
        }
      },
      };
    },
    {
      name: plannerKey(activeAccountId()),
      version: 2,
      // Never persist the undo history — it resets each session.
      partialize: (state) => ({ cards: state.cards }),
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
