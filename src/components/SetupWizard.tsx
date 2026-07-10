"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Sparkles, Trash2, X } from "lucide-react";
import {
  PLATFORMS,
  newBucket,
  newSocial,
  suggestBuckets,
  useProfile,
} from "@/lib/profile";
import { useAccounts } from "@/lib/accounts";
import { RELATABLE_TOPICS } from "@/lib/ideation";

const STEPS = ["Brand", "Socials", "Content buckets", "Relatable topics"] as const;

export default function SetupWizard({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const update = useProfile((s) => s.update);
  const [step, setStep] = useState(0);
  const [topicDraft, setTopicDraft] = useState("");

  const suggestions = suggestBuckets(profile.niche, profile.audience).filter(
    (s) => !profile.buckets.some((b) => b.name.toLowerCase() === s.name.toLowerCase())
  );

  function finish() {
    update({
      setupComplete: true,
      buckets: profile.buckets.filter((b) => b.name.trim()),
      socials: profile.socials.filter((s) => s.handle.trim()),
    });
    if (profile.brandName.trim()) {
      const { activeId, rename } = useAccounts.getState();
      rename(activeId, profile.brandName.trim());
    }
    onClose();
  }

  function addTopicDraft() {
    const t = topicDraft.trim();
    if (t && !profile.topics.includes(t)) {
      update({ topics: [...profile.topics, t] });
    }
    setTopicDraft("");
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
            className="btn btn-ghost"
            style={{ color: "#fff", borderColor: "var(--ink-3)" }}
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
                Brainstorm uses this to tailor suggested buckets and framing.
              </p>

              <div className="prop-label t-eyebrow">Brand / creator name</div>
              <input
                className="prop-input setup-input"
                value={profile.brandName}
                placeholder="e.g. Josh Butcher Online"
                onChange={(e) => update({ brandName: e.target.value })}
              />

              <div className="prop-label t-eyebrow">Niche</div>
              <input
                className="prop-input setup-input"
                value={profile.niche}
                placeholder="e.g. AI tools & content systems for solo creators"
                onChange={(e) => update({ niche: e.target.value })}
              />

              <div className="prop-label t-eyebrow">Who is it for? (audience)</div>
              <input
                className="prop-input setup-input"
                value={profile.audience}
                placeholder="e.g. millennial multi-passionate creators building online"
                onChange={(e) => update({ audience: e.target.value })}
              />

              <div className="prop-label t-eyebrow">
                What do you offer / where do you send people?
              </div>
              <input
                className="prop-input setup-input"
                value={profile.offer}
                placeholder="e.g. newsletter, community, lead magnet, product"
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
                    style={{ width: 220, flexShrink: 0 }}
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
                  <div
                    className="t-eyebrow"
                    style={{ color: "var(--amber-deep)", margin: "22px 0 8px" }}
                  >
                    <Sparkles
                      size={11}
                      style={{ display: "inline", marginRight: 5, verticalAlign: -1 }}
                    />
                    Need ideas? Tap to add
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
                material for step 01 of every Brainstorm. Keep the ones that fit,
                cut the rest, add your own.
              </p>

              <div className="chip-row" style={{ marginBottom: 14 }}>
                {profile.topics.map((t) => (
                  <button
                    key={t}
                    className="mini-chip removable"
                    title="Remove topic"
                    onClick={() =>
                      update({ topics: profile.topics.filter((x) => x !== t) })
                    }
                  >
                    {t} <X size={10} />
                  </button>
                ))}
              </div>

              <div className="setup-row">
                <input
                  className="prop-input"
                  value={topicDraft}
                  placeholder="Add a topic your audience feels…"
                  onChange={(e) => setTopicDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addTopicDraft();
                  }}
                />
                <button className="btn btn-ghost" onClick={addTopicDraft}>
                  <Plus size={14} /> Add
                </button>
              </div>

              <button
                className="btn btn-ghost"
                style={{ marginTop: 12 }}
                onClick={() =>
                  update({
                    topics: [
                      ...profile.topics,
                      ...RELATABLE_TOPICS.filter((t) => !profile.topics.includes(t)),
                    ],
                  })
                }
              >
                Restore default topic list
              </button>
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
