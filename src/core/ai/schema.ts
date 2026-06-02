import { z } from 'zod';

// Zod schemas drive AI SDK structured output (Output.object): the SDK builds
// the provider JSON schema, validates the response, and retries on mismatch.

export const taxonomySchema = z.object({
  categories: z.array(
    z.object({
      name: z.string(),
      children: z.array(z.string()),
    })
  ),
});

export const assignmentsSchema = z.object({
  assignments: z.array(
    z.object({
      idx: z.number().int(),
      cat: z.string(),
      sub: z.string().nullable(),
    })
  ),
});
