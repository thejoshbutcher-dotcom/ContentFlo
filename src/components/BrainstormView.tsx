"use client";

import { useState } from "react";
import { Dices, Lightbulb, Send, Settings2 } from "lucide-react";
import { WHO_OPTIONS, randomOf } from "@/lib/ideation";
import { useProfile } from "@/lib/profile";
import { usePlanner } from "@/lib/store";
import { sectionsFor } from "@/lib/templates";
import { ContentType, Who } from "@/lib/types";

interface Pick {
  topic?: string;
  bucketId?: string;
  who?: Who;
  action?: string;
  feeling?: string;
  format?: string;
  dest: ContentType;
}

const DESTS: ContentType[] = ["Short form", "Long form", "Podcast", "Carousel"];

function Chip({
  label,
  on,
  onClick,
  title,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button className={`mini-chip${on ? " on" : ""}`} onClick={onClick} title={title}>
      {label}
    </button>
  );
}

export default function BrainstormView({
  onOpen,
  onGoToBoard,
  onOpenSetup,
}: {
  onOpen: (id: string) => void;
  onGoToBoard: (dest: ContentType) => void;
  onOpenSetup: () => void;
}) {
  const addCard = usePlanner((s) => s.addCard);
  const topics = useProfile((s) => s.topics);
  const buckets = useProfile((s) => s.buckets);
  const formats = useProfile((s) => s.formats);
  const feelings = useProfile((s) => s.feelings);
  const actions = useProfile((s) => s.actions);
  const brandName = useProfile((s) => s.brandName);
  const [pick, setPick] = useState<Pick>({ dest: "Short form" });
  const [title, setTitle] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  function set<K extends keyof Pick>(key: K, value: Pick[K]) {
    setPick((p) => ({ ...p, [key]: p[key] === value ? undefined : value }));
    setSent(null);
  }

  function shuffle() {
    setPick((p) => ({
      dest: p.dest,
      topic: topics.length ? randomOf(topics) : undefined,
      bucketId: buckets.length ? randomOf(buckets).id : undefined,
      who: randomOf(WHO_OPTIONS).id as Who,
      action: actions.length ? randomOf(actions) : undefined,
      feeling: feelings.length ? randomOf(feelings) : undefined,
      format: formats.length ? randomOf(formats).name : undefined,
    }));
    setSent(null);
  }

  const lens = buckets.find((b) => b.id === pick.bucketId);
  const beat = formats.find((f) => f.name === pick.format)?.hint;

  const autoTitle =
    pick.topic && lens
      ? `${pick.topic} — through the lens of ${lens.name.toLowerCase()}`
      : pick.topic ?? "";

  function send() {
    const finalTitle = title.trim() || autoTitle || "Untitled idea";
    const sections = sectionsFor(pick.dest);
    const scriptSection = sections.find((s) => s.title.startsWith("My Script"));
    if (scriptSection) {
      scriptSection.content = [
        beat ? `BEATS: ${beat}` : null,
        pick.feeling ? `FEEL: ${pick.feeling} → ${pick.action ?? "action"}` : null,
        "",
        "",
      ]
        .filter((l) => l !== null)
        .join("\n");
    }
    const card = addCard({
      title: finalTitle,
      status: "ideas",
      contentType: pick.dest,
      bucketId: pick.bucketId,
      format: pick.format,
      topic: pick.topic,
      pillar: lens?.name,
      who: pick.who,
      action: pick.action,
      feeling: pick.feeling,
      sections,
    });
    setSent(card.id);
    setTitle("");
  }

  return (
    <div className="slate-wrap">
      <div className="slate-board">
        <div className="slate-clap">
          <div className="clap-stripes" />
          <div className="slate-head">
            <div>
              <h2>
                <Lightbulb
                  size={22}
                  style={{ display: "inline", marginRight: 10, verticalAlign: -3 }}
                />
                Brainstorm
              </h2>
              <p>
                {brandName ? `${brandName} — ` : ""}relatable topic → through the
                lens of a bucket → who → what they should feel → format. Stack the
                deck or shuffle it.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ref-toggle" onClick={onOpenSetup}>
                <Settings2
                  size={11}
                  style={{ display: "inline", marginRight: 5, verticalAlign: -1 }}
                />
                Brand setup
              </button>
              <button className="btn btn-amber" onClick={shuffle}>
                <Dices size={15} /> Shuffle
              </button>
            </div>
          </div>
        </div>

        <div className="slate-body">
          <div className="dim-grid">
            <div className="dim">
              <div className="dim-label">
                <span className="t-eyebrow">01 · Relatable topic</span>
                <span className="sub">what they&apos;re living through</span>
              </div>
              <div className="dim-chips">
                {topics.map((t) => (
                  <Chip key={t} label={t} on={pick.topic === t} onClick={() => set("topic", t)} />
                ))}
                {topics.length === 0 && (
                  <button className="mini-chip" onClick={onOpenSetup}>
                    Add topics in Brand setup →
                  </button>
                )}
              </div>
            </div>

            <div className="dim">
              <div className="dim-label">
                <span className="t-eyebrow">02 · Through the lens of</span>
                <span className="sub">your content bucket</span>
              </div>
              <div className="dim-chips">
                {buckets.map((b) => (
                  <Chip
                    key={b.id}
                    label={b.name}
                    title={b.description}
                    on={pick.bucketId === b.id}
                    onClick={() => set("bucketId", b.id)}
                  />
                ))}
                {buckets.length === 0 && (
                  <button className="mini-chip" onClick={onOpenSetup}>
                    Add buckets in Brand setup →
                  </button>
                )}
              </div>
            </div>

            <div className="dim">
              <div className="dim-label">
                <span className="t-eyebrow">03 · Who</span>
                <span className="sub">how deep we getting</span>
              </div>
              <div className="dim-chips">
                {WHO_OPTIONS.map((w) => (
                  <Chip
                    key={w.id}
                    label={w.label}
                    title={w.hint}
                    on={pick.who === w.id}
                    onClick={() => set("who", w.id as Who)}
                  />
                ))}
              </div>
            </div>

            <div className="dim">
              <div className="dim-label">
                <span className="t-eyebrow">04 · Goal action</span>
                <span className="sub">what they should do</span>
              </div>
              <div className="dim-chips">
                {actions.map((a) => (
                  <Chip key={a} label={a} on={pick.action === a} onClick={() => set("action", a)} />
                ))}
                {actions.length === 0 && (
                  <button className="mini-chip" onClick={onOpenSetup}>
                    Add goal actions in Brand setup →
                  </button>
                )}
              </div>
            </div>

            <div className="dim">
              <div className="dim-label">
                <span className="t-eyebrow">05 · Need them to feel</span>
                <span className="sub">feeling &gt; action</span>
              </div>
              <div className="dim-chips">
                {feelings.map((f) => (
                  <Chip key={f} label={f} on={pick.feeling === f} onClick={() => set("feeling", f)} />
                ))}
                {feelings.length === 0 && (
                  <button className="mini-chip" onClick={onOpenSetup}>
                    Add feelings in Brand setup →
                  </button>
                )}
              </div>
            </div>

            <div className="dim">
              <div className="dim-label">
                <span className="t-eyebrow">06 · Format</span>
                <span className="sub">the structure of the piece</span>
              </div>
              <div className="dim-chips">
                {formats.map((f) => (
                  <Chip
                    key={f.id}
                    label={f.name}
                    title={f.hint}
                    on={pick.format === f.name}
                    onClick={() => set("format", f.name)}
                  />
                ))}
                {formats.length === 0 && (
                  <button className="mini-chip" onClick={onOpenSetup}>
                    Add formats in Brand setup →
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="slate-result">
            <input
              className="slate-title-input"
              placeholder={autoTitle ? autoTitle.toUpperCase() : "WORKING TITLE..."}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {(
              [
                ["Topic", pick.topic],
                ["Lens", lens?.name],
                ["Who", pick.who],
                [
                  "Feel → Do",
                  pick.feeling
                    ? `${pick.feeling} → ${pick.action ?? "…"}`
                    : pick.action,
                ],
                ["Format", pick.format],
              ] as [string, string | undefined][]
            ).map(([k, v]) => (
              <div className="slate-line" key={k}>
                <span className="k">{k}</span>
                <span className={`v${v ? "" : " empty"}`}>{v ?? "—"}</span>
              </div>
            ))}
            {beat && <div className="beat-strip">▶ {beat}</div>}

            <div className="slate-actions">
              <span className="t-eyebrow" style={{ color: "var(--text-3)" }}>
                Send as
              </span>
              {DESTS.map((d) => (
                <Chip
                  key={d}
                  label={d}
                  on={pick.dest === d}
                  onClick={() => {
                    setPick((p) => ({ ...p, dest: d }));
                    setSent(null);
                  }}
                />
              ))}
              <div style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={send}>
                <Send size={14} /> Add to pipeline
              </button>
            </div>

            {sent && (
              <div className="slate-line" style={{ marginTop: 10 }}>
                <span className="k">Added ✓</span>
                <span className="v">
                  Landed in Ideas —{" "}
                  <button
                    className="mini-chip"
                    onClick={() => onOpen(sent)}
                    style={{ marginRight: 6 }}
                  >
                    Open card
                  </button>
                  <button className="mini-chip" onClick={() => onGoToBoard(pick.dest)}>
                    View board
                  </button>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
