"use client";

import { create } from "zustand";

/**
 * How this device installs a web app — which decides what we can offer:
 *  - "prompt":     the browser hands us a real install prompt (Android Chrome,
 *                  desktop Chrome/Edge). One tap.
 *  - "ios":        iPhone/iPad. No API; the person uses Share → Add to Home
 *                  Screen, so we show them where that is.
 *  - "mac-safari": Safari on a Mac. File → Add to Dock.
 *  - null:         nothing to offer (Firefox desktop, in-app browsers…), or
 *                  already running as the installed app.
 */
export type InstallKind = "prompt" | "ios" | "mac-safari" | null;

/** Chrome's install event; not in the DOM lib typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallState {
  kind: InstallKind;
  /** Is the install card on screen? */
  open: boolean;
}

export const useInstall = create<InstallState>()(() => ({
  kind: null,
  open: false,
}));

let deferred: BeforeInstallPromptEvent | null = null;

const DISMISSED_KEY = "cf-install-dismissed";
const VISITS_KEY = "cf-visits";

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own flag for a home-screen launch.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectManualKind(): InstallKind {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; the touch points give it away.
  const iOS =
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iOS) return "ios";

  const safari = /Safari\//.test(ua) && !/Chrome|Chromium|Edg\/|OPR\//.test(ua);
  if (/Macintosh/.test(ua) && safari) return "mac-safari";
  return null;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — the card may simply show again next time */
  }
}

/**
 * Work out what this device can do, and — from the second visit on, if it was
 * never dismissed — offer it once. Not on the first visit: that one belongs to
 * the tour. Returns a cleanup function.
 */
export function initInstall(): () => void {
  if (isStandalone()) return () => {};

  const visits = Number(read(VISITS_KEY) ?? "0") + 1;
  write(VISITS_KEY, String(visits));
  const mayAutoOpen = visits >= 2 && !read(DISMISSED_KEY);

  let timer: ReturnType<typeof setTimeout> | null = null;
  const offer = (kind: InstallKind) => {
    useInstall.setState({ kind });
    if (kind && mayAutoOpen && !timer) {
      // Let the app settle first; nobody wants a card in their face on load.
      timer = setTimeout(() => useInstall.setState({ open: true }), 6000);
    }
  };

  const onPrompt = (e: Event) => {
    e.preventDefault(); // keep Chrome's own mini-infobar out of the way
    deferred = e as BeforeInstallPromptEvent;
    offer("prompt");
  };
  const onInstalled = () => {
    deferred = null;
    useInstall.setState({ kind: null, open: false });
  };

  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  offer(detectManualKind());

  return () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

/** Open the card on request (sidebar / profile menu). */
export function openInstall() {
  useInstall.setState({ open: true });
}

/** Close it, and don't volunteer it again — it stays available in the menu. */
export function dismissInstall() {
  write(DISMISSED_KEY, new Date().toISOString());
  useInstall.setState({ open: false });
}

/** Fire the browser's install dialog. Only valid when kind === "prompt". */
export async function runInstallPrompt(): Promise<void> {
  if (!deferred) return;
  const evt = deferred;
  deferred = null; // an event can only be used once
  await evt.prompt();
  const { outcome } = await evt.userChoice;
  if (outcome === "accepted") {
    useInstall.setState({ kind: null, open: false });
  } else {
    // Declined in the browser's dialog: Chrome will re-fire the event later.
    dismissInstall();
    useInstall.setState({ kind: null });
  }
}

// Dev-only: lets each platform's card be exercised from a desktop browser.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as unknown as { __cfInstall?: unknown }).__cfInstall = useInstall;
}
