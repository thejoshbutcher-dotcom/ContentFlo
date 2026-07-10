"use client";

import { usePlanner } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { STATUSES, STATUS_COLORS } from "@/lib/seed";
import { formatDate, typeTagClass } from "./CardItem";

export default function TableView({
  search,
  onOpen,
}: {
  search: string;
  onOpen: (id: string) => void;
}) {
  const cards = usePlanner((s) => s.cards);
  const buckets = useProfile((s) => s.buckets);
  const q = search.trim().toLowerCase();

  const statusOrder = new Map(STATUSES.map((s, i) => [s.id, i]));
  const rows = cards
    .filter((c) => !q || c.title.toLowerCase().includes(q))
    .sort(
      (a, b) =>
        (statusOrder.get(a.status) ?? 99) - (statusOrder.get(b.status) ?? 99) ||
        (a.createdAt < b.createdAt ? 1 : -1)
    );

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
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
            const bucket = buckets.find((b) => b.id === c.bucketId);
            const colors = status ? STATUS_COLORS[status.color] : STATUS_COLORS.gray;
            return (
              <tr key={c.id} onClick={() => onOpen(c.id)}>
                <td style={{ fontWeight: 600, maxWidth: 340 }}>
                  {c.title || "Untitled"}
                </td>
                <td>
                  {status && (
                    <span
                      className="tag"
                      style={{
                        background: colors.bg,
                        color: colors.fg,
                        borderColor: "transparent",
                      }}
                    >
                      {status.name}
                    </span>
                  )}
                </td>
                <td>
                  {c.contentType && (
                    <span className={`tag ${typeTagClass(c.contentType)}`}>
                      {c.contentType}
                    </span>
                  )}
                </td>
                <td style={{ color: "var(--text-2)", fontSize: 12 }}>{c.format}</td>
                <td style={{ color: "var(--text-2)", fontSize: 12 }}>{bucket?.name}</td>
                <td className="t-mono">{c.who}</td>
                <td className="t-mono">{formatDate(c.postingDate)}</td>
                <td className="t-mono">{formatDate(c.createdAt.slice(0, 10))}</td>
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
    </div>
  );
}
