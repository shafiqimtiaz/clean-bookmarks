import { z } from "zod";
import { Type, type Tool } from "@earendil-works/pi-ai";

// MV3 CSP bans `new Function`; disable Zod's JIT to avoid its eval probe.
z.config({ jitless: true });

// Zod validates pass-2 JSON text; pass-1 uses TypeBox tool args.
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

// Shape hint for pass-2's "return JSON" prompt; parsed tolerantly.
export const TAXONOMY_HINT =
  '{ "categories": [ { "name": "string", "children": ["string"] } ] }';

export const ASSIGNMENTS_HINT =
  '{ "assignments": [ { "idx": 0, "cat": "string", "sub": "string or null", "title": "Clean, precise bookmark name without ambiguity" } ] }';

// Pass-1 tool: model returns structured args, validated by TypeBox.
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
