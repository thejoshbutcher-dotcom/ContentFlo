import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cardToRow, rowToCard, type CardRow } from "../mapping";
import {
  defaultPipelines,
  effectiveStageId,
  pipelineOf,
  stageOf,
  type Pipeline,
  type PipelineStage,
} from "../pipelines";
import { isBlankContent } from "../richtext";
import { newId, sectionPhase, sectionsFor } from "../templates";
import type { ContentCard, Section } from "../types";
import { htmlToMarkdown, markdownToHtml } from "./markdown";
import { parseOutline } from "./outline";

/**
 * Everything the MCP tools do to CreatorFlo data.
 *
 * `db` is a Supabase client carrying the SIGNED-IN USER's access token, so
 * Row Level Security decides every read and write: people only see profiles
 * they own or are members of, and viewers' writes are refused by the
 * database itself. The explicit role checks below exist to give a clear
 * message ("you have view access only") instead of a silent no-op.
 *
 * Writes never clobber: each one reads the row, changes only what it was
 * asked to, and saves with compare-and-swap on the row's `updated_at`. If a
 * teammate (or the app) saved in between, nothing is written and the caller
 * is told to re-read. The app's own sync then merges our saved change into
 * anyone's open card per box, so typing in another box is never lost.
 */

export class ToolError extends Error {}

export interface McpContext {
  db: SupabaseClient;
  userId: string;
  email: string;
}

export type Role = "owner" | "editor" | "viewer";

export interface Board {
  id: string;
  name: string;
  role: Role;
  ownerId: string;
  pipelines: Pipeline[];
}

// ————— Boards (profiles) —————

export async function listBoards(ctx: McpContext): Promise<Board[]> {
  const [{ data: profiles, error }, { data: memberships }] = await Promise.all([
    ctx.db.from("profiles").select("id,name,user_id,sort,pipelines:data->pipelines").order("sort"),
    ctx.db.from("profile_members").select("profile_id,role").eq("user_id", ctx.userId),
  ]);
  if (error) throw new ToolError(`Couldn't read your boards: ${error.message}`);
  const roleOf = new Map(
    ((memberships ?? []) as { profile_id: string; role: Role }[]).map((m) => [m.profile_id, m.role])
  );
  return (
    (profiles ?? []) as {
      id: string;
      name: string;
      user_id: string;
      pipelines: Pipeline[] | null;
    }[]
  )
    .map((p) => ({
      id: p.id,
      name: p.name,
      ownerId: p.user_id,
      role: (p.user_id === ctx.userId ? "owner" : roleOf.get(p.id)) as Role,
      pipelines: Array.isArray(p.pipelines) && p.pipelines.length ? p.pipelines : defaultPipelines(),
    }))
    .filter((b) => Boolean(b.role));
}

/** A board by id or (case-insensitive) name. */
export async function resolveBoard(ctx: McpContext, ref: string): Promise<Board> {
  const boards = await listBoards(ctx);
  const q = ref.trim().toLowerCase();
  const byId = boards.find((b) => b.id === ref.trim());
  if (byId) return byId;
  const named = boards.filter((b) => b.name.toLowerCase() === q);
  if (named.length === 1) return named[0];
  if (named.length > 1) {
    throw new ToolError(
      `More than one board is called "${ref}". Use its id: ${named.map((b) => b.id).join(", ")}.`
    );
  }
  throw new ToolError(
    `No board called "${ref}". Your boards: ${boards.map((b) => `${b.name} (${b.id})`).join(", ") || "none"}.`
  );
}

export function resolvePipeline(board: Board, ref: string): Pipeline {
  const q = ref.trim().toLowerCase();
  const p =
    board.pipelines.find((x) => x.id === ref.trim()) ??
    board.pipelines.find((x) => x.name.toLowerCase() === q);
  if (!p) {
    throw new ToolError(
      `No pipeline "${ref}" on ${board.name}. Pipelines: ${board.pipelines.map((x) => x.name).join(", ")}.`
    );
  }
  return p;
}

export function resolveStage(pipeline: Pipeline, ref: string): PipelineStage {
  const q = ref.trim().toLowerCase();
  const s =
    pipeline.stages.find((x) => x.id === ref.trim()) ??
    pipeline.stages.find((x) => x.name.toLowerCase() === q);
  if (!s) {
    throw new ToolError(
      `No step "${ref}" in ${pipeline.name}. Steps: ${pipeline.stages.map((x) => x.name).join(" → ")}.`
    );
  }
  return s;
}

function requireEditor(board: Board) {
  if (board.role === "viewer") {
    throw new ToolError(
      `You have view access only on "${board.name}". Ask its owner for edit access to make changes.`
    );
  }
}

// ————— Cards —————

export interface CardSummary {
  id: string;
  title: string;
  pipeline: string;
  status: string;
  assignees: string[];
  posting_date: string | null;
  updated_at: string;
}

