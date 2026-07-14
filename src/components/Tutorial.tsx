"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { ViewId } from "@/lib/types";

export interface TourController {
  setView: (view: ViewId) => void;
  openSampleCard: () => void;
  closeCard: () => void;
}

interface TourStep {
  selector: string;
  title: string;
  body: string;
  /** Switch the app to this view before showing the step. */
  view?: ViewId;
  /** Make sure a card editor is open (for the Plan/Script/Post step). */
  openCard?: boolean;
  /** Make sure the card editor is closed. */
  closeCard?: boolean;
  /** Clicking the highlighted element itself moves to the next step. */
  clickAdvance?: boolean;
  placement?: "right" | "left" | "top" | "bottom";
}

const STEPS: TourStep[] = [
  {
    selector: '[data-tour="brand-setup"]',
    title: "1. Brand setup",
    body: "Start here. Set your brand, niche and audience, plus the building blocks the app runs on — content buckets, topics, formats, feelings and goals. The Brainstorm generator is built entirely from these.",
    placement: "right",
  },
  {
    selector: '[data-tour="nav-ideate"]',
    title: "2. Brainstorm",
    body: "Your idea engine. Open it to spin up a fresh piece of content from your brand's building blocks.",
    view: "ideate",
    clickAdvance: true,
    placement: "right",
  },
  {
    selector: '[data-tour="brainstorm-dims"]',
    title: "3. Stack the deck",
    body: "Pick a topic, a lens (content bucket), who it's for, what they should feel and do, and a format — or hit Shuffle for a random combo. Each choice fills in your idea.",
    view: "ideate",
    placement: "left",
  },
  {
    selector: '[data-tour="add-to-pipeline"]',
    title: "4. Add to pipeline",
    body: "Happy with the idea? Send it to your production pipeline as a card. It lands in the Ideas column, ready to develop.",
    view: "ideate",
    placement: "top",
  },
  {
    selector: '[data-tour="pipeline-group"]',
    title: "5. Your pipelines",
    body: "Each content type gets its own board — Short form, Long form, Podcast and Carousels. Every card moves through the same production stages.",
    placement: "right",
  },
  {
    selector: '[data-tour="nav-board-short"]',
    title: "6. Open a board",
    body: "Let's open the Short form board. Each board is a kanban of your content, grouped by production status.",
    view: "board-short",
    clickAdvance: true,
    placement: "right",
  },
  {
    selector: '[data-tour="board"]',
    title: "7. Move cards through stages",
    body: "Drag a card between columns as it moves Idea → Up Next → Scripting → Filming → Editing → Ready → Posted. The board is your production status at a glance.",
    view: "board-short",
    placement: "top",
  },
  {
    selector: ".board .content-card",
    title: "8. Open a card",
    body: "Click any card to open its editor.",
    view: "board-short",
    clickAdvance: true,
    placement: "right",
  },
  {
    selector: '[data-tour="card-tabs"]',
    title: "9. Plan · Script · Post",
    body: "Every card has three phases. Plan holds the idea and references, Script is your full writing space, and Post covers the caption, checklist and publishing details. The tab auto-picks from the card's status.",
    view: "board-short",
    openCard: true,
    placement: "bottom",
  },
  {
    selector: '[data-tour="nav-board-buckets"]',
    title: "10. Content Buckets",
    body: "Everything not yet posted, grouped by content bucket instead of status — so you can balance your themes at a glance.",
    view: "board-buckets",
    closeCard: true,
    placement: "right",
  },
  {
    selector: '[data-tour="nav-calendar"]',
    title: "11. Posting Schedule",
    body: "A calendar of everything with a posting date. Drag a card onto a day to schedule or reschedule it.",
    view: "calendar",
    placement: "right",
  },
  {
    selector: '[data-tour="nav-table"]',
    title: "12. All Content",
    body: "Every card and every property in one table. Select rows to duplicate or delete, and click any property to edit it inline. That's the tour — you're all set!",
    view: "table",
    placement: "right",
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;
const GAP = 14;
const DIALOG_W = 312;

export default function Tutorial({
  controller,
  onExit,
}: {
  controller: TourController;
  onExit: () => void;
}) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const targetRef = useRef<Element | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [dialogH, setDialogH] = useState(190);

  const ctrlRef = useRef(controller);
  ctrlRef.current = controller;

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  const next = () => setStep((i) => Math.min(i + 1, STEPS.length - 1));
  const back = () => setStep((i) => Math.max(i - 1, 0));

  // Put the app into the state each step needs (view / card editor open).
  useEffect(() => {
    const c = ctrlRef.current;
    const s = STEPS[step];
    if (s.view) c.setView(s.view);
    if (s.closeCard) c.closeCard();
    if (s.openCard) c.openSampleCard();
  }, [step]);

  // Track the target's position every frame so the spotlight stays glued to it
  // through view switches, scrolling and layout shifts.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = document.querySelector(STEPS[step].selector);
      targetRef.current = el;
      if (el) {
        const r = el.getBoundingClientRect();
        setRect((prev) => {
          if (
            prev &&
            Math.abs(prev.top - r.top) < 0.5 &&
            Math.abs(prev.left - r.left) < 0.5 &&
            Math.abs(prev.width - r.width) < 0.5 &&
            Math.abs(prev.height - r.height) < 0.5
          ) {
            return prev;
          }
          return { top: r.top, left: r.left, width: r.width, height: r.height };
        });
      } else {
        setRect((prev) => (prev === null ? prev : null));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  useLayoutEffect(() => {
    if (dialogRef.current) setDialogH(dialogRef.current.offsetHeight);
  }, [step, rect]);

  // Clicking the highlighted element itself advances (real click-through).
  useEffect(() => {
    if (!current.clickAdvance) return;
    const onClick = (e: MouseEvent) => {
      const el = targetRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) {
        window.setTimeout(next, 80);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, current.clickAdvance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  // Spotlight box (padded target) or null when the target isn't on screen.
  const spot = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  // Dialog position: beside the target per placement, clamped to the viewport.
  let dTop: number;
  let dLeft: number;
  if (spot) {
    const place = current.placement ?? "right";
    if (place === "right") {
      dLeft = spot.left + spot.width + GAP;
      dTop = spot.top;
    } else if (place === "left") {
      dLeft = spot.left - DIALOG_W - GAP;
      dTop = spot.top;
    } else if (place === "top") {
      dLeft = spot.left;
      dTop = spot.top - dialogH - GAP;
    } else {
      dLeft = spot.left;
      dTop = spot.top + spot.height + GAP;
    }
    dLeft = Math.max(12, Math.min(dLeft, vw - DIALOG_W - 12));
    dTop = Math.max(12, Math.min(dTop, vh - dialogH - 12));
  } else {
    dLeft = (vw - DIALOG_W) / 2;
    dTop = (vh - dialogH) / 2;
  }

  return (
    <div className="tour-root">
      {spot ? (
        <div
          className="tour-spotlight"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
          }}
        />
      ) : (
        <div className="tour-scrim" />
      )}

      <div
        className="tour-dialog"
        ref={dialogRef}
        style={{ top: dTop, left: dLeft, width: DIALOG_W }}
      >
        <button className="tour-close" onClick={onExit} aria-label="Close tutorial">
          <X size={15} />
        </button>
        <h4 className="tour-title">{current.title}</h4>
        <p className="tour-body">{current.body}</p>
        <div className="tour-foot">
          <span className="tour-count t-mono">
            {step + 1} / {STEPS.length}
          </span>
          <div className="tour-nav">
            <button
              className="tour-btn"
              onClick={back}
              disabled={isFirst}
              aria-label="Previous step"
            >
              <ArrowLeft size={15} />
            </button>
            {isLast ? (
              <button className="tour-btn tour-done" onClick={onExit}>
                Done
              </button>
            ) : (
              <button className="tour-btn tour-next" onClick={next} aria-label="Next step">
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
