import { z } from "zod";
import { Type, type Tool } from "@earendil-works/pi-ai";

// MV3 CSP forbids `new Function`/eval. Zod v4's JIT (and the eval probe that
// detects it) trips a securitypolicyviolation that floods the extension's
// Errors page. Disable the JIT so Zod uses its interpreted parse path.
z.config({ jitless: true });

// Zod schemas are still used for parse-time validation on pass 2 (which
// returns JSON in a text block). Pass 1 returns structured args via tool
// calling and is validated by TypeBox at the tool boundary.

export const taxonomySchema = z.object({
  categories: z.array(
    z.object({
      name: z.string(),
      children: z.array(z.string()).optional(),
    }),
  ),
});

export const assignmentsSchema = z.object({
  assignments: z.array(
    z.object({
      idx: z.number().int(),
      cat: z.string(),
      sub: z.string().nullable(),
      title: z.string(),
    }),
  ),
});

// Plain-text shape hints for pass 2's "return JSON" prompt. Reasoning models
// ignore json_object mode and emit prose, so we instruct the exact JSON
// shape and parse tolerantly (see parse-json.ts).
export const TAXONOMY_HINT =
  '{ "categories": [ { "name": "string", "children": ["string"] } ] }';

export const ASSIGNMENTS_HINT =
  '{ "assignments": [ { "idx": 0, "cat": "string", "sub": "string or null", "title": "Clean, precise bookmark name without ambiguity" } ] }';

// TypeBox tool definition for pass 1. The model invokes this tool with
// structured args; pi-ai validates the args against the schema and
// surfaces them in toolCall.arguments.
export const taxonomyTool: Tool = {
  name: "propose_taxonomy",
  description:
    "Propose a taxonomy of bookmark categories grouped by topic and intent. " +
    "Each category has a lowercase single-word name (no hyphens, no articles, " +
    "never a website or domain name) and an optional list of sub-category names. " +
    "Prefer few broad categories; only add sub-categories for a clear, sizable sub-theme.",
  parameters: Type.Object({
    categories: Type.Array(
      Type.Object({
        name: Type.String(),
        children: Type.Array(Type.String()),
      }),
      { description: "Top-level categories; merged with any required seeds." },
    ),
  }),
};
