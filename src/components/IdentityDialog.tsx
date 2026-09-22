"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, X } from "lucide-react";
import { ownName, saveMyIdentity, useTeam } from "@/lib/team";
import Avatar from "./Avatar";

/** Square-crop and shrink a picture to a tiny JPEG that fits in the row. */
function toAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      canvas.getContext("2d")!.drawImage(img, sx, sy, side, side, 0, 0, 128, 128);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Your name and picture, as teammates see them. Saved to your account, not a
 * profile — you're the same person on every board you're on.
 */
export default function IdentityDialog({ onClose }: { onClose: () => void }) {
  const me = useTeam((s) => s.me);
  const directory = useTeam((s) => s.directory);
  const current = me ? directory[me.id] : undefined;

  const [name, setName] = useState(current?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement | null>(null);

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

  if (!me) return null;

  async function run(patch: Parameters<typeof saveMyIdentity>[0]) {
    setBusy(true);
    setError("");
    const err = await saveMyIdentity(patch);
    setBusy(false);
    if (err) setError(err);
    return !err;
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    try {
      await run({ avatar: await toAvatar(f) });
    } catch {
      setError("Couldn't read that image.");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="inspo-add identity-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Your profile"
      >
        <div className="inspo-add-head">
          <span className="section-title">Your profile</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="identity-row">
          <button
            className="identity-avatar"
            onClick={() => file.current?.click()}
            disabled={busy}
            title="Change picture"
            aria-label="Change picture"
          >
            <Avatar email={me.email} size={72} />
            <span className="identity-avatar-edit">
              {busy ? <Loader2 size={14} className="spin" /> : <Camera size={14} />}
            </span>
          </button>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="identity-fields">
            <div className="prop-label t-eyebrow">Display name</div>
            <input
              className="prop-input"
              value={name}
              autoFocus
              maxLength={60}
              placeholder={ownName(me.id, me.email)}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void run({ name: name.trim() }).then((ok) => ok && onClose());
              }}
            />
            <div className="identity-email t-mono" title={me.email}>
              {me.email}
            </div>
          </div>
        </div>

        <p className="share-hint">
          This is how you appear to teammates &mdash; on cards you&rsquo;re assigned
          to, in review notes, and in the team list.
        </p>
        {error && <div className="inspo-add-error">{error}</div>}

        <div className="share-foot">
          {current?.avatar ? (
            <button
              className="btn btn-ghost share-leave"
              disabled={busy}
              onClick={() => void run({ avatar: null })}
            >
              <Trash2 size={14} /> Remove picture
            </button>
          ) : (
            <span />
          )}
          <button
            className="btn btn-amber"
            disabled={busy}
            onClick={() => void run({ name: name.trim() }).then((ok) => ok && onClose())}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
