"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ClipboardPaste, Download, ImagePlus, Plus, Star, X } from "lucide-react";
import { usePlanner } from "@/lib/store";
import { useTeam } from "@/lib/team";
import { placeholderThumb } from "@/lib/recreate";
import { newId } from "@/lib/templates";
import type { ContentCard } from "@/lib/types";

/** YouTube's recommended thumbnail width; big enough to upload straight from here. */
const THUMB_MAX_W = 1280;

export function compressImage(file: File, maxW = 900, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

const thumbFile = (file: File) => compressImage(file, THUMB_MAX_W, 0.86);

function fileName(card: ContentCard, n?: number): string {
  const slug =
    card.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "thumbnail";
  return `${slug}${n ? `-option-${n}` : ""}.jpg`;
}

/**
 * Every way an image gets into a box: the file picker, a drop, ⌘V while the
 * box has focus (listened for on the document — Safari doesn't deliver paste
 * to a focused non-text element), and a "Paste image" button that reads the
 * clipboard directly.
 */
function useImageIntake(onImage: (dataUrl: string) => void, enabled: boolean) {
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [note, setNote] = useState("");
  const onImageRef = useRef(onImage);
  useEffect(() => {
    onImageRef.current = onImage;
  });

  async function setFromFiles(files: FileList | File[] | null) {
    const img = [...(files ?? [])].find((f) => f.type.startsWith("image/"));
    if (!img) {
      setNote("That isn't an image.");
      return;
    }
    setNote("");
    onImageRef.current(await thumbFile(img));
  }
  const setFromFilesRef = useRef(setFromFiles);
  useEffect(() => {
    setFromFilesRef.current = setFromFiles;
  });

  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      if (!boxRef.current?.contains(document.activeElement)) return;
      const files = [...(e.clipboardData?.items ?? [])]
        .filter((it) => it.type.startsWith("image/"))
        .map((it) => it.getAsFile())
        .filter((f): f is File => f !== null);
      if (!files.length) {
        setNote("There's no image on your clipboard.");
        return;
      }
      e.preventDefault();
      void setFromFilesRef.current(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [enabled]);

  async function pasteFromClipboard() {
    setNote("");
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          await setFromFiles([new File([blob], "pasted", { type })]);
          return;
        }
      }
      setNote("There's no image on your clipboard. Copy one first.");
    } catch {
      // Unsupported, or permission refused: the keyboard route still works.
      boxRef.current?.focus();
      setNote("Your browser blocked that — press ⌘V (Ctrl+V) now to paste instead.");
    }
  }

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!enabled || ![...e.dataTransfer.types].includes("Files")) return;
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      if (!enabled) return;
      e.preventDefault();
      setDragOver(false);
      void setFromFiles(e.dataTransfer.files);
    },
  };

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      hidden
      onChange={(e) => {
        void setFromFiles(e.target.files);
        // Reset, so picking the same file again still counts as a change.
        e.target.value = "";
      }}
    />
  );

  return {
    boxRef: boxRef as RefObject<HTMLDivElement>,
    dragOver,
    note,
    dropProps,
    fileInput,
    pick: () => fileRef.current?.click(),
    pasteFromClipboard,
  };
}

/**
 * The card's main thumbnail — the one on the board. The same field shows on
 * the Plan and Post tabs, so whatever is set on one is on the other.
 */
