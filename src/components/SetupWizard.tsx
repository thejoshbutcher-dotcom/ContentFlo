"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  PLATFORMS,
  ProfileFormat,
  newBucket,
  newFormat,
  newSocial,
  suggestBuckets,
  useProfile,
} from "@/lib/profile";
import { useAccounts } from "@/lib/accounts";
import {
  ACTION_SUGGESTIONS,
  DEFAULT_ACTIONS,
  DEFAULT_FEELINGS,
  DEFAULT_FORMATS,
  DEFAULT_TOPICS,
  FEELING_SUGGESTIONS,
  FORMAT_SUGGESTIONS,
  FormatDef,
  TOPIC_SUGGESTIONS,
} from "@/lib/ideation";

const STEPS = [
  "Brand",
  "Socials",
  "Buckets",
  "Topics",
  "Formats",
  "Feelings & CTAs",
] as const;

// ————— Reusable editor for a list of free-text chips —————
function ChipListEditor({
  items,
  onChange,
  suggestions,
  defaults,
  placeholder,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  defaults: string[];
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function add(value: string) {
    const v = value.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
  }

  const unused = suggestions.filter((s) => !items.includes(s));

  return (
    <>
      <div className="chip-row" style={{ marginBottom: 12 }}>
        {items.map((t) => (
          <button
            key={t}
            className="mini-chip removable"
            title="Remove"
            onClick={() => onChange(items.filter((x) => x !== t))}
          >
            {t} <X size={10} />
          </button>
        ))}
        {items.length === 0 && (
          <span className="section-hint">Nothing here yet — add your own below.</span>
        )}
      </div>

      <div className="setup-row">
        <input
          className="prop-input"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              add(draft);
              setDraft("");
            }
          }}
        />
        <button
          className="btn btn-ghost"
          onClick={() => {
            add(draft);
            setDraft("");
          }}
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {unused.length > 0 && (
        <>
          <div className="t-eyebrow suggest-head">
            <Sparkles size={11} className="suggest-spark" /> Tap to add
          </div>
          <div className="chip-row">
            {unused.map((s) => (
              <button key={s} className="mini-chip" onClick={() => add(s)}>
                + {s}
              </button>
            ))}
          </div>
        </>
      )}

      <button
        className="btn btn-ghost restore-btn"
        onClick={() => onChange([...defaults])}
      >
        <RotateCcw size={13} /> Restore defaults
      </button>
    </>
  );
}

