"use client";

import { useEffect, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import {
  effectiveStageId,
  FORMATS,
  newPipeline,
  newStage,
  Pipeline,
  pipelineOf,
  PipelineStage,
  STAGE_COLORS,
} from "@/lib/pipelines";
import { useProfile } from "@/lib/profile";
import { STATUS_COLORS } from "@/lib/seed";
import { usePlanner } from "@/lib/store";
import { ContentType } from "@/lib/types";

const FORMAT_HELP: Record<ContentType, string> = {
  "Short form": "Hook, outline and script boxes for Reels, Shorts and TikToks",
  "Long form": "Titles, thumbnails, references, outline and a full script",
  Podcast: "Premise, talking points, stories and clips to cut",
  Carousel: "Hook slide, slides 2–9, CTA slide and design notes",
};

/**
 * Create a pipeline, or reshape an existing one: its name, and its steps —
 * rename, recolour, add, delete, drag to reorder. Every change saves as it's
 * made (and reaches teammates live), so there is no Save button to forget.
 *
 * What a pipeline is NOT is its card template: that's the `format` it was
 * created from, fixed for its lifetime, so cards never have their boxes pulled
 * out from under them.
 */
export default function PipelineEditor({
  pipelineId,
  onClose,
  onCreated,
}: {
  /** null = creating a new one. */
  pipelineId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  // Creating flips into editing the new pipeline, in the same dialog.
  const [id, setId] = useState(pipelineId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="inspo-add pipe-editor"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={id ? "Customize pipeline" : "New pipeline"}
      >
        <div className="inspo-add-head">
          <span className="section-title">
            {id ? "Customize pipeline" : "New pipeline"}
          </span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {id ? (
          <EditPipeline id={id} onClose={onClose} />
        ) : (
          <CreatePipeline
            onCreate={(p) => {
              setId(p.id);
              onCreated(p.id);
            }}
          />
        )}
      </div>
    </div>
  );
}

function CreatePipeline({ onCreate }: { onCreate: (p: Pipeline) => void }) {
  const update = useProfile((s) => s.update);
  const [name, setName] = useState("");
  const [format, setFormat] = useState<ContentType>("Long form");

  function create() {
    const p = newPipeline(name, format);
    update({ pipelines: [...useProfile.getState().pipelines, p] });
    onCreate(p);
  }

  return (
    <>
      <div className="prop-label t-eyebrow">Name</div>
      <input
        className="prop-input"
        autoFocus
        value={name}
        placeholder="e.g. Client videos, Second channel, Newsletter"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") create();
        }}
      />

      <div className="prop-label t-eyebrow">Cards in it use the template for</div>
      <div className="pipe-formats">
        {FORMATS.map((f) => (
          <button
            key={f}
            className={`pipe-format${format === f ? " on" : ""}`}
            onClick={() => setFormat(f)}
          >
            <strong>{f}</strong>
            <span>{FORMAT_HELP[f]}</span>
          </button>
        ))}
      </div>
      <p className="share-hint">
        It starts with the usual steps for that format &mdash; rename, add or
        reorder them next.
      </p>

      <div className="share-foot">
        <span />
        <button className="btn btn-amber" onClick={create}>
          <Plus size={14} /> Create pipeline
        </button>
      </div>
    </>
  );
}

