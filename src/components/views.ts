import {
  isDone,
  Pipeline,
  pipelineOf,
  viewIdFor,
} from "@/lib/pipelines";
import { ContentCard, ViewId } from "@/lib/types";

export interface ViewDef {
  id: ViewId;
  label: string;
  title: string;
  note: string;
  kind: "board" | "calendar" | "table" | "slate" | "inspo" | "competitors";
  groupBy?: "status" | "bucket";
  filter?: (c: ContentCard) => boolean;
  newCardType?: ContentCard["contentType"];
  /** Set on a pipeline's board: its steps are the columns. */
  pipeline?: Pipeline;
}

const IDEATION_VIEWS: ViewDef[] = [
  {
    id: "ideate",
    label: "Brainstorm",
    title: "Brainstorm",
    note: "Stack the deck, then send it to the pipeline",
    kind: "slate",
  },
  {
    id: "inspo",
    label: "Inspiration",
    title: "Inspiration",
    note: "Your swipe file — packaging and formats worth modelling",
    kind: "inspo",
  },
  {
    id: "competitors",
    label: "Competitors",
    title: "Competitors",
    note: "What's working for the channels you study",
    kind: "competitors",
  },
];

/**
 * Every view for this profile. The pipeline boards are generated from the
 * profile's pipelines, so renaming or adding one is all it takes for it to
 * show up in the sidebar, the mobile tabs and the last-view memory.
 */
export function viewDefs(pipelines: Pipeline[]): ViewDef[] {
  return [
    ...IDEATION_VIEWS,
    ...pipelines.map(
      (p): ViewDef => ({
        id: viewIdFor(p.id),
        label: p.name,
        title: p.name,
        note: `${p.stages[0]?.name ?? "Start"} → ${p.stages[p.stages.length - 1]?.name ?? "done"}`,
        kind: "board",
        groupBy: "status",
        filter: (c) => pipelineOf(c, pipelines)?.id === p.id,
        newCardType: p.format,
        pipeline: p,
      })
    ),
    {
      id: "board-buckets",
      label: "Content Buckets",
      title: "Content Buckets",
      note: "Everything not yet finished, grouped by bucket",
      kind: "board",
      groupBy: "bucket",
      filter: (c) => !isDone(c, pipelines),
    },
    {
      id: "calendar",
      label: "Posting Schedule",
      title: "Posting Schedule",
      note: "Everything with a posting date",
      kind: "calendar",
    },
    {
      id: "table",
      label: "All Content",
      title: "All Content",
      note: "Every card, every property",
      kind: "table",
    },
  ];
}