export function ThumbnailField({ card }: { card: ContentCard }) {
  const updateCard = usePlanner((s) => s.updateCard);
  const viewOnly = useTeam((s) => s.role === "viewer");
  const { boxRef, dragOver, note, dropProps, fileInput, pick, pasteFromClipboard } = useImageIntake(
    (src) => updateCard(card.id, { thumbnail: src }),
    !viewOnly
  );
  // No thumbnail yet: the board borrows the first reference, so show that.
  const stand = placeholderThumb(card);

  return (
    <div className="prop-thumb">
      <div className="prop-label t-eyebrow">Thumbnail</div>
      <div
        ref={boxRef}
        className={`thumb-box${dragOver ? " drag-over" : ""}${card.thumbnail ? " has-img" : ""}`}
        // Clicking the box focuses it, ready for ⌘V; it doesn't open the file
        // picker (that's what the Choose file button is for).
        tabIndex={viewOnly ? undefined : 0}
        {...dropProps}
      >
        {card.thumbnail ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.thumbnail} alt="Video thumbnail" />
            <a
              className="thumb-dl"
              href={card.thumbnail}
              download={fileName(card)}
              aria-label="Download thumbnail"
              title="Download"
              onClick={(e) => e.stopPropagation()}
            >
              <Download size={13} />
            </a>
            {!viewOnly && (
              <button
                className="thumb-remove"
                aria-label="Remove thumbnail"
                title="Remove thumbnail"
                onClick={(e) => {
                  e.stopPropagation();
                  updateCard(card.id, { thumbnail: undefined });
                }}
              >
                <X size={13} />
              </button>
            )}
          </>
        ) : stand ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={stand} alt="" className="thumb-standin" />
            <div className="thumb-standin-note">
              <span>Using your reference for now</span>
              {!viewOnly && (
                <span className="thumb-drop-sub">Paste, drop or choose your own to replace it</span>
              )}
            </div>
          </>
        ) : (
          <div className="thumb-empty">
            <ImagePlus size={18} />
            <span>{viewOnly ? "No thumbnail" : "Add a thumbnail"}</span>
            {!viewOnly && (
              <span className="thumb-drop-sub">Click here and press ⌘V, or drop an image</span>
            )}
          </div>
        )}
      </div>

      {!viewOnly && (
        <div className="thumb-actions">
          <button onClick={() => void pasteFromClipboard()}>
            <ClipboardPaste size={13} /> Paste image
          </button>
          <button onClick={pick}>
            <ImagePlus size={13} /> {card.thumbnail ? "Replace" : "Choose file"}
          </button>
        </div>
      )}
      {note && <div className="thumb-note">{note}</div>}
      {fileInput}
    </div>
  );
}

/**
 * Other thumbnail options, kept beside the main one on the Post tab so every
 * candidate is in one place when it's time to upload (or A/B test). Any of
 * them can be swapped in as the main thumbnail.
 */
export function AltThumbnails({ card }: { card: ContentCard }) {
  const updateCard = usePlanner((s) => s.updateCard);
  const viewOnly = useTeam((s) => s.role === "viewer");
  const alts = card.thumbnails ?? [];
  const { boxRef, dragOver, note, dropProps, fileInput, pick, pasteFromClipboard } = useImageIntake(
    (src) => {
      const cur = usePlanner.getState().cards.find((c) => c.id === card.id);
      updateCard(card.id, { thumbnails: [...(cur?.thumbnails ?? []), { id: newId("thumb"), src }] });
    },
    !viewOnly
  );

  function remove(id: string) {
    updateCard(card.id, { thumbnails: alts.filter((a) => a.id !== id) });
  }

  // The option becomes the main thumbnail; the old main takes its place.
  function makeMain(id: string) {
    const alt = alts.find((a) => a.id === id);
    if (!alt) return;
    const rest = card.thumbnail
      ? alts.map((a) => (a.id === id ? { id: a.id, src: card.thumbnail! } : a))
      : alts.filter((a) => a.id !== id);
    updateCard(card.id, { thumbnail: alt.src, thumbnails: rest });
  }

  if (viewOnly && !alts.length) return null;

  return (
    <div className="prop-thumb">
      <div className="prop-label t-eyebrow">More thumbnail options</div>
      <div className="thumb-alts">
        {alts.map((a, i) => (
          <div className="thumb-alt" key={a.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.src} alt={`Thumbnail option ${i + 2}`} />
            <span className="thumb-alt-n">{i + 2}</span>
            <a
              className="thumb-dl"
              href={a.src}
              download={fileName(card, i + 2)}
              aria-label={`Download option ${i + 2}`}
              title="Download"
            >
              <Download size={12} />
            </a>
            {!viewOnly && (
              <>
                <button className="thumb-make-main" onClick={() => makeMain(a.id)} title="Use as the main thumbnail">
                  <Star size={11} /> Use as main
                </button>
                <button className="thumb-remove" onClick={() => remove(a.id)} aria-label={`Remove option ${i + 2}`} title="Remove">
                  <X size={12} />
                </button>
              </>
            )}
          </div>
        ))}
        {!viewOnly && (
          <div
            ref={boxRef}
            className={`thumb-alt thumb-alt-add${dragOver ? " drag-over" : ""}`}
            tabIndex={0}
            role="button"
            aria-label="Add a thumbnail option"
            onClick={pick}
            onKeyDown={(e) => {
              if (e.key === "Enter") pick();
            }}
            {...dropProps}
          >
            <Plus size={16} />
            <span>Add an option</span>
          </div>
        )}
      </div>
      {!viewOnly && (
        <div className="thumb-actions">
          <button onClick={() => void pasteFromClipboard()}>
            <ClipboardPaste size={13} /> Paste an option
          </button>
        </div>
      )}
      {note && <div className="thumb-note">{note}</div>}
      {fileInput}
    </div>
  );
}