function EditPipeline({ id, onClose }: { id: string; onClose: () => void }) {
  const pipelines = useProfile((s) => s.pipelines);
  const update = useProfile((s) => s.update);
  const cards = usePlanner((s) => s.cards);
  const moveCards = usePlanner((s) => s.moveCards);
  const [colorFor, setColorFor] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const pipeline = pipelines.find((p) => p.id === id);
  if (!pipeline) return null; // deleted (here or by a teammate)

  const mine = cards.filter((c) => pipelineOf(c, pipelines)?.id === id);
  const countIn = (stageId: string) =>
    mine.filter((c) => effectiveStageId(c, pipelines) === stageId).length;

  function save(patch: Partial<Pipeline>) {
    update({
      pipelines: useProfile
        .getState()
        .pipelines.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  }

  const setStage = (stageId: string, patch: Partial<PipelineStage>) =>
    save({
      stages: pipeline.stages.map((s) => (s.id === stageId ? { ...s, ...patch } : s)),
    });

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = pipeline!.stages.findIndex((s) => s.id === e.active.id);
    const to = pipeline!.stages.findIndex((s) => s.id === e.over!.id);
    if (from !== -1 && to !== -1) save({ stages: arrayMove(pipeline!.stages, from, to) });
  }

  function removeStage(stage: PipelineStage) {
    const stages = pipeline!.stages;
    if (stages.length <= 2) return;
    const i = stages.findIndex((s) => s.id === stage.id);
    // Cards in a deleted step step back one (or forward, from the first).
    const heir = stages[i - 1] ?? stages[i + 1];
    const stranded = mine.filter((c) => effectiveStageId(c, pipelines) === stage.id);
    if (
      stranded.length &&
      !confirm(
        `"${stage.name}" has ${stranded.length} card${stranded.length === 1 ? "" : "s"}. ` +
          `Delete the step and move ${stranded.length === 1 ? "it" : "them"} to "${heir.name}"?`
      )
    ) {
      return;
    }
    if (stranded.length) moveCards(stranded.map((c) => c.id), heir.id);
    save({ stages: stages.filter((s) => s.id !== stage.id) });
  }

  function addStage() {
    // New steps go in just before the finish line, where in-between steps live.
    const stages = [...pipeline!.stages];
    stages.splice(Math.max(stages.length - 1, 0), 0, newStage());
    save({ stages });
  }

  function removePipeline() {
    if (!confirm(`Delete the "${pipeline!.name}" pipeline? This can't be undone.`)) return;
    update({ pipelines: useProfile.getState().pipelines.filter((p) => p.id !== id) });
    onClose();
  }

  const last = pipeline.stages[pipeline.stages.length - 1];

  return (
    <>
      <div className="prop-label t-eyebrow">Name</div>
      <input
        className="prop-input"
        value={pipeline.name}
        placeholder="Pipeline name"
        onChange={(e) => save({ name: e.target.value })}
        onBlur={(e) => {
          if (!e.target.value.trim()) save({ name: "Untitled pipeline" });
        }}
      />

      <div className="prop-label t-eyebrow">
        Steps <span className="pipe-muted">&mdash; drag to reorder</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={pipeline.stages.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="pipe-stages">
            {pipeline.stages.map((s) => (
              <StageRow
                key={s.id}
                stage={s}
                count={countIn(s.id)}
                canDelete={pipeline.stages.length > 2}
                pickingColor={colorFor === s.id}
                onToggleColor={() => setColorFor((cur) => (cur === s.id ? null : s.id))}
                onChange={(patch) => setStage(s.id, patch)}
                onDelete={() => removeStage(s)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button className="pipe-add" onClick={addStage}>
        <Plus size={13} /> Add a step
      </button>
      <p className="share-hint">
        The last step (&ldquo;{last?.name}&rdquo;) is the finish line: cards there
        count as done, so they leave Content Buckets and are never flagged overdue.
      </p>

      <div className="share-foot">
        <button
          className="btn btn-ghost share-leave"
          onClick={removePipeline}
          disabled={mine.length > 0 || pipelines.length <= 1}
          title={
            mine.length > 0
              ? `Move or delete its ${mine.length} card${mine.length === 1 ? "" : "s"} first`
              : pipelines.length <= 1
                ? "You need at least one pipeline"
                : "Delete this pipeline"
          }
        >
          <Trash2 size={14} /> Delete pipeline
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Done
        </button>
      </div>
      <p className="pipe-template">
        Card template: <strong>{pipeline.format}</strong>
      </p>
    </>
  );
}

function StageRow({
  stage,
  count,
  canDelete,
  pickingColor,
  onToggleColor,
  onChange,
  onDelete,
}: {
  stage: PipelineStage;
  count: number;
  canDelete: boolean;
  pickingColor: boolean;
  onToggleColor: () => void;
  onChange: (patch: Partial<PipelineStage>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={`pipe-stage${isDragging ? " dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="pipe-stage-row">
        <button
          className="pipe-grip"
          aria-label={`Reorder ${stage.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
        <button
          className="pipe-dot"
          style={{ background: STATUS_COLORS[stage.color].dot }}
          onClick={onToggleColor}
          aria-label={`Colour for ${stage.name}`}
          title="Change colour"
        />
        <input
          className="pipe-stage-name"
          value={stage.name}
          placeholder="Step name"
          onChange={(e) => onChange({ name: e.target.value })}
          onBlur={(e) => {
            if (!e.target.value.trim()) onChange({ name: "Untitled step" });
          }}
        />
        {count > 0 && <span className="pipe-count t-mono">{count}</span>}
        <button
          className="share-x"
          onClick={onDelete}
          disabled={!canDelete}
          aria-label={`Delete ${stage.name}`}
          title={canDelete ? "Delete step" : "A pipeline needs at least two steps"}
        >
          <X size={13} />
        </button>
      </div>
      {pickingColor && (
        <div className="pipe-swatches">
          {STAGE_COLORS.map((c) => (
            <button
              key={c}
              className={`pipe-swatch${stage.color === c ? " on" : ""}`}
              style={{ background: STATUS_COLORS[c].dot }}
              onClick={() => {
                onChange({ color: c });
                onToggleColor();
              }}
              aria-label={c}
            />
          ))}
        </div>
      )}
    </div>
  );
}
