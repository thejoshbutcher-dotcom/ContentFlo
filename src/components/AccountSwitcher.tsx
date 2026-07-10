"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ChevronUp,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { useAccounts } from "@/lib/accounts";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import {
  createAccount,
  deleteAccount,
  renameAccount,
  switchAccount,
} from "@/lib/workspace";

export interface AccountMenuAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

function AccountMenu({
  onDone,
  onSwitched,
  actions,
}: {
  onDone: () => void;
  onSwitched: (isNew: boolean) => void;
  actions?: AccountMenuAction[];
}) {
  const accounts = useAccounts((s) => s.accounts);
  const activeId = useAccounts((s) => s.activeId);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [email, setEmail] = useState<string | null>(null);

  // Only signed-in users get a Sign out control.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setEmail(data.user?.email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function pick(id: string) {
    if (id !== activeId) {
      await switchAccount(id);
      onSwitched(false);
    }
    onDone();
  }

  async function createNew() {
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    await createAccount(name);
    onSwitched(true);
    onDone();
  }

  function startRename(id: string, current: string) {
    setEditingId(id);
    setEditName(current);
  }

  function commitRename() {
    if (editingId) void renameAccount(editingId, editName);
    setEditingId(null);
    setEditName("");
  }

  return (
    <div className="acct-menu up" role="menu">
      {accounts.map((a) => (
        <div key={a.id} className={`acct-item${a.id === activeId ? " on" : ""}`}>
          {editingId === a.id ? (
            <input
              className="acct-rename"
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setEditingId(null);
                  setEditName("");
                }
              }}
              onBlur={commitRename}
            />
          ) : (
            <>
              <button className="acct-pick" onClick={() => pick(a.id)}>
                {a.id === activeId ? (
                  <Check size={13} className="acct-check" />
                ) : (
                  <span className="acct-check" />
                )}
                <span className="acct-name">{a.name}</span>
              </button>
              <button
                className="acct-edit"
                aria-label={`Rename ${a.name}`}
                onClick={() => startRename(a.id, a.name)}
              >
                <Pencil size={12} />
              </button>
              {accounts.length > 1 && (
                <button
                  className="acct-del"
                  aria-label={`Delete ${a.name}`}
                  onClick={async () => {
                    if (
                      confirm(
                        `Delete profile "${a.name}" and all of its content? This can't be undone.`
                      )
                    ) {
                      await deleteAccount(a.id);
                      onSwitched(false);
                    }
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </>
          )}
        </div>
      ))}

      <div className="acct-new">
        <input
          value={draft}
          placeholder="New profile name…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") createNew();
          }}
        />
        <button className="acct-add" onClick={createNew} aria-label="Create profile">
          <Plus size={14} />
        </button>
      </div>

      {actions && actions.length > 0 && (
        <div className="acct-actions">
          {actions.map((act) => (
            <button
              key={act.label}
              className="acct-action"
              onClick={() => {
                onDone();
                act.onClick();
              }}
            >
              {act.icon}
              {act.label}
            </button>
          ))}
        </div>
      )}

      {email && (
        <div className="acct-actions">
          <div className="acct-email t-mono" title={email}>
            {email}
          </div>
          {/* POST to a route handler so the server can clear the auth cookies. */}
          <form action="/auth/signout" method="post">
            <button type="submit" className="acct-action acct-signout">
              <LogOut size={13} />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// Desktop: sits in the sidebar's bottom-left corner, opens upward.
export function AccountSwitcher({
  onSwitched,
  actions,
}: {
  onSwitched: (isNew: boolean) => void;
  actions?: AccountMenuAction[];
}) {
  const accounts = useAccounts((s) => s.accounts);
  const activeId = useAccounts((s) => s.activeId);
  const [open, setOpen] = useState(false);
  const active = accounts.find((a) => a.id === activeId);

  return (
    <div className="acct-switch">
      <button className="acct-btn" onClick={() => setOpen((v) => !v)}>
        <span className="dot" />
        <span className="acct-name">{active?.name ?? "Profile"}</span>
        <ChevronUp size={13} style={{ marginLeft: "auto", flexShrink: 0 }} />
      </button>
      {open && (
        <>
          <div className="acct-backdrop" onClick={() => setOpen(false)} />
          <AccountMenu
            onDone={() => setOpen(false)}
            onSwitched={onSwitched}
            actions={actions}
          />
        </>
      )}
    </div>
  );
}

// Mobile: a tab in the bottom navigation bar, opens upward.
export function ProfileNavButton({
  onSwitched,
  actions,
}: {
  onSwitched: (isNew: boolean) => void;
  actions?: AccountMenuAction[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bottom-profile">
      <button
        className={`bottom-tab${open ? " on" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <UserRound size={18} />
        <span>Profile</span>
      </button>
      {open && (
        <>
          <div className="acct-backdrop" onClick={() => setOpen(false)} />
          <AccountMenu
            onDone={() => setOpen(false)}
            onSwitched={onSwitched}
            actions={actions}
          />
        </>
      )}
    </div>
  );
}