// ————— Editor for formats (name + optional structure hint) —————
function FormatListEditor({
  items,
  onChange,
}: {
  items: ProfileFormat[];
  onChange: (next: ProfileFormat[]) => void;
}) {
  const unused = FORMAT_SUGGESTIONS.filter(
    (s) => !items.some((f) => f.name.toLowerCase() === s.name.toLowerCase())
  );

  function patch(id: string, key: "name" | "hint", value: string) {
    onChange(items.map((f) => (f.id === id ? { ...f, [key]: value } : f)));
  }

  return (
    <>
      {items.map((f) => (
        <div className="format-row" key={f.id}>
          <input
            className="prop-input format-name"
            value={f.name}
            placeholder="Format name"
            onChange={(e) => patch(f.id, "name", e.target.value)}
          />
          <input
            className="prop-input"
            value={f.hint ?? ""}
            placeholder="Structure / beats (optional)"
            onChange={(e) => patch(f.id, "hint", e.target.value)}
          />
          <button
            className="icon-btn"
            aria-label="Remove format"
            onClick={() => onChange(items.filter((x) => x.id !== f.id))}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      <button
        className="btn btn-ghost"
        style={{ marginTop: 8 }}
        onClick={() => onChange([...items, newFormat()])}
      >
        <Plus size={14} /> Add format
      </button>

      {unused.length > 0 && (
        <>
          <div className="t-eyebrow suggest-head">
            <Sparkles size={11} className="suggest-spark" /> Tap to add
          </div>
          <div className="suggest-grid">
            {unused.map((s: FormatDef) => (
              <button
                key={s.name}
                className="suggest-card"
                onClick={() => onChange([...items, newFormat(s.name, s.hint)])}
              >
                <strong>{s.name}</strong>
                <span>{s.hint}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <button
        className="btn btn-ghost restore-btn"
        onClick={() =>
          onChange(DEFAULT_FORMATS.map((f) => newFormat(f.name, f.hint)))
        }
      >
        <RotateCcw size={13} /> Restore defaults
      </button>
    </>
  );
}

export default function SetupWizard({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const update = useProfile((s) => s.update);
  const [step, setStep] = useState(0);

  const suggestions = suggestBuckets(profile.niche, profile.audience).filter(
    (s) => !profile.buckets.some((b) => b.name.toLowerCase() === s.name.toLowerCase())
  );

  function finish() {
    update({
      setupComplete: true,
      buckets: profile.buckets.filter((b) => b.name.trim()),
      socials: profile.socials.filter((s) => s.handle.trim()),
      formats: profile.formats.filter((f) => f.name.trim()),
    });
    if (profile.brandName.trim()) {
      const { activeId, rename } = useAccounts.getState();
      rename(activeId, profile.brandName.trim());
    }
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal setup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="setup-brand-word">
            Brand <em>·</em> Setup
          </div>
          <div className="setup-steps">
            {STEPS.map((s, i) => (
              <button
                key={s}
                className={`setup-dot${i === step ? " on" : ""}${i < step ? " done" : ""}`}
                onClick={() => setStep(i)}
              >
                <span className="t-mono">{String(i + 1).padStart(2, "0")}</span> {s}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <button
            className="btn btn-ghost head-close"
            onClick={onClose}
            aria-label="Close setup"
          >
            <X size={15} />
          </button>
        </div>

        <div className="setup-body">
          {step === 0 && (
            <div className="setup-panel">
              <h3 className="setup-title">Who are you making content as?</h3>
              <p className="setup-sub">
                This tailors the suggestions across the rest of setup and Brainstorm.
              </p>

              <div className="prop-label t-eyebrow">Brand / creator name</div>
              <input
                className="prop-input setup-input"
                value={profile.brandName}
                placeholder="e.g. Your name or brand"
                onChange={(e) => update({ brandName: e.target.value })}
              />

              <div className="prop-label t-eyebrow">Niche</div>
              <input
                className="prop-input setup-input"
                value={profile.niche}
                placeholder="e.g. fitness for busy parents, personal finance, design…"
                onChange={(e) => update({ niche: e.target.value })}
              />

              <div className="prop-label t-eyebrow">Who is it for? (audience)</div>
              <input
                className="prop-input setup-input"
                value={profile.audience}
                placeholder="e.g. beginners who feel overwhelmed"
                onChange={(e) => update({ audience: e.target.value })}
              />

              <div className="prop-label t-eyebrow">
                What do you offer / where do you send people?
              </div>
              <input
                className="prop-input setup-input"
                value={profile.offer}
                placeholder="e.g. newsletter, community, product, service"
                onChange={(e) => update({ offer: e.target.value })}
              />
            </div>
          )}

          {step === 1 && (
            <div className="setup-panel">
              <h3 className="setup-title">Where do you post?</h3>
              <p className="setup-sub">
                These become your publishing targets when the posting integrations
                land in a later phase.
              </p>

              {profile.socials.map((soc) => (
                <div className="setup-row" key={soc.id}>
                  <select
                    className="prop-select"
                    style={{ width: 150 }}
                    value={soc.platform}
                    onChange={(e) =>
                      update({
                        socials: profile.socials.map((s) =>
                          s.id === soc.id ? { ...s, platform: e.target.value } : s
                        ),
                      })
                    }
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <input
                    className="prop-input"
                    value={soc.handle}
                    placeholder="@handle or channel URL"
                    onChange={(e) =>
                      update({
                        socials: profile.socials.map((s) =>
                          s.id === soc.id ? { ...s, handle: e.target.value } : s
                        ),
                      })
                    }
                  />
                  <button
                    className="icon-btn"
                    aria-label="Remove account"
                    onClick={() =>
                      update({
                        socials: profile.socials.filter((s) => s.id !== soc.id),
                      })
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}

              <button
                className="btn btn-ghost"
                style={{ marginTop: 10 }}
                onClick={() => update({ socials: [...profile.socials, newSocial()] })}
              >
                <Plus size={14} /> Add account
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="setup-panel">
              <h3 className="setup-title">Your content buckets</h3>
              <p className="setup-sub">
                The 3–6 recurring themes everything you make falls into. They become
                the &quot;through the lens of&quot; step in Brainstorm and the columns
                on your Content Buckets board.
              </p>

              {profile.buckets.map((b) => (
                <div className="setup-row" key={b.id}>
                  <input
                    className="prop-input"
                    style={{ width: 200, flexShrink: 0 }}
                    value={b.name}
                    placeholder="Bucket name"
                    onChange={(e) =>
                      update({
                        buckets: profile.buckets.map((x) =>
                          x.id === b.id ? { ...x, name: e.target.value } : x
                        ),
                      })
                    }
                  />
                  <input
                    className="prop-input"
                    value={b.description ?? ""}
                    placeholder="What lives in this bucket?"
                    onChange={(e) =>
                      update({
                        buckets: profile.buckets.map((x) =>
                          x.id === b.id ? { ...x, description: e.target.value } : x
                        ),
                      })
                    }
                  />
                  <button
                    className="icon-btn"
                    aria-label="Remove bucket"
                    onClick={() =>
                      update({ buckets: profile.buckets.filter((x) => x.id !== b.id) })
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}

              <button
                className="btn btn-ghost"
                style={{ marginTop: 10 }}
                onClick={() => update({ buckets: [...profile.buckets, newBucket()] })}
              >
                <Plus size={14} /> Add bucket
              </button>

              {suggestions.length > 0 && (
                <>
                  <div className="t-eyebrow suggest-head">
                    <Sparkles size={11} className="suggest-spark" /> Need ideas? Tap to add
                  </div>
                  <div className="suggest-grid">
                    {suggestions.map((s) => (
                      <button
                        key={s.name}
                        className="suggest-card"
                        onClick={() =>
                          update({
                            buckets: [
                              ...profile.buckets,
                              newBucket(s.name, s.description),
                            ],
                          })
                        }
                      >
                        <strong>{s.name}</strong>
                        <span>{s.description}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="setup-panel">
              <h3 className="setup-title">Relatable topics</h3>
              <p className="setup-sub">
                The struggles and moments your audience is living through — the raw
                material for step 01 of every Brainstorm.
              </p>
              <ChipListEditor
                items={profile.topics}
                onChange={(topics) => update({ topics })}
                suggestions={TOPIC_SUGGESTIONS}
                defaults={DEFAULT_TOPICS}
                placeholder="Add a topic your audience feels…"
              />
            </div>
          )}

          {step === 4 && (
            <div className="setup-panel">
              <h3 className="setup-title">Content formats</h3>
              <p className="setup-sub">
                The shapes your content takes. The structure hint guides the script
                when you send an idea to the pipeline. Rename, remove, or add your own.
              </p>
              <FormatListEditor
                items={profile.formats}
                onChange={(formats) => update({ formats })}
              />
            </div>
          )}

          {step === 5 && (
            <div className="setup-panel">
              <h3 className="setup-title">Feelings &amp; goal actions</h3>
              <p className="setup-sub">
                What you want the viewer to feel, and the action you want them to
                take. Feeling &gt; action — get the emotion right and the action
                follows.
              </p>

              <div className="prop-label t-eyebrow" style={{ marginTop: 4 }}>
                Feelings
              </div>
              <ChipListEditor
                items={profile.feelings}
                onChange={(feelings) => update({ feelings })}
                suggestions={FEELING_SUGGESTIONS}
                defaults={DEFAULT_FEELINGS}
                placeholder="Add a feeling…"
              />

              <div
                className="prop-label t-eyebrow"
                style={{ marginTop: 22, borderTop: "1px solid var(--line-strong)", paddingTop: 18 }}
              >
                Goal actions (CTAs)
              </div>
              <ChipListEditor
                items={profile.actions}
                onChange={(actions) => update({ actions })}
                suggestions={ACTION_SUGGESTIONS}
                defaults={DEFAULT_ACTIONS}
                placeholder="Add a call to action…"
              />
            </div>
          )}
        </div>

        <div className="setup-foot">
          {step > 0 ? (
            <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={14} /> Back
            </button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button className="btn btn-amber" onClick={finish}>
              <Check size={14} /> Finish setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
