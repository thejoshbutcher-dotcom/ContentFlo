"use client";

import { useRef, useState } from "react";
import { Check, Clock, ExternalLink, Link2, Plus, Trash2, X } from "lucide-react";
import {
  CardReview,
  formatTimecode,
  parseReviewUrl,
  PROVIDER_LABEL,
  ReviewComment,
  ReviewVersion,
  sortComments,
} from "@/lib/review";
import { usePlanner } from "@/lib/store";
import { useTeam } from "@/lib/team";
import Avatar, { Name } from "./Avatar";
import { newId } from "@/lib/templates";
import { ContentCard } from "@/lib/types";
import ReviewPlayer, { ReviewPlayerHandle } from "./ReviewPlayer";

const HOSTS_HELP =
  "Works with YouTube (Unlisted is fine), Vimeo, and Dropbox file links — the hosts that let notes be pinned to an exact moment.";

/**
 * The Review tab: a cut, and the notes on it.
 *
 * The loop it's built around: watch, hit something worth a note, start typing —
 * the video pauses and the note is stamped with that moment. Click any note
 * later and the player jumps back to it. A new cut is a new version with a
 * clean slate, and the old ones (with their notes) stay a click away.
 */
export default function ReviewTab({ card }: { card: ContentCard }) {
  const updateCard = usePlanner((s) => s.updateCard);
  const me = useTeam((s) => s.me);
  const viewOnly = useTeam((s) => s.role === "viewer");

  const versions = card.review?.versions ?? [];
  const [pickedId, setPickedId] = useState<string | null>(null);
  // Follows the newest cut until you deliberately pick an older one — so a
  // teammate uploading v3 while you have the card open shows you v3.
  const active =
    versions.find((v) => v.id === pickedId) ?? versions[versions.length - 1] ?? null;

  const [adding, setAdding] = useState(false);

  function write(next: ReviewVersion[]) {
    // Always from the store's latest copy: a teammate's note may have arrived
    // since this render.
    updateCard(card.id, { review: { versions: next } satisfies CardReview });
  }
  const latest = () =>
    usePlanner.getState().cards.find((c) => c.id === card.id)?.review?.versions ?? [];

  function addVersion(url: string): string | null {
    const src = parseReviewUrl(url);
    if (!src) return "That link isn't from YouTube, Vimeo or Dropbox (or it's a Dropbox folder, not a file).";
    const v: ReviewVersion = {
      id: newId("cut"),
      url: url.trim(),
      provider: src.provider,
      addedAt: new Date().toISOString(),
      addedBy: me?.email ?? "",
      comments: [],
    };
    write([...latest(), v]);
    setPickedId(null);
    setAdding(false);
    return null;
  }

  function patchVersion(id: string, fn: (v: ReviewVersion) => ReviewVersion) {
    write(latest().map((v) => (v.id === id ? fn(v) : v)));
  }

  if (!active) {
    return (
      <div className="modal-body review-body empty">
        <div className="review-empty">
          <h3>Review the edit right here</h3>
          <p>
            Paste a link to the cut. It plays on this card, and everyone on the
            profile can leave notes pinned to the exact moment they&rsquo;re about.
          </p>
          {viewOnly ? (
            <p className="review-muted">Nothing has been added for review yet.</p>
          ) : (
            <LinkForm cta="Add for review" onSubmit={addVersion} autoFocus />
          )}
          <p className="review-muted">{HOSTS_HELP}</p>
        </div>
      </div>
    );
  }

  const number = versions.findIndex((v) => v.id === active.id) + 1;

  return (
    <div className="modal-body review-body">
      <div className="review-main">
        <div className="review-versions">
          {versions.map((v, i) => {
            const open = v.comments.filter((c) => !c.resolved).length;
            return (
              <button
                key={v.id}
                className={`review-v${v.id === active.id ? " on" : ""}`}
                onClick={() => setPickedId(v.id)}
                title={`Added ${new Date(v.addedAt).toLocaleDateString()}${v.addedBy ? ` by ${v.addedBy}` : ""}`}
              >
                v{i + 1}
                {open > 0 && <span className="review-v-count">{open}</span>}
              </button>
            );
          })}
          {!viewOnly && (
            <button className="review-v add" onClick={() => setAdding((a) => !a)}>
              <Plus size={12} /> New version
            </button>
          )}
          <span className="review-source">
            {PROVIDER_LABEL[active.provider]}
            <a href={active.url} target="_blank" rel="noreferrer" title="Open the original link">
              <ExternalLink size={12} />
            </a>
            {!viewOnly && (
              <button
                title={`Delete v${number} and its notes`}
                onClick={() => {
                  const n = active.comments.length;
                  if (
                    !confirm(
                      `Delete v${number}${n ? ` and its ${n} note${n === 1 ? "" : "s"}` : ""}? This can't be undone.`
                    )
                  )
                    return;
                  write(latest().filter((v) => v.id !== active.id));
                  setPickedId(null);
                }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </span>
        </div>

        {adding && (
          <div className="review-add">
            <LinkForm
              cta={`Add as v${versions.length + 1}`}
              onSubmit={addVersion}
              autoFocus
              onCancel={() => setAdding(false)}
            />
            <p className="review-muted">
              A new version starts with a clean slate; v{versions.length}&rsquo;s notes stay
              with v{versions.length}.
            </p>
          </div>
        )}

        <Cut
          key={active.id}
          version={active}
          viewOnly={viewOnly}
          me={me?.email ?? ""}
          onChange={(fn) => patchVersion(active.id, fn)}
        />
      </div>
    </div>
  );
}

/** One version: its player, the marker strip, the notes, the composer. */
function Cut({
  version,
  viewOnly,
  me,
  onChange,
}: {
  version: ReviewVersion;
  viewOnly: boolean;
  me: string;
  onChange: (fn: (v: ReviewVersion) => ReviewVersion) => void;
}) {
  const player = useRef<ReviewPlayerHandle | null>(null);
  const [now, setNow] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  // The moment the note is about: captured when typing starts, not when it's
  // posted — by then you've usually played on.
  const [stamp, setStamp] = useState<number | null>(null);
  const [general, setGeneral] = useState(false);
  const [hideDone, setHideDone] = useState(false);

  const source = parseReviewUrl(version.url);
  const notes = sortComments(version.comments).filter((c) => !hideDone || !c.resolved);
  const doneCount = version.comments.filter((c) => c.resolved).length;

  async function capture() {
    player.current?.pause();
    const t = (await player.current?.getTime()) ?? 0;
    setStamp(t);
    setGeneral(false);
  }

  function post() {
    const text = draft.trim();
    if (!text) return;
    const note: ReviewComment = {
      id: newId("note"),
      time: general ? null : (stamp ?? now),
      text,
      author: me,
      createdAt: new Date().toISOString(),
    };
    onChange((v) => ({ ...v, comments: [...v.comments, note] }));
    setDraft("");
    setStamp(null);
    setGeneral(false); // the next note is pinned to a moment again by default
  }

  const setNote = (id: string, patch: Partial<ReviewComment>) =>
    onChange((v) => ({
      ...v,
      comments: v.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));

  const at = general ? null : (stamp ?? now);

  return (
    <div className="review-cut">
      <div className="review-player">
        {source ? (
          <ReviewPlayer
            ref={player}
            source={source}
            onTime={setNow}
            onDuration={(d) => Number.isFinite(d) && d > 0 && setDuration(d)}
            onError={setError}
          />
        ) : (
          <div className="review-stage" />
        )}
        {error && <div className="review-error">{error}</div>}

        {/* Where the notes fall in the cut. The hosts' own scrubbers can't be
            drawn on, so this sits underneath as a map of the feedback. */}
        {duration > 0 && (
          <div
            className="review-strip"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              player.current?.seek(((e.clientX - r.left) / r.width) * duration);
            }}
          >
            <span className="review-playhead" style={{ left: `${(now / duration) * 100}%` }} />
            {version.comments
              .filter((c) => c.time !== null)
              .map((c) => (
                <button
                  key={c.id}
                  className={`review-pin${c.resolved ? " done" : ""}`}
                  style={{ left: `${Math.min((c.time! / duration) * 100, 100)}%` }}
                  title={`${formatTimecode(c.time!)} — ${c.text}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    player.current?.seek(c.time!);
                  }}
                />
              ))}
          </div>
        )}

        {viewOnly ? (
          <p className="review-muted review-viewonly">
            You have view-only access to this profile, so you can read notes but not
            add them.
          </p>
        ) : (
          <div className={`review-composer${draft ? " has-text" : ""}`}>
            {me ? (
              <Avatar email={me} size={28} className="review-composer-me" />
            ) : (
              <span className="peer-dot review-composer-me">•</span>
            )}
            <div className="review-composer-field">
              <textarea
                value={draft}
                rows={2}
                placeholder={
                  general
                    ? "Leave a general note about this cut…"
                    : `Leave a note at ${formatTimecode(at ?? 0)}…`
                }
                onFocus={() => {
                  if (!draft && stamp === null && !general) void capture();
                }}
                onChange={(e) => {
                  if (!draft && stamp === null && !general) void capture();
                  setDraft(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    post();
                  }
                }}
              />
              <div className="review-composer-bar">
                {general ? (
                  <button className="review-stamp general" onClick={() => setGeneral(false)}>
                    General note &middot; pin to a moment instead
                  </button>
                ) : (
                  <span className="review-stamp">
                    <button onClick={() => void capture()} title="Re-stamp with the current moment">
                      <Clock size={12} /> {formatTimecode(at ?? 0)}
                    </button>
                    <button
                      onClick={() => setGeneral(true)}
                      title="Make this a general note instead"
                      aria-label="Make this a general note"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
                <span className="review-composer-hint">Enter to post &middot; Shift+Enter for a new line</span>
                <button className="btn btn-amber" disabled={!draft.trim()} onClick={post}>
                  Post note
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="review-notes-wrap">
      <div className="review-notes">
        <div className="review-notes-head">
          <span className="t-eyebrow">
            Notes{version.comments.length > 0 && ` · ${version.comments.length - doneCount} open`}
          </span>
          {doneCount > 0 && (
            <button className="review-link" onClick={() => setHideDone((h) => !h)}>
              {hideDone ? `Show ${doneCount} resolved` : "Hide resolved"}
            </button>
          )}
        </div>

        <div className="review-list">
          {notes.length === 0 && (
            <p className="review-muted pad">
              {version.comments.length
                ? "Everything's resolved."
                : "No notes yet. Play the cut, and when something needs a change, start typing under the video — the note is stamped with that exact moment."}
            </p>
          )}
          {notes.map((c) => (
            <div
              key={c.id}
              className={`review-note${c.resolved ? " done" : ""}${
                c.time !== null && Math.abs(c.time - now) < 1.5 ? " here" : ""
              }`}
            >
              <button
                className={`review-check${c.resolved ? " on" : ""}`}
                disabled={viewOnly}
                onClick={() => setNote(c.id, { resolved: !c.resolved })}
                title={c.resolved ? "Mark as not done" : "Mark as done"}
                aria-label={c.resolved ? "Mark as not done" : "Mark as done"}
              >
                {c.resolved && <Check size={11} />}
              </button>
              <div className="review-note-body">
                <div className="review-note-meta">
                  {c.time !== null ? (
                    <button
                      className="review-time"
                      onClick={() => player.current?.seek(c.time!)}
                      title="Jump to this moment"
                    >
                      {formatTimecode(c.time)}
                    </button>
                  ) : (
                    <span className="review-time general">General</span>
                  )}
                  {c.author && (
                    <span className="review-author" title={c.author}>
                      <Avatar email={c.author} size={16} />
                      <Name email={c.author} />
                    </span>
                  )}
                </div>
                <div className="review-text">{c.text}</div>
              </div>
              {!viewOnly && (!c.author || c.author === me) && (
                <button
                  className="share-x"
                  aria-label="Delete note"
                  title="Delete note"
                  onClick={() =>
                    onChange((v) => ({ ...v, comments: v.comments.filter((x) => x.id !== c.id) }))
                  }
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

      </div>
      </div>
    </div>
  );
}

function LinkForm({
  cta,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  cta: string;
  /** Returns an error message, or null when the link was accepted. */
  onSubmit: (url: string) => string | null;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  function go() {
    if (!url.trim()) return;
    setError(onSubmit(url) ?? "");
  }

  return (
    <>
      <div className="review-linkform">
        <Link2 size={14} />
        <input
          value={url}
          autoFocus={autoFocus}
          placeholder="Paste a YouTube, Vimeo or Dropbox link"
          onChange={(e) => {
            setUrl(e.target.value);
            setError("");
          }}
          onPaste={(e) => {
            // Pasting a good link is the whole gesture — no second click.
            const text = e.clipboardData.getData("text");
            if (parseReviewUrl(text)) {
              e.preventDefault();
              setError(onSubmit(text) ?? "");
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") go();
            if (e.key === "Escape" && onCancel) {
              e.stopPropagation();
              onCancel();
            }
          }}
        />
        <button className="btn btn-amber" onClick={go} disabled={!url.trim()}>
          {cta}
        </button>
      </div>
      {error && <div className="inspo-add-error">{error}</div>}
    </>
  );
}
