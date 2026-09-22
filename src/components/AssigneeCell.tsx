"use client";

import { X } from "lucide-react";
import { usePlanner } from "@/lib/store";
import { personName, useTeam } from "@/lib/team";
import { ContentCard } from "@/lib/types";
import Avatar, { Name } from "./Avatar";

/**
 * "Assigned to", as a table cell: the people on the card as small chips (each
 * removable), and a "+" that lists whoever on the profile isn't on it yet.
 * Same roster and same field as the card's own picker — this is just the
 * quick-glance / quick-change version for All Content.
 */
export default function AssigneeCell({ card }: { card: ContentCard }) {
  const updateCard = usePlanner((s) => s.updateCard);
  const roster = useTeam((s) => s.roster);
  const me = useTeam((s) => s.me);
  const viewOnly = useTeam((s) => s.role === "viewer");
  useTeam((s) => s.directory);

  const assigned = card.assignees ?? [];
  const options = roster.filter((p) => !assigned.includes(p.email));

  if (!me) return <span className="cell-muted">—</span>;

  return (
    <div className="cell-assignees">
      {assigned.map((email) => (
        <span key={email} className="cell-assignee" title={email}>
          <Avatar email={email} size={18} />
          <Name email={email} />
          {!viewOnly && (
            <button
              aria-label={`Unassign ${email}`}
              onClick={() =>
                updateCard(card.id, { assignees: assigned.filter((e) => e !== email) })
              }
            >
              <X size={10} />
            </button>
          )}
        </span>
      ))}
      {!viewOnly && options.length > 0 && (
        <select
          className="cell-select cell-assignee-add"
          value=""
          aria-label="Assign someone"
          title="Assign someone"
          onChange={(e) => {
            if (e.target.value) {
              updateCard(card.id, { assignees: [...assigned, e.target.value] });
            }
          }}
        >
          <option value="">{assigned.length ? "+" : "+ Assign"}</option>
          {options.map((p) => (
            <option key={p.email} value={p.email}>
              {personName(p.email, me.email)} · {p.email}
            </option>
          ))}
        </select>
      )}
      {!viewOnly && options.length === 0 && assigned.length === 0 && (
        <span className="cell-muted" title="Share this profile to add teammates">
          —
        </span>
      )}
    </div>
  );
}

/**
 * Bulk assign / unassign for the selected rows: one dropdown, two groups.
 * "Assign" lists the roster; "Remove" lists whoever is on any selected card.
 */
export function BulkAssign({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const cards = usePlanner((s) => s.cards);
  const updateCard = usePlanner((s) => s.updateCard);
  const roster = useTeam((s) => s.roster);
  const me = useTeam((s) => s.me);
  const viewOnly = useTeam((s) => s.role === "viewer");
  useTeam((s) => s.directory);
  if (!me || viewOnly || !roster.length) return null;

  const picked = cards.filter((c) => ids.includes(c.id));
  const present = [...new Set(picked.flatMap((c) => c.assignees ?? []))];

  function apply(value: string) {
    const [kind, email] = value.split(":", 2);
    for (const c of picked) {
      const cur = c.assignees ?? [];
      if (kind === "add" && !cur.includes(email)) {
        updateCard(c.id, { assignees: [...cur, email] });
      } else if (kind === "remove" && cur.includes(email)) {
        updateCard(c.id, { assignees: cur.filter((e) => e !== email) });
      }
    }
    onDone();
  }

  return (
    <select
      className="cell-select bulk-assign"
      value=""
      aria-label="Assign the selected cards"
      onChange={(e) => e.target.value && apply(e.target.value)}
    >
      <option value="">Assign to…</option>
      <optgroup label="Assign">
        {roster.map((p) => (
          <option key={`add:${p.email}`} value={`add:${p.email}`}>
            {personName(p.email, me.email)}
          </option>
        ))}
      </optgroup>
      {present.length > 0 && (
        <optgroup label="Remove">
          {present.map((email) => (
            <option key={`remove:${email}`} value={`remove:${email}`}>
              {personName(email, me.email)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
