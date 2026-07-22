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

interface DimOpt {
  value: string;
  label: string;
  title?: string;
}

/**
 * A brainstorm dimension. Up to 4 options render as tappable chips; beyond that
 * it collapses to a dropdown so a long list reads cleaner and less daunting.
 */
function DimOptions({
  options,
  selected,
  onChange,
  emptyLabel,
  onEmpty,
}: {
  options: DimOpt[];
  selected?: string;
  onChange: (value?: string) => void;
  emptyLabel?: string;
  onEmpty?: () => void;
}) {
  if (options.length === 0) {
    return onEmpty ? (
      <button className="mini-chip" onClick={onEmpty}>
        {emptyLabel}
      </button>
    ) : null;
  }

  if (options.length > 4) {
    return (
      <select
        className="dim-select"
        value={selected ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">— Any —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="dim-chips">
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          title={o.title}
          on={selected === o.value}
          onClick={() => onChange(selected === o.value ? undefined : o.value)}
        />
      ))}
    </div>
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
  const [goal, setGoal] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  // Direct set (chips toggle via the same path; a dropdown reports the exact choice).
  function choose<K extends keyof Pick>(key: K, value: Pick[K] | undefined) {
    setPick((p) => ({ ...p, [key]: value }));
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
    pick.topic && lens ? `${pick.topic} — ${lens.name}` : pick.topic ?? "";

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
      goalOfVideo: goal.trim() || undefined,
      sections,
    });
    setSent(card.id);
    setTitle("");
    setGoal("");
    // Drop the user straight onto the board they sent it to.
    onGoToBoard(pick.dest);
  }

  const resultBlock = (
    <div className="slate-result">
      <input
        className="slate-title-input"
        placeholder={autoTitle ? autoTitle.toUpperCase() : "WORKING TITLE..."}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className="slate-goal-input"
        placeholder="Goal of this video — what should it DO for the viewer?"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
      />
      {(
        [
          ["Topic", pick.topic],
          ["Bucket", lens?.name],
          ["Who", pick.who],
          [
            "Feel → Do",
            pick.feeling ? `${pick.feeling} → ${pick.action ?? "…"}` : pick.action,
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
        <div className="send-as">
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
        </div>
        <div className="send-cta">
          <button className="btn btn-primary" data-tour="add-to-pipeline" onClick={send}>
            <Send size={14} /> Add to pipeline
          </button>
        </div>
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
  );

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
                {brandName ? `${brandName} — ` : ""}Create a new idea for your next
                piece of content. Follow the Flo to generate a new idea from
                scratch or shuffle things up for some random inspiration!
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
          {resultBlock}

          <p className="flo-line">
            <strong>Flo:</strong> relatable topic → through the lens of your content
            bucket → who → what they should feel → format
          </p>

          <div className="dim-grid" data-tour="brainstorm-dims">
            <div className="dim">
              <div className="dim-label">
                <span className="t-eyebrow">01 · Relatable topic</span>
                <span className="sub">what they&apos;re living through</span>
              </div>
              <DimOptions
                options={topics.map((t) => ({ value: t, label: t }))}
                selected={pick.topic}
                onChange={(v) => choose("topic", v)}
                emptyLabel="Add topics in Brand setup →"
                onEmpty={onOpenSetup}
              />
            </div>

            <div className="dim">
              <div className="dim-label">
                <span className="t-eyebrow">02 · Through the lens of</span>
                <span className="sub">your content bucket</span>
              </div>
              <DimOptions
                options={buckets.map((b) => ({
                  value: b.id,
                  label: b.name,
                  title: b.description,
                }))}
                selected={pick.bucketId}
                onChange={(v) => choose("bucketId", v)}
                emptyLabel="Add buckets in Brand setup →"
                onEmpty={onOpenSetup}
              />
            </div>

            <div className="dim">
              <div className="dim-label">
                <span className="t-eyebrow">03 · Who</span>
                <span className="sub">how deep we getting</span>
              </div>
              <DimOptions
                options={WHO_OPTIONS.map((w) => ({
                  value: w.id,
                  label: w.label,
                  title: w.hint,
                }))}
                selected={pick.who}
                onChange={(v) => choose("who", v as Who | undefined)}
              />
            </div>

            <div className="dim">
              <div className="dim-label">
                <span className="t-eyebrow">04 · Goal action</span>
                <span className="sub">what they should do</span>
              </div>
              <DimOptions
                options={actions.map((a) => ({ value: a, label: a }))}
                selected={pick.action}
                onChange={(v) => choose("action", v)}
                emptyLabel="Add goal actions in Brand setup →"
                onEmpty={onOpenSetup}
              />
            </div>

            <div className="dim">
              <div className="dim-label">
                <span className="t-eyebrow">05 · Need them to feel</span>
                <span className="sub">feeling &gt; action</span>
              </div>
              <DimOptions
                options={feelings.map((f) => ({ value: f, label: f }))}
                selected={pick.feeling}
                onChange={(v) => choose("feeling", v)}
                emptyLabel="Add feelings in Brand setup →"
                onEmpty={onOpenSetup}
              />
            </div>

            <div className="dim">
              <div className="dim-label">
                <span className="t-eyebrow">06 · Format</span>
                <span className="sub">the structure of the piece</span>
              </div>
              <DimOptions
                options={formats.map((f) => ({
                  value: f.name,
                  label: f.name,
                  title: f.hint,
                }))}
                selected={pick.format}
                onChange={(v) => choose("format", v)}
                emptyLabel="Add formats in Brand setup →"
                onEmpty={onOpenSetup}
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
