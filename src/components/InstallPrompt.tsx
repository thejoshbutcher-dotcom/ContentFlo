"use client";

import { useEffect } from "react";
import Image from "next/image";
import { Download, Share, SquarePlus, X } from "lucide-react";
import {
  dismissInstall,
  initInstall,
  runInstallPrompt,
  useInstall,
} from "@/lib/install";

/**
 * "Install CreatorFlo" — the answer to "I forget it's in a browser tab".
 *
 * CreatorFlo is already a fully installable app (own icon, full screen, no
 * browser chrome); what's missing is that nobody knows the gesture. So: a real
 * one-tap Install where the browser allows it, and exact directions where it
 * doesn't (Apple offers no install API on iPhone or in Safari).
 *
 * Volunteered once, from the second visit, never inside the installed app —
 * and always reachable from the sidebar / profile menu afterwards.
 */
export default function InstallPrompt() {
  const kind = useInstall((s) => s.kind);
  const open = useInstall((s) => s.open);

  useEffect(() => initInstall(), []);

  if (!open || !kind) return null;

  return (
    <div className="install-card" role="dialog" aria-label="Install CreatorFlo">
      <button className="install-x" onClick={dismissInstall} aria-label="Dismiss">
        <X size={14} />
      </button>

      <div className="install-head">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={40}
          height={40}
          className="install-icon"
        />
        <div>
          <div className="install-title">Install CreatorFlo</div>
          <div className="install-sub">
            Its own icon, full screen, no browser tabs to lose it in.
          </div>
        </div>
      </div>

      {kind === "prompt" && (
        <div className="install-actions">
          <button className="btn btn-ghost" onClick={dismissInstall}>
            Not now
          </button>
          <button className="btn btn-amber" onClick={() => void runInstallPrompt()}>
            <Download size={14} /> Install
          </button>
        </div>
      )}

      {kind === "ios" && (
        <ol className="install-steps">
          <li>
            Tap <Share size={14} className="install-glyph" /> <strong>Share</strong>{" "}
            in your browser&rsquo;s toolbar
          </li>
          <li>
            Scroll down and tap <SquarePlus size={14} className="install-glyph" />{" "}
            <strong>Add to Home Screen</strong>
          </li>
          <li>
            Tap <strong>Add</strong>, then open CreatorFlo from your home
            screen
          </li>
        </ol>
      )}

      {kind === "mac-safari" && (
        <ol className="install-steps">
          <li>
            In the menu bar, choose <strong>File → Add to Dock…</strong>
          </li>
          <li>
            Click <strong>Add</strong>. CreatorFlo now opens from your Dock
            as its own app
          </li>
        </ol>
      )}
    </div>
  );
}
