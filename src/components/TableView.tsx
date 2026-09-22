"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Trash2, TriangleAlert, X } from "lucide-react";
import { usePlanner } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import AssigneeCell, { BulkAssign } from "./AssigneeCell";
import FilterBar from "./FilterBar";
import { personName, useTeam } from "@/lib/team";
import { applyFilters, TableSortKey, useViewPrefs } from "@/lib/viewPrefs";
import { pipelineMovePatch, pipelineOf, stageOf } from "@/lib/pipelines";
import { STATUS_COLORS } from "@/lib/seed";
import { formatDate, typeTagClass } from "./CardItem";


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

  const pipelines = useProfile((s) => s.pipelines);
  // Furthest-along last, by each card's position in ITS pipeline's steps.
  const stepIndex = (c: (typeof cards)[number]) => {
    const i = pipelineOf(c, pipelines)?.stages.findIndex((s) => s.id === c.status) ?? -1;
    return i === -1 ? 99 : i;
  };
  const [prefs, updatePrefs] = useViewPrefs("table");
  const me = useTeam((s) => s.me?.email ?? null);
  useTeam((s) => s.directory); // "Assigned to" sorts by display name

  const pipeIndex = (c: (typeof cards)[number]) => {
    const p = pipelineOf(c, pipelines);
    return p ? pipelines.indexOf(p) : 99;
  };
  const bucketName = (c: (typeof cards)[number]) =>
    buckets.find((b) => b.id === c.bucketId)?.name ?? "";
  const firstAssignee = (c: (typeof cards)[number]) =>
    c.assignees?.length ? personName(c.assignees[0], me) : "";

  /** Text-ish comparison where blanks always sink, whichever direction. */
  const text = (a: string, b: string, dir: number) =>
    !a !== !b ? (a ? -1 : 1) : dir * a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

  const byColumn = (key: TableSortKey, dir: number) => (a: (typeof cards)[number], b: (typeof cards)[number]) => {
    switch (key) {
      case "title":
        return text(a.title.trim(), b.title.trim(), dir);
      case "status":
        return dir * (pipeIndex(a) - pipeIndex(b) || stepIndex(a) - stepIndex(b));
      case "pipeline":
        return dir * (pipeIndex(a) - pipeIndex(b));
      case "format":
        return text(a.format ?? "", b.format ?? "", dir);
      case "bucket":
        return text(bucketName(a), bucketName(b), dir);
      case "assigned":
        return text(firstAssignee(a), firstAssignee(b), dir);
      case "posting":
        return text(a.postingDate ?? "", b.postingDate ?? "", dir);
      default:
        return dir * a.createdAt.localeCompare(b.createdAt);
    }
  };

  const scoped = cards.filter((c) => !q || c.title.toLowerCase().includes(q));
  const tableSort = prefs.table ?? null;
  const rows = applyFilters(scoped, prefs.filters, { me, pipelines }).sort((a, b) =>
    tableSort
      ? byColumn(tableSort.key, tableSort.dir)(a, b) || (a.createdAt < b.createdAt ? 1 : -1)
      : stepIndex(a) - stepIndex(b) || (a.createdAt < b.createdAt ? 1 : -1)
  );

  /** Header click: ascending → descending → off (back to the default order). */
  function sortBy(key: TableSortKey) {
    updatePrefs((p) => {
      const cur = p.table;
      const next =
        !cur || cur.key !== key
          ? { key, dir: 1 as const }
          : cur.dir === 1
            ? { key, dir: -1 as const }
            : null;
      return { ...p, table: next };
    });
  }

  const th = (k: TableSortKey, children: React.ReactNode) => {
    const on = tableSort?.key === k;
    return (
      <th
        key={k}
        className={`th-sort${on ? " on" : ""}`}
        aria-sort={on ? (tableSort!.dir === 1 ? "ascending" : "descending") : "none"}
      >
        <button onClick={() => sortBy(k)}>
          {children}
          {on ? (
            tableSort!.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />
          ) : (
            <ArrowUpDown size={11} className="th-sort-idle" />
          )}
        </button>
      </th>
    );
  };

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
          <BulkAssign ids={[...selected]} onDone={clearSelection} />
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

      <FilterBar prefs={prefs} update={updatePrefs} cards={scoped} mode="table" />
      {rows.length === 0 && scoped.length > 0 && (
        <div className="table-empty">No cards match these filters.</div>
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
            {th("title", "Title")}
            {th("status", "Status")}
            {th("pipeline", "Pipeline")}
            {th("format", "Format")}
            {th("bucket", "Bucket")}
            {th("assigned", "Assigned to")}
            {th("posting", "Posting date")}
            {th("added", "Added")}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const pipeline = pipelineOf(c, pipelines);
            const status = stageOf(c, pipelines);
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
                    {(pipeline?.stages ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className={`cell-select cell-tag ${typeTagClass(c.contentType)}`}
                    value={pipeline?.id ?? ""}
                    onChange={(e) => {
                      const to = pipelines.find((p) => p.id === e.target.value);
                      if (to) updateCard(c.id, pipelineMovePatch(c, to, pipelines));
                    }}
                  >
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
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
                <td className="col-assignees">
                  <AssigneeCell card={c} />
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
