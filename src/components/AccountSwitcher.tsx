"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useAccounts } from "@/lib/accounts";
import { createAccount, deleteAccount, switchAccount } from "@/lib/workspace";

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
  onSwitched: () => void;
  actions?: AccountMenuAction[];
}) {
  const accounts = useAccounts((s) => s.accounts);
  const activeId = useAccounts((s) => s.activeId);
  const [draft, setDraft] = useState("");

  async function pick(id: string) {
    if (id !== activeId) {
      await switchAccount(id);
      onSwitched();
    }
    onDone();
  }

  async function createNew() {
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    await createAccount(name);
    onSwitched();
    onDone();
  }

  return (
    <div className="acct-menu" role="menu">
      {accounts.map((a) => (
        <div key={a.id} className={`acct-item${a.id === activeId ? " on" : ""}`}>
          <button className="acct-pick" onClick={() => pick(a.id)}>
            {a.id === activeId ? (
              <Check size={13} className="acct-check" />
            ) : (
              <span className="acct-check" />
            )}
            <span className="acct-name">{a.name}</span>
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
                  onSwitched();
                }
              }}
            >
              <Trash2 size={12} />
            </button>
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
    </div>
  );
}

export function AccountSwitcher({ onSwitched }: { onSwitched: () => void }) {
  const accounts = useAccounts((s) => s.accounts);
  const activeId = useAccounts((s) => s.activeId);
  const [open, setOpen] = useState(false);
  const active = accounts.find((a) => a.id === activeId);

  return (
    <div className="acct-switch">
      <button className="acct-btn" onClick={() => setOpen((v) => !v)}>
        <span className="dot" />
        <span className="acct-name">{active?.name ?? "Profile"}</span>
        <ChevronDown size={13} style={{ marginLeft: "auto", flexShrink: 0 }} />
      </button>
      {open && (
        <>
          <div className="acct-backdrop" onClick={() => setOpen(false)} />
          <AccountMenu onDone={() => setOpen(false)} onSwitched={onSwitched} />
        </>
      )}
    </div>
  );
}

export function AccountBubble({
  onSwitched,
  actions,
}: {
  onSwitched: () => void;
  actions: AccountMenuAction[];
}) {
  const accounts = useAccounts((s) => s.accounts);
  const activeId = useAccounts((s) => s.activeId);
  const [open, setOpen] = useState(false);
  const active = accounts.find((a) => a.id === activeId);
  const initials = (active?.name ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="account-bubble">
      <button
        className="bubble-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Profile & settings"
      >
        {initials}
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
