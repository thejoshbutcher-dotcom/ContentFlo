import { newId } from "./templates";
import type { ContentCard, ContentType, StatusColor } from "./types";

/**
 * Pipelines: the boards under "Pipeline", each with its own ordered steps.
 *
 * They started life hard-coded — four content types, one fixed list of
 * statuses. Now they're profile data: rename them, add your own, and rename /
 * add / reorder the steps inside each. Two things are kept separate on purpose:
 *
 *  - `format` is the card TEMPLATE (which boxes a card gets: a short-form
 *    script, a long-form packaging plan…). There are four, built in.
 *  - the pipeline is just where a card LIVES. "Client work" and "Main channel"
 *    can both be long-form pipelines.
 *
 * Everything already saved keeps working untouched: the four original
 * pipelines keep their ids, the original steps keep theirs ("ideas", "posted"…),
 * and a card with no `pipelineId` belongs to the built-in pipeline for its
 * content type — exactly where it always was.
 */

export type StageTab = "plan" | "script" | "post";

export interface PipelineStage {
  id: string;
  name: string;
  color: StatusColor;
  /** Which card tab a card in this step opens on. Custom steps leave it unset
   *  and take their neighbour's, so it stays right when steps are reordered. */
  tab?: StageTab;
}

export interface Pipeline {
  id: string;
  name: string;
  format: ContentType;
  stages: PipelineStage[];
}

/** Built-in pipeline id for each format — also how legacy cards are placed. */
export const BUILTIN_PIPELINE: Record<ContentType, string> = {
  "Short form": "short",
  "Long form": "long",
  Podcast: "podcast",
  Carousel: "carousel",
};

const BUILTIN_NAME: Record<ContentType, string> = {
  "Short form": "Short Form",
  "Long form": "Long Form",
  Podcast: "Podcast",
  Carousel: "Carousels",
};

export const FORMATS: ContentType[] = ["Short form", "Long form", "Podcast", "Carousel"];

export const STAGE_COLORS: StatusColor[] = [
  "slate",
  "gray",
  "brown",
  "pink",
  "yellow",
  "orange",
  "red",
  "purple",
  "blue",
  "green",
];

/** The original fixed steps. "Packaged" (titles + thumbnails before scripting)
 *  was always long-form only. */
export function defaultStages(format: ContentType): PipelineStage[] {
  const all: PipelineStage[] = [
    { id: "ideas", name: "Ideas", color: "slate", tab: "plan" },
    { id: "up-next", name: "Up Next", color: "pink", tab: "plan" },
    { id: "packaged", name: "Packaged", color: "yellow", tab: "plan" },
    { id: "scripting", name: "Scripting", color: "blue", tab: "script" },
    { id: "filming", name: "Filming", color: "red", tab: "script" },
    { id: "editing", name: "Editing", color: "purple", tab: "script" },
    { id: "ready", name: "Ready for Posting", color: "orange", tab: "post" },
    { id: "posted", name: "Posted", color: "green", tab: "post" },
  ];
  return all.filter((s) => s.id !== "packaged" || format === "Long form");
}

export function defaultPipelines(): Pipeline[] {
  return FORMATS.map((format) => ({
    id: BUILTIN_PIPELINE[format],
    name: BUILTIN_NAME[format],
    format,
    stages: defaultStages(format),
  }));
}

export function newPipeline(name: string, format: ContentType): Pipeline {
  return {
    id: newId("pipe"),
    name: name.trim() || "New pipeline",
    format,
    stages: defaultStages(format),
  };
}

export function newStage(name = "New step"): PipelineStage {
  return { id: newId("stage"), name, color: "gray" };
}

/** Board view id for a pipeline. Built-ins keep their original ids. */
export function viewIdFor(pipelineId: string): `board-${string}` {
  return `board-${pipelineId}`;
}

/**
 * The pipeline a card lives in. An explicit `pipelineId` wins; otherwise (every
 * card made before pipelines were editable) it's the built-in one for the
 * card's content type. If that's gone, the first pipeline of the same format,
 * then simply the first — a card is never orphaned off every board.
 */
export function pipelineOf(
  card: Pick<ContentCard, "pipelineId" | "contentType">,
  pipelines: Pipeline[]
): Pipeline | undefined {
  const format = card.contentType ?? "Short form";
  return (
    (card.pipelineId && pipelines.find((p) => p.id === card.pipelineId)) ||
    (!card.pipelineId && pipelines.find((p) => p.id === BUILTIN_PIPELINE[format])) ||
    pipelines.find((p) => p.format === format) ||
    pipelines[0]
  );
}

export function stageOf(
  card: Pick<ContentCard, "pipelineId" | "contentType" | "status">,
  pipelines: Pipeline[]
): PipelineStage | undefined {
  return pipelineOf(card, pipelines)?.stages.find((s) => s.id === card.status);
}

/**
 * The column a card is shown in. A status the pipeline doesn't have (its step
 * was deleted on another device, or the card was moved between pipelines by an
 * older build) falls into the first column rather than vanishing.
 */
export function effectiveStageId(
  card: Pick<ContentCard, "pipelineId" | "contentType" | "status">,
  pipelines: Pipeline[]
): string {
  const p = pipelineOf(card, pipelines);
  if (!p || !p.stages.length) return card.status;
  return p.stages.some((s) => s.id === card.status) ? card.status : p.stages[0].id;
}

/** A pipeline's last step is its finish line ("Posted", by default). */
export function isDone(
  card: Pick<ContentCard, "pipelineId" | "contentType" | "status">,
  pipelines: Pipeline[]
): boolean {
  const p = pipelineOf(card, pipelines);
  if (!p || p.stages.length < 2) return false;
  return p.stages[p.stages.length - 1].id === card.status;
}

/** Which card tab a step opens on: its own, else the nearest earlier step's,
 *  else the nearest later one's. */
export function tabForStage(pipeline: Pipeline | undefined, stageId: string): StageTab {
  const stages = pipeline?.stages ?? [];
  const i = stages.findIndex((s) => s.id === stageId);
  if (i === -1) return "plan";
  for (let j = i; j >= 0; j--) if (stages[j].tab) return stages[j].tab!;
  for (let j = i + 1; j < stages.length; j++) if (stages[j].tab) return stages[j].tab!;
  return "plan";
}

/**
 * Where a card lands when it moves to another pipeline: the same step if the
 * target has it, else the step with the same name, else the start.
 */
export function landingStage(
  from: PipelineStage | undefined,
  to: Pipeline
): string {
  if (from) {
    const same =
      to.stages.find((s) => s.id === from.id) ??
      to.stages.find((s) => s.name.toLowerCase() === from.name.toLowerCase());
    if (same) return same.id;
  }
  return to.stages[0]?.id ?? "ideas";
}

/** The card fields that change when a card moves to another pipeline. */
export function pipelineMovePatch(
  card: Pick<ContentCard, "pipelineId" | "contentType" | "status">,
  to: Pipeline,
  pipelines: Pipeline[]
): Pick<ContentCard, "pipelineId" | "contentType" | "status"> {
  return {
    pipelineId: to.id,
    contentType: to.format,
    status: landingStage(stageOf(card, pipelines), to),
  };
}
