"use client";

import { Eye } from "lucide-react";
import { useAccounts } from "@/lib/accounts";
import { personName, useTeam } from "@/lib/team";
import Avatar from "./Avatar";

/**
 * Top-bar strip for a shared profile: who else has it open right now, and —
 * for a viewer — a standing reminder that nothing here can be changed.
 */
export default function TeamPresence() {
  const peers = useTeam((s) => s.peers);
  const role = useTeam((s) => s.role);
  const sharedBy = useAccounts(
    (s) => s.accounts.find((a) => a.id === s.activeId)?.sharedBy
  );

  if (!peers.length && role !== "viewer") return null;

  return (
    <div className="team-presence">
      {role === "viewer" && (
        <span
          className="view-only-chip"
          title={`${sharedBy ?? "The owner"} shared this profile with you as view-only`}
        >
          <Eye size={11} /> View only
        </span>
      )}
      {peers.length > 0 && (
        <span
          className="peer-stack"
          title={`Here now: ${peers.map((p) => personName(p.email, null)).join(", ")}`}
        >
          {peers.slice(0, 4).map((p) => (
            <Avatar key={p.userId} email={p.email} size={24} />
          ))}
          {peers.length > 4 && <span className="peer-more">+{peers.length - 4}</span>}
        </span>
      )}
    </div>
  );
}
