"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, LogOut, Send, Users, X } from "lucide-react";
import { getCloudEmail } from "@/lib/sync";
import {
  deleteInvite,
  Invite,
  loadTeam,
  Member,
  MemberRole,
  removeMember,
  sendInvite,
  setMemberRole,
  useTeam,
} from "@/lib/team";
import { deleteAccount, roleOf } from "@/lib/workspace";
import { useAccounts } from "@/lib/accounts";

const ROLE_HELP: Record<MemberRole, string> = {
  editor: "Can add, edit and move everything",
  viewer: "Can look, but not change anything",
};

/**
 * Who's on this profile. The owner invites, changes roles and removes people;
 * everyone else sees the team and can leave.
 *
 * A "profile" is the unit of sharing on purpose: it's one channel's boards,
 * calendar, inspiration, competitors and brand setup. Share the channel your
 * editor works on; your other profiles stay yours alone.
 */
export default function ShareDialog({ onLeft }: { onLeft: () => void }) {
  const target = useTeam((s) => s.shareFor);
  const close = useCallback(() => useTeam.setState({ shareFor: null }), []);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [target, close]);

  if (!target) return null;
  return <Dialog key={target.id} id={target.id} name={target.name} onClose={close} onLeft={onLeft} />;
}

function Dialog({
  id,
  name,
  onClose,
  onLeft,
}: {
  id: string;
  name: string;
  onClose: () => void;
  onLeft: () => void;
}) {
  const isOwner = roleOf(id) === "owner";
  const sharedBy = useAccounts((s) => s.accounts.find((a) => a.id === id)?.sharedBy);
  const me = getCloudEmail()?.toLowerCase() ?? "";

  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    const team = await loadTeam(id);
    setMembers(team.members);
    setInvites(team.invites);
  }, [id]);

  useEffect(() => {
    let live = true;
    loadTeam(id).then((team) => {
      if (!live) return;
      setMembers(team.members);
      setInvites(team.invites);
    });
    return () => {
      live = false;
    };
  }, [id]);

  async function invite() {
    const to = email.trim().toLowerCase();
    if (!to || busy) return;
    setBusy(true);
    setError("");
    setNote("");
    const res = await sendInvite(id, to, role);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't send that invite.");
      return;
    }
    setEmail("");
    // Say what actually happened — the three cases need different follow-ups.
    setNote(
      !res.licensed
        ? `${to} doesn't own CreatorFlo yet. The invite will be waiting as soon as they buy it with that email${res.emailed ? " — we've emailed them the details." : "."}`
        : res.emailed
          ? `Invite emailed to ${to}. It'll also be waiting when they next open CreatorFlo.`
          : `Invite created. It'll be waiting for ${to} the next time they open CreatorFlo.`
    );
    await reload();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/login`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — nothing to fall back to */
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="inspo-add share-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Share ${name}`}
      >
        <div className="inspo-add-head">
          <span className="section-title">
            <Users size={14} style={{ display: "inline", marginRight: 7, verticalAlign: -2 }} />
            Share &ldquo;{name}&rdquo;
          </span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {isOwner ? (
          <>
            <p className="share-lede">
              Teammates get this profile&rsquo;s boards, calendar, inspiration and
              competitors &mdash; and see each other&rsquo;s changes live. Your other
              profiles stay private. Everyone needs their own copy of CreatorFlo.
            </p>
            <div className="share-invite">
              <input
                type="email"
                value={email}
                autoFocus
                placeholder="teammate@email.com"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void invite();
                }}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as MemberRole)}
                aria-label="Role"
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button className="btn btn-amber" onClick={invite} disabled={busy || !email.trim()}>
                {busy ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                Invite
              </button>
            </div>
            <div className="share-hint">{ROLE_HELP[role]}</div>
            {error && <div className="inspo-add-error">{error}</div>}
            {note && <div className="share-note">{note}</div>}
          </>
        ) : (
          <p className="share-lede">
            {sharedBy ? `${sharedBy} shared this profile with you.` : "This profile was shared with you."}{" "}
            You {roleOf(id) === "editor" ? "can edit everything in it" : "can view it, but not make changes"}.
          </p>
        )}

        <div className="share-list">
          <div className="share-row">
            <span className="share-avatar owner">{(isOwner ? me : sharedBy ?? "?")[0]?.toUpperCase()}</span>
            <span className="share-email">{isOwner ? `${me} (you)` : sharedBy ?? "Owner"}</span>
            <span className="share-role">Owner</span>
          </div>

          {members === null && (
            <div className="share-row muted">
              <Loader2 size={13} className="spin" /> Loading team…
            </div>
          )}

          {members?.map((m) => (
            <div key={m.userId} className="share-row">
              <span className="share-avatar">{m.email[0]?.toUpperCase()}</span>
              <span className="share-email">
                {m.email}
                {m.email === me ? " (you)" : ""}
              </span>
              {isOwner ? (
                <>
                  <select
                    value={m.role}
                    aria-label={`Role for ${m.email}`}
                    onChange={async (e) => {
                      await setMemberRole(id, m.userId, e.target.value as MemberRole);
                      await reload();
                    }}
                  >
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                  </select>
                  <button
                    className="share-x"
                    aria-label={`Remove ${m.email}`}
                    onClick={async () => {
                      if (!confirm(`Remove ${m.email} from "${name}"? They lose access immediately.`)) return;
                      await removeMember(id, m.userId);
                      await reload();
                    }}
                  >
                    <X size={13} />
                  </button>
                </>
              ) : (
                <span className="share-role">{m.role === "editor" ? "Can edit" : "Can view"}</span>
              )}
            </div>
          ))}

          {invites.map((inv) => (
            <div key={inv.id} className="share-row pending">
              <span className="share-avatar ghost">{inv.email[0]?.toUpperCase()}</span>
              <span className="share-email">{inv.email}</span>
              <span className="share-role">Invited &middot; {inv.role === "editor" ? "edit" : "view"}</span>
              {isOwner && (
                <button
                  className="share-x"
                  aria-label={`Revoke invite for ${inv.email}`}
                  onClick={async () => {
                    await deleteInvite(inv.id);
                    await reload();
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="share-foot">
          {isOwner ? (
            <button className="btn btn-ghost" onClick={copyLink}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy sign-in link"}
            </button>
          ) : (
            <button
              className="btn btn-ghost share-leave"
              onClick={async () => {
                if (!confirm(`Leave "${name}"? You'll need a new invite to get back in.`)) return;
                onClose();
                await deleteAccount(id);
                onLeft();
              }}
            >
              <LogOut size={14} /> Leave this profile
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
