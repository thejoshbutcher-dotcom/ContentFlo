import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createCard,
  getCard,
  getOutlineChapters,
  listBoards,
  listCards,
  moveCard,
  ToolError,
  updateBox,
  type McpContext,
} from "./cards";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

/** Run a tool body; data comes back as JSON text, failures as a plain sentence. */
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    const message =
      err instanceof ToolError
        ? err.message
        : "Something went wrong on CreatorFlo's side. Try again in a moment.";
    if (!(err instanceof ToolError)) console.error("[mcp] tool failed", err);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

const expected = z
  .string()
  .optional()
  .describe(
    "The card's updated_at from when you read it. If the card has changed since, nothing is written."
  );

/**
 * One server per request (stateless): its tools are bound to the signed-in
 * user's context, so nothing can leak between users.
 */
export function buildServer(ctx: McpContext): McpServer {
  const server = new McpServer(
    { name: "CreatorFlo", version: "1.0.0" },
    {
      instructions:
        "CreatorFlo is a content planner. Boards (profiles) hold pipelines of steps; cards move through the steps and hold boxes (Goal of Video, Title Ideas, Outline, Script, …) written in Markdown. Start with list_boards. Before changing a box, read the card with get_card and pass its updated_at as expected_updated_at so a teammate's newer edit is never overwritten.",
    }
  );

  server.registerTool(
    "list_boards",
    {
      title: "List boards",
      description:
        "The CreatorFlo boards (profiles) you can access, your role on each (owner, editor or viewer), and each board's pipelines with their steps in order.",
      inputSchema: {},
      annotations: READ,
    },
    () =>
      run(async () =>
        (await listBoards(ctx)).map((b) => ({
          id: b.id,
          name: b.name,
          role: b.role,
          pipelines: b.pipelines.map((p) => ({
            id: p.id,
            name: p.name,
            format: p.format,
            steps: p.stages.map((s) => s.name),
          })),
        }))
      )
  );

  server.registerTool(
    "list_cards",
    {
      title: "List cards",
      description:
        "Cards on a board: id, title, pipeline, status (step), assignees, posting date and updated_at. Filter by pipeline, status (step name or id) and a title search.",
      inputSchema: {
        board: z.string().describe("Board name or id, from list_boards."),
        pipeline: z.string().optional().describe("Pipeline name or id."),
        status: z.string().optional().describe("Step name or id, e.g. \"Scripting\"."),
        search: z.string().optional().describe("Text the title contains."),
      },
      annotations: READ,
    },
    (args) => run(() => listCards(ctx, args))
  );

  server.registerTool(
    "get_card",
    {
      title: "Get card",
      description:
        "One card in full: its details and every box as Markdown, with each box's phase (plan, script, review or post) and the card's updated_at.",
      inputSchema: { card_id: z.string().describe("The card's id, from list_cards.") },
      annotations: READ,
    },
    ({ card_id }) => run(() => getCard(ctx, card_id))
  );

  server.registerTool(
    "get_outline_chapters",
    {
      title: "Get outline chapters",
      description:
        "Parses a card's Outline box into its chapters: each entry's kind (section, step, phase, or sub for ▸ chapters without a card), name, planned start and range, and the step it belongs to; plus the ordered Chapters block with planned times.",
      inputSchema: { card_id: z.string().describe("The card's id.") },
      annotations: READ,
    },
    ({ card_id }) => run(() => getOutlineChapters(ctx, card_id))
  );

  server.registerTool(
    "update_box",
    {
      title: "Update a box",
      description:
        "Writes one box on a card, in Markdown (lists nest with a tab or two spaces; ``` fences become code blocks). Modes: fill_if_empty (default; refuses if the box already has content), append, or replace. Refuses if the card changed since expected_updated_at. Viewers can't write.",
      inputSchema: {
        card_id: z.string(),
        box: z.string().describe("The box's title, e.g. \"Outline\" or \"Title Ideas\"."),
        content: z.string().describe("The new content, in Markdown."),
        mode: z.enum(["replace", "append", "fill_if_empty"]).default("fill_if_empty"),
        expected_updated_at: expected,
      },
      annotations: { ...WRITE, idempotentHint: false },
    },
    (args) => run(() => updateBox(ctx, { ...args, mode: args.mode ?? "fill_if_empty" }))
  );

  server.registerTool(
    "create_card",
    {
      title: "Create a card",
      description:
        "Adds a new card to a board's pipeline, with that pipeline's box template. Optionally fills boxes (box title → Markdown). Starts in the first step unless a status is given.",
      inputSchema: {
        board: z.string().describe("Board name or id."),
        pipeline: z.string().describe("Pipeline name or id, e.g. \"Long Form\"."),
        title: z.string().min(1),
        status: z.string().optional().describe("Step name or id."),
        boxes: z
          .record(z.string(), z.string())
          .optional()
          .describe("Box title → Markdown, e.g. {\"Outline\": \"**Intro** (0:00–1:00)\"}."),
      },
      annotations: { ...WRITE, idempotentHint: false },
    },
    (args) => run(() => createCard(ctx, args))
  );

  server.registerTool(
    "move_card",
    {
      title: "Move a card",
      description: "Moves a card to another step of its pipeline (e.g. from Scripting to Filming).",
      inputSchema: {
        card_id: z.string(),
        status: z.string().describe("Step name or id."),
        expected_updated_at: expected,
      },
      annotations: { ...WRITE, idempotentHint: true },
    },
    (args) => run(() => moveCard(ctx, args))
  );

  return server;
}
