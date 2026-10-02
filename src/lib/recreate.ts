import { InspoItem, SectionRef, thumbUrlFor } from "./inspo";
import { BUILTIN_PIPELINE, Pipeline } from "./pipelines";
import { newId, REF_SECTION_TITLE, sectionsFor } from "./templates";
import type { ContentCard, Section } from "./types";

/**
 * "Recreate this video": turn an Inspiration item into a new idea card with
 * the video already pinned as its reference, so you go straight to writing
 * your own titles and script.
 */

export function refFromInspo(item: InspoItem): SectionRef {
  return {
    id: newId("ref"),
    inspoId: item.id,
    title: item.title,
    url: item.url,
    thumbUrl: thumbUrlFor(item.videoId),
    channel: item.channel,
  };
}

/** The Long Form pipeline (the built-in one if it's still there), else the
 *  first long-form pipeline, else simply the first pipeline. */
export function recreatePipeline(pipelines: Pipeline[]): Pipeline | undefined {
  return (
    pipelines.find((p) => p.id === BUILTIN_PIPELINE["Long form"]) ??
    pipelines.find((p) => p.format === "Long form") ??
    pipelines[0]
  );
}

/** Its "Ideas" step if it has one, else its first step. */
function ideasStage(p: Pipeline): string {
  return (
    p.stages.find((s) => s.id === "ideas")?.id ??
    p.stages.find((s) => s.name.trim().toLowerCase() === "ideas")?.id ??
    p.stages[0]?.id ??
    "ideas"
  );
}

/** The box a reference video belongs in: the references box, else the
 *  first box that takes inspiration (short form's "Reference Link"). */
function refBox(sections: Section[]): Section | undefined {
  return (
    sections.find((s) => s.title === REF_SECTION_TITLE) ??
    sections.find((s) => s.allowRefs)
  );
}

export function recreateCardFields(
  item: InspoItem,
  pipeline: Pipeline | undefined
): Partial<ContentCard> & { title: string } {
  const format = pipeline?.format ?? "Long form";
  const sections = sectionsFor(format);
  const box = refBox(sections);
  if (box) box.refs = [refFromInspo(item)];
  return {
    title: item.title,
    contentType: format,
    pipelineId: pipeline?.id,
    status: pipeline ? ideasStage(pipeline) : "ideas",
    sections,
  };
}

/**
 * A stand-in thumbnail for a card that has none yet: the first reference
 * video or pasted screenshot, looking in the references box first and then
 * the title / thumbnail ideas boxes. Replaced the moment a real one is added.
 */
export function placeholderThumb(card: ContentCard): string | undefined {
  if (card.thumbnail) return undefined;
  const boxes = card.sections.filter(
    (s) => s.allowRefs || s.title === REF_SECTION_TITLE
  );
  boxes.sort(
    (a, b) =>
      Number(b.title === REF_SECTION_TITLE) - Number(a.title === REF_SECTION_TITLE)
  );
  for (const s of boxes) {
    const hit = s.refs?.[0]?.thumbUrl ?? s.images?.[0];
    if (hit) return hit;
  }
  return undefined;
}
