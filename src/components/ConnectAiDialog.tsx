"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, X } from "lucide-react";

/** The public address of CreatorFlo's MCP server (see src/app/api/mcp). */
export const MCP_URL = "https://creatorflo.io/api/mcp";

/** Claude's own "add custom connector" deep link, prefilled. */
const CLAUDE_ADD_URL =
  "https://claude.ai/customize/connectors?modal=add-custom-connector" +
  `&connectorName=CreatorFlo&connectorUrl=${encodeURIComponent(MCP_URL)}`;

const CLI = `claude mcp add --transport http creatorflo ${MCP_URL}`;

type App = "claude" | "chatgpt" | "code";
const APPS: { id: App; label: string }[] = [
  { id: "claude", label: "Claude" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "code", label: "Claude Code" },
];

const LAST_APP = "cf-connect-app";

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="connect-field">
      <code className="t-mono">{value}</code>
      <button
        className="icon-btn"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
        aria-label="Copy"
        title="Copy"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

/**
 * "MCP Connector": connect CreatorFlo to an AI app so it can read boards and
 * write outlines/scripts into cards. Claude has a one-click add link; ChatGPT
 * only one-clicks apps listed in its directory, so it gets the paste-the-URL
 * steps instead.
 */
export default function ConnectAiDialog({ onClose }: { onClose: () => void }) {
  const [app, setApp] = useState<App>(() => {
    try {
      const v = localStorage.getItem(LAST_APP);
      if (v === "claude" || v === "chatgpt" || v === "code") return v;
    } catch {}
    return "claude";
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  function pick(a: App) {
    setApp(a);
    try {
      localStorage.setItem(LAST_APP, a);
    } catch {}
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="inspo-add connect-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="MCP Connector"
      >
        <div className="inspo-add-head">
          <span className="section-title">MCP Connector</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <p className="share-lede">
          Connect CreatorFlo to your AI so it can read your boards and cards,
          and write outlines, scripts and new ideas straight into them. It acts
          as you, sees only the profiles you can see, and never deletes
          anything.
        </p>

        <div className="comp-seg connect-seg" role="tablist">
          {APPS.map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={app === a.id}
              className={app === a.id ? "on" : ""}
              onClick={() => pick(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>

        {app === "claude" && (
          <>
            <a
              className="btn btn-amber connect-go"
              href={CLAUDE_ADD_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Connect CreatorFlo <ExternalLink size={14} />
            </a>
            <ol className="install-steps connect-steps">
              <li>
                Click <strong>Connect CreatorFlo</strong>. Claude opens with the
                connector filled in — click <strong>Add</strong>
              </li>
              <li>
                Click <strong>Connect</strong>, sign in to CreatorFlo and
                choose <strong>Allow</strong>
              </li>
              <li>
                Works in Claude on the web, desktop and phone. In the desktop
                app, quit and reopen Claude if it doesn&rsquo;t show up
              </li>
            </ol>
            <div className="prop-label t-eyebrow">Or add it by hand</div>
            <p className="share-hint">
              In Claude, go to <strong>Settings → Connectors → Add custom
              connector</strong>, name it CreatorFlo and paste:
            </p>
            <CopyField value={MCP_URL} />
          </>
        )}

        {app === "chatgpt" && (
          <>
            <ol className="install-steps connect-steps">
              <li>
                In ChatGPT, open <strong>Settings → Apps &amp; Connectors →
                Advanced settings</strong> and turn on{" "}
                <strong>Developer mode</strong>
              </li>
              <li>
                Back in <strong>Apps &amp; Connectors</strong>, click{" "}
                <strong>Create</strong>. Name it CreatorFlo, paste the URL
                below, and set authentication to <strong>OAuth</strong>
              </li>
              <li>
                Click <strong>Create</strong>, sign in to CreatorFlo and
                choose <strong>Allow</strong>
              </li>
              <li>
                In a chat, pick CreatorFlo from the <strong>+</strong> menu
                (under Developer mode) to use it
              </li>
            </ol>
            <CopyField value={MCP_URL} />
            <p className="share-hint">
              ChatGPT only offers one-click installs for apps in its app
              directory; CreatorFlo isn&rsquo;t listed there yet. Developer
              mode needs a paid ChatGPT plan, and the menu names can vary a
              little between plans.
            </p>
          </>
        )}

        {app === "code" && (
          <>
            <p className="share-hint">Run this in your terminal:</p>
            <CopyField value={CLI} />
            <p className="share-hint">
              Then start <code>claude</code>, type <code>/mcp</code>, pick
              creatorflo and choose <strong>Authenticate</strong> to sign in.
            </p>
          </>
        )}

        <p className="share-note">
          To disconnect later: open <strong>Your profile</strong> (bottom-left)
          → Connected apps.
        </p>
      </div>
    </div>
  );
}
