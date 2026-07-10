"use client";

import { useEffect, useState } from "react";
import { BookOpen, ImagePlus, Trash2, X } from "lucide-react";
import { usePlanner } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { STATUS_COLORS, statusesFor } from "@/lib/seed";
import { HINT_OVERRIDES, REFERENCE_LIBRARY, sectionPhase } from "@/lib/templates";
import { ContentCard, ContentType, Section, Who } from "@/lib/types";

const CONTENT_TYPES: ContentType[] = [
  "Short form",
  "Long form",
  "Podcast",
  "Carousel",
];

type Tab = "plan" | "script" | "post";

const TAB_LABELS: { id: Tab; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "script", label: "Script" },
  { id: "post", label: "Post" },
];

function tabForStatus(status: string): Tab {
  if (status === "scripting" || status === "filming" || status === "editing")
    return "script";
  if (status === "ready" || status === "posted") return "post";
  return "plan";
}

function sectionsAreEmpty(card: ContentCard) {
  return card.sections.every(
    (s) =>
      ((!s.content.trim() ||
        s.content === "1. \n2. \n3. " ||
        s.content.startsWith("Slide 2:") ||
        s.content.startsWith("Reference video title:") ||
        s.content.startsWith("00:00") ||
        s.content.startsWith("Subject:")) &&
        (!s.images || s.images.length === 0))
  );
}

