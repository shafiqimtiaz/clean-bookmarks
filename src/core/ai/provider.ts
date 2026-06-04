// Runtime layer for pi-ai. The picker UI uses the slim registry in
// providers.ts; this file turns a Settings into a runtime Model + Context
// and dispatches to the right provider module via dynamic import.
//
// Each provider module (anthropic, openai-completions, google, etc.)
// self-contains its SDK. We lazy-import by `model.api` so unused SDKs
// never land in the extension bundle.

import type { Model, Context, AssistantMessage } from "@earendil-works/pi-ai";
import { getModel } from "../providers";
import type { Settings } from "../types";

export function buildModel(settings: Settings): Model<string> {
  const userBaseUrl = settings.baseUrl?.replace(/\/$/, "");
  const slim = getModel(settings.provider, settings.model);
  if (!slim) {
    throw new Error(
      `Unknown model: ${settings.provider}/${settings.model}. ` +
        `Pick a model from Settings or run "npm run sync-models".`,
    );
  }
  return {
    id: slim.id,
    name: slim.name,
    api: slim.api as Model<string>["api"],
    provider: slim.provider,
    baseUrl: userBaseUrl || slim.baseUrl,
    reasoning: slim.reasoning,
    input: slim.input as ("text" | "image")[],
    cost: {
      input: slim.cost.in,
      output: slim.cost.out,
      cacheRead: slim.cost.cacheRead,
      cacheWrite: slim.cost.cacheWrite,
    },
    contextWindow: slim.contextWindow,
    maxTokens: slim.maxTokens,
  };
}

// Provider module loader keyed by model.api. Returns the streaming function
// and the matching complete helper. We dynamic-import so unused SDKs
// (e.g. @anthropic-ai/sdk when the user picked OpenAI) are never bundled.
type StreamFn = (
  model: Model<string>,
  context: Context,
  options: Record<string, unknown>,
) => AsyncIterable<unknown> & { result: () => Promise<AssistantMessage> };

async function getStreamFn(api: string): Promise<StreamFn> {
  switch (api) {
    case "openai-completions": {
      const m = await import("@earendil-works/pi-ai/openai-completions");
      return m.streamOpenAICompletions as unknown as StreamFn;
    }
    case "openai-responses": {
      const m = await import("@earendil-works/pi-ai/openai-responses");
      return m.streamOpenAIResponses as unknown as StreamFn;
    }
    case "anthropic-messages": {
      const m = await import("@earendil-works/pi-ai/anthropic");
      return m.streamAnthropic as unknown as StreamFn;
    }
    case "google-generative-ai": {
      const m = await import("@earendil-works/pi-ai/google");
      return m.streamGoogle as unknown as StreamFn;
    }
    case "mistral-conversations": {
      const m = await import("@earendil-works/pi-ai/mistral");
      return m.streamMistral as unknown as StreamFn;
    }
    default:
      throw new Error(
        `Provider API "${api}" is not supported in the browser runtime. ` +
          `Pick a different model in Settings.`,
      );
  }
}

export interface CompleteOptions {
  signal?: AbortSignal;
  tools?: Context["tools"];
  // Forwarded to the provider as the `maxTokens` (or provider equivalent).
  maxTokens?: number;
}

// One-shot complete: stream the response, return the final AssistantMessage.
// Throws on error or abort. Does not parse — callers handle content blocks.
export async function complete(
  settings: Settings,
  context: Context,
  options: CompleteOptions = {},
): Promise<AssistantMessage> {
  const model = buildModel(settings);
  const streamFn = await getStreamFn(model.api as string);
  const stream = streamFn(model, context, {
    apiKey: settings.apiKey,
    signal: options.signal,
    maxTokens: options.maxTokens,
    tools: options.tools,
  } as Record<string, unknown>) as AsyncIterable<unknown> & {
    result: () => Promise<AssistantMessage>;
  };
  // Drain the stream so result() resolves, then return.
  for await (const _event of stream) {
    // events are observed; we just need the final message
  }
  return await stream.result();
}
