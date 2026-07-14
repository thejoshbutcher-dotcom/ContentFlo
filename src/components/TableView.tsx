"use client";

import { useState } from "react";
import { Copy, Trash2, TriangleAlert, X } from "lucide-react";
import { usePlanner } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { STATUSES, STATUS_COLORS, statusesFor } from "@/lib/seed";
import { ContentType, Who } from "@/lib/types";
import { formatDate, typeTagClass } from "./CardItem";

const CONTENT_TYPES: ContentType[] = [
  "Short form",
  "Long form",
  "Podcast",
  "Carousel",
];
const WHO_VALUES: Who[] = ["TOF", "MOF", "BOF"];

export default function TableView({
  search,
  onOpen,
}: {
  search: string;
  onOpen: (id: string) => void;
}) {
  const cards = usePlanner((s) => s.cards);
  const updateCard = usePlanner((s) => s.updateCard);
  const deleteCards = usePlanner((s) => s.deleteCards);
  const duplicateCards = usePlanner((s) => s.duplicateCards);
  const buckets = useProfile((s) => s.buckets);
  const formats = useProfile((s) => s.formats);
  const q = search.trim().toLowerCase();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const statusOrder = new Map(STATUSES.map((s, i) => [s.id, i]));
  const rows = cards
    .filter((c) => !q || c.title.toLowerCase().includes(q))
    .sort(
      (a, b) =>
        (statusOrder.get(a.status) ?? 99) - (statusOrder.get(b.status) ?? 99) ||
        (a.createdAt < b.createdAt ? 1 : -1)
    );

  const rowIds = rows.map((c) => c.id);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rowIds));
  }
  function clearSelection() {
    setSelected(new Set());
  }

  function doDuplicate() {
    duplicateCards([...selected]);
    clearSelection();
  }
  function doDelete() {
    deleteCards([...selected]);
    clearSelection();
    setConfirmDelete(false);
  }

  // Keep a card's saved value pickable even if it's no longer in the profile list.
  const formatOptions = (current?: string) =>
    current && !formats.some((f) => f.name === current)
      ? [current, ...formats.map((f) => f.name)]
      : formats.map((f) => f.name);

  return (
    <div className="table-wrap">
      {someSelected && (
        <div className="bulk-bar">
          <span className="bulk-count">
            {selected.size} selected
          </span>
          <button className="btn btn-ghost" onClick={doDuplicate}>
            <Copy size={14} /> <span className="btn-label">Duplicate</span>
          </button>
          <button className="btn btn-danger-line" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} /> <span className="btn-label">Delete</span>
          </button>
          <button className="bulk-clear" onClick={clearSelection} aria-label="Clear selection">
            <X size={14} />
          </button>
        </div>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th className="col-check">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Select all"
              />
            </th>
            <th>Title</th>
            <th>Status</th>
            <th>Type</th>
            <th>Format</th>
            <th>Bucket</th>
            <th>Who</th>
            <th>Posting date</th>
            <th>Added</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const status = STATUSES.find((s) => s.id === c.status);
            const colors = status ? STATUS_COLORS[status.color] : STATUS_COLORS.gray;
            const isSel = selected.has(c.id);
            return (
              <tr key={c.id} className={isSel ? "row-sel" : ""}>
                <td className="col-check" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(c.id)}
                    aria-label={`Select ${c.title || "Untitled"}`}
                  />
                </td>
                <td
                  className="cell-open"
                  style={{ fontWeight: 600, maxWidth: 340 }}
                  onClick={() => onOpen(c.id)}
                >
                  {c.title || "Untitled"}
                </td>
                <td>
                  <select
                    className="cell-select cell-tag"
                    style={{ background: colors.bg, color: colors.fg }}
                    value={c.status}
                    onChange={(e) => updateCard(c.id, { status: e.target.value })}
                  >
                    {statusesFor(c.contentType).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className={`cell-select cell-tag ${typeTagClass(c.contentType)}`}
                    value={c.contentType ?? ""}
                    onChange={(e) =>
                      updateCard(c.id, {
                        contentType: (e.target.value || undefined) as ContentType,
                      })
                    }
                  >
                    <option value="">—</option>
                    {CONTENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="cell-select"
                    value={c.format ?? ""}
                    onChange={(e) =>
                      updateCard(c.id, { format: e.target.value || undefined })
                    }
                  >
                    <option value="">—</option>
                    {formatOptions(c.format).map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="cell-select"
                    value={c.bucketId ?? ""}
                    onChange={(e) =>
                      updateCard(c.id, { bucketId: e.target.value || undefined })
                    }
                  >
                    <option value="">—</option>
                    {buckets.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="cell-select cell-mono"
                    value={c.who ?? ""}
                    onChange={(e) =>
                      updateCard(c.id, { who: (e.target.value || undefined) as Who })
                    }
                  >
                    <option value="">—</option>
                    {WHO_VALUES.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="t-mono cell-open" onClick={() => onOpen(c.id)}>
                  {formatDate(c.postingDate)}
                </td>
                <td className="t-mono cell-open" onClick={() => onOpen(c.id)}>
                  {formatDate(c.createdAt.slice(0, 10))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div className="empty-state" style={{ marginTop: 14 }}>
          Nothing here yet — head to Brainstorm and stack some ideas.
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">
              <TriangleAlert size={26} />
            </div>
            <h3>
              Delete {selected.size} {selected.size === 1 ? "card" : "cards"}?
            </h3>
            <p>
              This can&apos;t be undone. The selected content will be permanently
              removed from every device.
            </p>
            <div className="confirm-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="btn btn-danger-solid" onClick={doDelete}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