// Downscale pasted screenshots so a handful of them fit in localStorage
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const maxW = 900;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function SectionBlock({
  cardId,
  sec,
  large,
}: {
  cardId: string;
  sec: Section;
  large?: boolean;
}) {
  const updateSection = usePlanner((s) => s.updateSection);
  const toggleChecklistItem = usePlanner((s) => s.toggleChecklistItem);
  const [lightbox, setLightbox] = useState<string | null>(null);

  async function handlePaste(e: React.ClipboardEvent) {
    const files = [...e.clipboardData.items]
      .filter((it) => it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length === 0) return;
    e.preventDefault();
    const dataUrls = await Promise.all(files.map(compressImage));
    updateSection(cardId, sec.id, {
      images: [...(sec.images ?? []), ...dataUrls],
    });
  }

  function removeImage(idx: number) {
    updateSection(cardId, sec.id, {
      images: (sec.images ?? []).filter((_, i) => i !== idx),
    });
  }

  const hint = HINT_OVERRIDES[sec.title] ?? sec.hint;

  return (
    <div
      className={`section-block${large ? " script-block" : ""}`}
      onPaste={handlePaste}
    >
      <div className="section-head">
        <span className="section-title">
          {sec.title}
          {sec.title === "Thumbnail References" && (
            <ImagePlus size={12} style={{ display: "inline", marginLeft: 6, verticalAlign: -1, opacity: 0.6 }} />
          )}
        </span>
        {hint && <span className="section-hint">{hint}</span>}
      </div>

      {sec.images && sec.images.length > 0 && (
        <div className="sec-images">
          {sec.images.map((src, i) => (
            <div className="sec-img" key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="Pasted reference" onClick={() => setLightbox(src)} />
              <button
                className="sec-img-del"
                aria-label="Remove image"
                onClick={() => removeImage(i)}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {sec.kind === "checklist" && sec.items ? (
        <div style={{ paddingTop: 6 }}>
          {sec.items.map((it) => (
            <label key={it.id} className={`check-row${it.done ? " done" : ""}`}>
              <input
                type="checkbox"
                checked={it.done}
                onChange={() => toggleChecklistItem(cardId, sec.id, it.id)}
              />
              <span>{it.text}</span>
            </label>
          ))}
        </div>
      ) : (
        <textarea
          className="section-textarea"
          value={sec.content}
          placeholder="Write here... (you can paste images too)"
          onChange={(e) => updateSection(cardId, sec.id, { content: e.target.value })}
        />
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Reference preview" />
        </div>
      )}
    </div>
  );
}

export default function CardModal({
  cardId,
  onClose,
}: {
  cardId: string;
  onClose: () => void;
}) {
  const card = usePlanner((s) => s.cards.find((c) => c.id === cardId));
  const updateCard = usePlanner((s) => s.updateCard);
  const deleteCard = usePlanner((s) => s.deleteCard);
  const applyTemplate = usePlanner((s) => s.applyTemplate);
  const buckets = useProfile((s) => s.buckets);
  const profileTopics = useProfile((s) => s.topics);
  const profileFormats = useProfile((s) => s.formats);
  const profileFeelings = useProfile((s) => s.feelings);
  const profileActions = useProfile((s) => s.actions);
  const socials = useProfile((s) => s.socials);
  const [tab, setTab] = useState<Tab>(() => {
    const c = usePlanner.getState().cards.find((x) => x.id === cardId);
    return c ? tabForStatus(c.status) : "plan";
  });
  const [showRef, setShowRef] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!card) return null;

  const statuses = statusesFor(card.contentType);
  const status = statuses.find((s) => s.id === card.status);
  const colors = status ? STATUS_COLORS[status.color] : STATUS_COLORS.gray;
  const library = REFERENCE_LIBRARY[card.contentType ?? "Short form"] ?? [];

  const planSections = card.sections.filter((s) => sectionPhase(s) === "plan");
  const scriptSections = card.sections.filter((s) => sectionPhase(s) === "script");
  const postSections = card.sections.filter((s) => sectionPhase(s) === "post");

  // Keep a card's saved value selectable even if it's no longer in the profile list
  function withCurrent(list: string[], current?: string) {
    return current && !list.includes(current) ? [current, ...list] : list;
  }
  const topicOptions = withCurrent(profileTopics, card.topic);
  const lensAll = withCurrent(
    buckets.map((b) => b.name),
    card.pillar
  );
  const formatOptions = withCurrent(
    profileFormats.map((f) => f.name),
    card.format
  );
  const feelingOptions = withCurrent(profileFeelings, card.feeling);
  const actionOptions = withCurrent(profileActions, card.action);

  function setType(type: ContentType) {
    if (!card) return;
    if (sectionsAreEmpty(card)) {
      applyTemplate(card.id, type);
    } else {
      updateCard(card.id, { contentType: type });
    }
  }

  function setStatus(statusId: string) {
    if (!card) return;
    updateCard(card.id, { status: statusId });
    setTab(tabForStatus(statusId));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal${tab === "script" ? " full" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <select
            className="prop-select status-select"
            style={{ background: colors.bg, color: colors.fg }}
            value={card.status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            className="modal-title-input"
            value={card.title}
            placeholder="Untitled idea"
            autoFocus={!card.title}
            onChange={(e) => updateCard(card.id, { title: e.target.value })}
          />
          <div className="tab-switch" role="tablist">
            {TAB_LABELS.map((t) => (
              <button
                key={t.id}
                className={`tab-btn${tab === t.id ? " on" : ""}`}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === "script" && (
            <button className="ref-toggle" onClick={() => setShowRef((v) => !v)}>
              <BookOpen
                size={11}
                style={{ display: "inline", marginRight: 5, verticalAlign: -1 }}
              />
              {showRef ? "Hide guides" : "Hooks & guides"}
            </button>
          )}
          <button
            className="btn btn-danger"
            onClick={() => {
              deleteCard(card.id);
              onClose();
            }}
            aria-label="Delete card"
          >
            <Trash2 size={15} />
          </button>
          <button
            className="btn btn-ghost head-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {tab === "plan" && (
          <div className="modal-body">
            <div className="modal-sections">
              {planSections.map((sec) => (
                <SectionBlock key={sec.id} cardId={card.id} sec={sec} />
              ))}
            </div>

            <div className="modal-props">
              <div className="prop-label t-eyebrow">Content type</div>
              <div className="chip-row">
                {CONTENT_TYPES.map((t) => (
                  <button
                    key={t}
                    className={`mini-chip${card.contentType === t ? " on" : ""}`}
                    onClick={() => setType(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="prop-label t-eyebrow">Content bucket</div>
              <select
                className="prop-select"
                value={card.bucketId ?? ""}
                onChange={(e) =>
                  updateCard(card.id, { bucketId: e.target.value || undefined })
                }
              >
                <option value="">—</option>
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              <div className="prop-label t-eyebrow">Content format</div>
              <select
                className="prop-select"
                value={card.format ?? ""}
                onChange={(e) =>
                  updateCard(card.id, { format: e.target.value || undefined })
                }
              >
                <option value="">—</option>
                {formatOptions.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>

              <div className="prop-label t-eyebrow">Who (funnel depth)</div>
              <div className="chip-row">
                {(["TOF", "MOF", "BOF"] as Who[]).map((w) => (
                  <button
                    key={w}
                    className={`mini-chip${card.who === w ? " on" : ""}`}
                    onClick={() =>
                      updateCard(card.id, { who: card.who === w ? undefined : w })
                    }
                  >
                    {w}
                  </button>
                ))}
              </div>

              <div className="prop-label t-eyebrow">Posting date</div>
              <input
                type="date"
                className="prop-input"
                value={card.postingDate ?? ""}
                onChange={(e) =>
                  updateCard(card.id, { postingDate: e.target.value || undefined })
                }
              />

              <div className="prop-label t-eyebrow">Goal of video</div>
              <input
                className="prop-input"
                value={card.goalOfVideo ?? ""}
                placeholder="What should this DO for the viewer?"
                onChange={(e) => updateCard(card.id, { goalOfVideo: e.target.value })}
              />

              <div className="prop-label t-eyebrow">Series</div>
              <input
                className="prop-input"
                value={card.series ?? ""}
                placeholder="e.g. You ever notice?"
                onChange={(e) => updateCard(card.id, { series: e.target.value })}
              />

              <div className="props-divider">
                <div className="t-eyebrow" style={{ color: "var(--amber)" }}>
                  Ideation DNA
                </div>
              </div>

              <div className="prop-label t-eyebrow">Relatable topic</div>
              <select
                className="prop-select"
                value={card.topic ?? ""}
                onChange={(e) =>
                  updateCard(card.id, { topic: e.target.value || undefined })
                }
              >
                <option value="">—</option>
                {topicOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <div className="prop-label t-eyebrow">Lens (bucket angle)</div>
              <select
                className="prop-select"
                value={card.pillar ?? ""}
                onChange={(e) =>
                  updateCard(card.id, {
                    pillar: e.target.value || undefined,
                    subPillar: undefined,
                  })
                }
              >
                <option value="">—</option>
                {lensAll.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              <div className="prop-label t-eyebrow">Need them to feel</div>
              <select
                className="prop-select"
                value={card.feeling ?? ""}
                onChange={(e) =>
                  updateCard(card.id, { feeling: e.target.value || undefined })
                }
              >
                <option value="">—</option>
                {feelingOptions.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>

              <div className="prop-label t-eyebrow">Goal action</div>
              <select
                className="prop-select"
                value={card.action ?? ""}
                onChange={(e) =>
                  updateCard(card.id, { action: e.target.value || undefined })
                }
              >
                <option value="">—</option>
                {actionOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {tab === "script" && (
          <div className={`script-body${showRef ? " with-ref" : ""}`}>
            <div className="script-pane">
              <div className="script-inner">
                {(card.hook || card.feeling || card.delivery) && (
                  <div className="script-context t-mono">
                    {card.hook && <span>🪝 &quot;{card.hook}&quot;</span>}
                    {card.feeling && (
                      <span>
                        FEEL: {card.feeling}
                        {card.action ? ` → ${card.action}` : ""}
                      </span>
                    )}
                    {card.delivery && <span>📍 {card.delivery}</span>}
                  </div>
                )}
                {scriptSections.map((sec) => (
                  <SectionBlock key={sec.id} cardId={card.id} sec={sec} large />
                ))}
                {scriptSections.length === 0 && (
                  <div className="empty-state">
                    No script sections for this format yet — switch content type
                    on the Plan tab.
                  </div>
                )}
              </div>
            </div>

            {showRef && (
              <div className="ref-drawer">
                <div
                  className="t-eyebrow"
                  style={{ color: "var(--text-3)", marginBottom: 10 }}
                >
                  {card.contentType ?? "Short form"} · reference library
                </div>
                {library.map((group) => (
                  <details className="ref-group" key={group.title}>
                    <summary>
                      <span className="ref-arrow">▸</span> {group.title}
                    </summary>
                    {group.entries.map((entry) => (
                      <div className="ref-entry" key={entry.title}>
                        <h5>{entry.title}</h5>
                        <pre>{entry.body}</pre>
                      </div>
                    ))}
                  </details>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "post" && (
          <div className="modal-body">
            <div className="modal-sections">
              {postSections.map((sec) => (
                <SectionBlock key={sec.id} cardId={card.id} sec={sec} />
              ))}
              {postSections.length === 0 && (
                <div className="empty-state">
                  No publishing sections for this format yet — switch content type
                  on the Plan tab.
                </div>
              )}
            </div>

            <div className="modal-props">
              <div className="prop-label t-eyebrow">Posting date</div>
              <input
                type="date"
                className="prop-input"
                value={card.postingDate ?? ""}
                onChange={(e) =>
                  updateCard(card.id, { postingDate: e.target.value || undefined })
                }
              />

              <div className="prop-label t-eyebrow">Post description</div>
              <textarea
                className="prop-input"
                rows={4}
                value={card.postDescription ?? ""}
                placeholder="Description used on the platform"
                onChange={(e) =>
                  updateCard(card.id, { postDescription: e.target.value })
                }
              />

              <div className="prop-label t-eyebrow">CTA link</div>
              <input
                className="prop-input"
                value={card.ctaLink ?? ""}
                placeholder="https://"
                onChange={(e) => updateCard(card.id, { ctaLink: e.target.value })}
              />

              <div className="prop-label t-eyebrow">Goal action</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {card.action ?? "—"}
              </div>

              <div className="props-divider">
                <div className="t-eyebrow" style={{ color: "var(--amber)" }}>
                  Publish to
                </div>
              </div>
              {socials.length > 0 ? (
                <div className="chip-row" style={{ marginTop: 8 }}>
                  {socials.map((s) => (
                    <span key={s.id} className="mini-chip" title={s.handle}>
                      {s.platform}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="section-hint" style={{ marginTop: 8 }}>
                  Add your accounts in Brand setup — one-click publishing lands in
                  a later phase.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
