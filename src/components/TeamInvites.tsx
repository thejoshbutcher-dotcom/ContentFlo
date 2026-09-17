"use client";

import { useState } from "react";
import { Loader2, Users } from "lucide-react";
import { acceptInvite, deleteInvite, useTeam } from "@/lib/team";
import { refreshAccounts, switchAccount } from "@/lib/workspace";

/**
 * Invites addressed to the signed-in user. They wait here rather than behind a
 * link in an email, so an invite works even when the email never arrives —
 * and so accepting is always a deliberate tap inside the app.
 */
export default function TeamInvites({ onJoined }: { onJoined: () => void }) {
  const incoming = useTeam((s) => s.incoming);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (!incoming.length) return null;

  return (
    <div className="team-invites" role="status">
      {incoming.map((inv) => (
        <div key={inv.id} className="team-invite">
          <Users size={16} className="team-invite-icon" />
          <div className="team-invite-text">
            <strong>{inv.inviterEmail ?? "Someone"}</strong> invited you to{" "}
            <strong>{inv.profileName || "a profile"}</strong>{" "}
            <span className="muted">
              &middot; {inv.role === "editor" ? "can edit" : "view only"}
            </span>
            {error && busy === null && <div className="team-invite-error">{error}</div>}
          </div>
          <button
            className="btn btn-ghost"
            disabled={busy !== null}
            onClick={() => void deleteInvite(inv.id)}
          >
            Decline
          </button>
          <button
            className="btn btn-amber"
            disabled={busy !== null}
            onClick={async () => {
              setBusy(inv.id);
              setError("");
              const res = await acceptInvite(inv.id);
              if (!res.ok || !res.profileId) {
                setError(res.error ?? "Couldn't accept that invite.");
                setBusy(null);
                return;
              }
              await refreshAccounts();
              await switchAccount(res.profileId);
              setBusy(null);
              onJoined();
            }}
          >
            {busy === inv.id ? <Loader2 size={14} className="spin" /> : null}
            Accept
          </button>
        </div>
      ))}
    </div>
  );
}
