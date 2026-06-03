import { z } from "zod";

// Zod schemas drive AI SDK structured output (Output.object): the SDK builds
// the provider JSON schema, validates the response, and retries on mismatch.

export const taxonomySchema = z.object({
  categories: z.array(
    z.object({
      name: z.string(),
      children: z.array(z.string()),
    }),
  ),
});

export const assignmentsSchema = z.object({
  assignments: z.array(
    z.object({
      idx: z.number().int(),
      cat: z.string(),
      sub: z.string().nullable(),
    }),
  ),
});

// Plain-text shape hints injected into the prompt. Reasoning models (e.g.
// MiniMax-M2.7) ignore json_object mode and emit prose, so we instruct the
// exact JSON shape and parse tolerantly instead of relying on the provider.
export const TAXONOMY_HINT =
  '{ "categories": [ { "name": "string", "children": ["string"] } ] }';

export const ASSIGNMENTS_HINT =
  '{ "assignments": [ { "idx": 0, "cat": "string", "sub": "string or null" } ] }';