export async function listCards(
  ctx: McpContext,
  args: { board: string; pipeline?: string; status?: string; search?: string }
): Promise<{ board: string; cards: CardSummary[] }> {
  const board = await resolveBoard(ctx, args.board);
  const pipeline = args.pipeline ? resolvePipeline(board, args.pipeline) : null;

  // Never select the whole body: thumbnails are large data URLs.
  let q = ctx.db
    .from("cards")
    .select(
      "id,title,status,content_type,posting_date,updated_at,pipelineId:body->>pipelineId,assignees:body->assignees"
    )
    .eq("profile_id", board.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (args.search?.trim()) q = q.ilike("title", `%${args.search.trim().replace(/[%_]/g, "\\$&")}%`);
  const { data, error } = await q;
  if (error) throw new ToolError(`Couldn't read cards: ${error.message}`);

  const wantStatus = args.status?.trim().toLowerCase();
  const cards = (
    (data ?? []) as {
      id: string;
      title: string;
      status: string;
      content_type: ContentCard["contentType"] | null;
      posting_date: string | null;
      updated_at: string;
      pipelineId: string | null;
      assignees: string[] | null;
    }[]
  )
    .map((r) => {
      const ref = {
        pipelineId: r.pipelineId ?? undefined,
        contentType: r.content_type ?? undefined,
        status: r.status,
      };
      const p = pipelineOf(ref, board.pipelines);
      const st = stageOf(ref, board.pipelines);
      return {
        row: r,
        pipelineId: p?.id ?? null,
        summary: {
          id: r.id,
          title: r.title,
          pipeline: p?.name ?? "—",
          status: st?.name ?? effectiveStageId(ref, board.pipelines),
          assignees: r.assignees ?? [],
          posting_date: r.posting_date,
          updated_at: r.updated_at,
        },
        stageId: effectiveStageId(ref, board.pipelines),
      };
    })
    .filter((x) => !pipeline || x.pipelineId === pipeline.id)
    .filter(
      (x) =>
        !wantStatus ||
        x.stageId.toLowerCase() === wantStatus ||
        x.summary.status.toLowerCase() === wantStatus
    )
    .map((x) => x.summary);

  return { board: board.name, cards };
}

interface LoadedCard {
  row: CardRow;
  card: ContentCard;
  board: Board;
}

async function loadCard(ctx: McpContext, id: string): Promise<LoadedCard> {
  const { data, error } = await ctx.db
    .from("cards")
    .select("*")
    .eq("id", id.trim())
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new ToolError(`Couldn't read that card: ${error.message}`);
  if (!data) throw new ToolError(`No card with id "${id}" that you can see.`);
  const row = data as CardRow & { profile_id: string };
  const boards = await listBoards(ctx);
  const board = boards.find((b) => b.id === row.profile_id);
  if (!board) throw new ToolError(`No card with id "${id}" that you can see.`);
  return { row, card: rowToCard(row), board };
}

function boxTitle(s: Section): string {
  return s.title;
}

export async function getCard(ctx: McpContext, id: string) {
  const { row, card, board } = await loadCard(ctx, id);
  const pipeline = pipelineOf(card, board.pipelines);
  return {
    id: card.id,
    board: board.name,
    board_id: board.id,
    your_role: board.role,
    title: card.title,
    pipeline: pipeline?.name ?? null,
    status: stageOf(card, board.pipelines)?.name ?? card.status,
    format: card.contentType ?? null,
    assignees: card.assignees ?? [],
    posting_date: card.postingDate ?? null,
    has_thumbnail: Boolean(card.thumbnail),
    updated_at: row.updated_at,
    boxes: card.sections.map((s) => ({
      title: boxTitle(s),
      phase: sectionPhase(s),
      markdown: htmlToMarkdown(s.content ?? ""),
      references: (s.refs ?? []).map((r) => ({ title: r.title, url: r.url })),
    })),
    review_versions: (card.review?.versions ?? []).length,
  };
}

function findBox(card: ContentCard, title: string): Section {
  const q = title.trim().toLowerCase();
  const exact = card.sections.find((s) => s.title.toLowerCase() === q || s.id === title.trim());
  if (exact) return exact;
  const loose = card.sections.filter((s) => s.title.toLowerCase().includes(q));
  if (loose.length === 1) return loose[0];
  throw new ToolError(
    `${loose.length > 1 ? `"${title}" matches more than one box` : `No box called "${title}"`}. Boxes on this card: ${card.sections
      .map((s) => `"${s.title}"`)
      .join(", ")}.`
  );
}

export async function getOutlineChapters(ctx: McpContext, id: string) {
  const { row, card } = await loadCard(ctx, id);
  const outline = card.sections.find((s) => s.title.toLowerCase() === "outline");
  if (!outline || isBlankContent(outline.content ?? "")) {
    throw new ToolError(`"${card.title}" has no Outline written yet.`);
  }
  return {
    card_id: card.id,
    title: card.title,
    updated_at: row.updated_at,
    ...parseOutline(htmlToMarkdown(outline.content)),
  };
}

/** Save a changed card, only if nobody saved it since we read it. */
async function saveCas(ctx: McpContext, loaded: LoadedCard, next: ContentCard): Promise<string> {
  const now = new Date().toISOString();
  const body: ContentCard = { ...next, updatedAt: now };
  const row = { ...cardToRow(body, loaded.row.user_id, loaded.row.profile_id), updated_at: now };
  const { data, error } = await ctx.db
    .from("cards")
    .update(row)
    .eq("id", loaded.row.id)
    .eq("updated_at", loaded.row.updated_at)
    .select("updated_at");
  if (error) throw new ToolError(`Couldn't save: ${error.message}`);
  if (!data?.length) {
    throw new ToolError(
      "This card changed since it was read (someone else saved it). Nothing was written — read it again with get_card and retry."
    );
  }
  return (data[0] as { updated_at: string }).updated_at;
}

function checkExpected(loaded: LoadedCard, expected?: string) {
  if (expected && Date.parse(expected) !== Date.parse(loaded.row.updated_at)) {
    throw new ToolError(
      `This card changed since you read it (you had ${expected}; it's now ${loaded.row.updated_at}). Nothing was written — read it again with get_card and retry.`
    );
  }
}

export type UpdateMode = "replace" | "append" | "fill_if_empty";

export async function updateBox(
  ctx: McpContext,
  args: { card_id: string; box: string; content: string; mode: UpdateMode; expected_updated_at?: string }
) {
  const loaded = await loadCard(ctx, args.card_id);
  requireEditor(loaded.board);
  checkExpected(loaded, args.expected_updated_at);

  const box = findBox(loaded.card, args.box);
  const html = markdownToHtml(args.content);
  const had = !isBlankContent(box.content ?? "");
  if (args.mode === "fill_if_empty" && had) {
    throw new ToolError(
      `"${box.title}" already has content, so fill_if_empty left it alone. Use mode "append" to add to it or "replace" to overwrite it.`
    );
  }
  const content = args.mode === "append" && had ? `${box.content}${html}` : html;

  const next: ContentCard = {
    ...loaded.card,
    sections: loaded.card.sections.map((s) => (s.id === box.id ? { ...s, content } : s)),
  };
  const updated_at = await saveCas(ctx, loaded, next);
  return { card_id: loaded.card.id, box: box.title, mode: args.mode, updated_at };
}

export async function moveCard(
  ctx: McpContext,
  args: { card_id: string; status: string; expected_updated_at?: string }
) {
  const loaded = await loadCard(ctx, args.card_id);
  requireEditor(loaded.board);
  checkExpected(loaded, args.expected_updated_at);
  const pipeline = pipelineOf(loaded.card, loaded.board.pipelines);
  if (!pipeline) throw new ToolError("That card isn't on any pipeline.");
  const stage = resolveStage(pipeline, args.status);
  const updated_at = await saveCas(ctx, loaded, { ...loaded.card, status: stage.id });
  return { card_id: loaded.card.id, pipeline: pipeline.name, status: stage.name, updated_at };
}

export async function createCard(
  ctx: McpContext,
  args: {
    board: string;
    pipeline: string;
    status?: string;
    title: string;
    boxes?: Record<string, string>;
  }
) {
  const board = await resolveBoard(ctx, args.board);
  requireEditor(board);
  const pipeline = resolvePipeline(board, args.pipeline);
  const stage = args.status ? resolveStage(pipeline, args.status) : pipeline.stages[0];
  if (!stage) throw new ToolError(`${pipeline.name} has no steps.`);

  const now = new Date().toISOString();
  const card: ContentCard = {
    id: newId("card"),
    title: args.title.trim(),
    status: stage.id,
    contentType: pipeline.format,
    pipelineId: pipeline.id,
    sections: sectionsFor(pipeline.format),
    createdAt: now,
    updatedAt: now,
  };
  for (const [title, md] of Object.entries(args.boxes ?? {})) {
    const box = findBox(card, title); // throws, listing the boxes, before anything is saved
    box.content = markdownToHtml(md);
  }

  const row = cardToRow(card, board.ownerId, board.id);
  const { data, error } = await ctx.db.from("cards").insert(row).select("id,updated_at");
  if (error) throw new ToolError(`Couldn't create the card: ${error.message}`);
  const saved = (data ?? [])[0] as { id: string; updated_at: string } | undefined;
  if (!saved) throw new ToolError("The card wasn't saved.");
  return {
    card_id: saved.id,
    board: board.name,
    pipeline: pipeline.name,
    status: stage.name,
    boxes: card.sections.map((s) => s.title),
    updated_at: saved.updated_at,
  };
}
