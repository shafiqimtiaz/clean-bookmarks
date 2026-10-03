import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { proposeTaxonomy } from "./pass1-taxonomy";
import { taxonomyTool } from "./schema";
import type { Settings } from "../types";

const originalLanguageModel = Object.getOwnPropertyDescriptor(
  globalThis,
  "LanguageModel",
);

afterEach(() => {
  if (originalLanguageModel) {
    Object.defineProperty(globalThis, "LanguageModel", originalLanguageModel);
  } else {
    Reflect.deleteProperty(globalThis, "LanguageModel");
  }
});

test("browser taxonomy generation constrains the response to valid JSON", async () => {
  let promptOptions: { responseConstraint?: object } | undefined;
  globalThis.LanguageModel = {
    availability: async () => "available",
    create: async () => ({
      inputUsage: 10,
      outputUsage: 5,
      inputQuota: 1_000,
      prompt: async (
        _input: string,
        options?: { responseConstraint?: object },
      ) => {
        promptOptions = options;
        return (
          options?.responseConstraint
            ? '{"categories":[{"name":"development","children":[]}]}'
            : "I suggest a development category."
        );
      },
      promptStreaming: () => new ReadableStream<string>(),
      clone: async () => {
        throw new Error("not used");
      },
      destroy: () => {},
    }),
  };

  const settings: Settings = {
    provider: "chrome-ai",
    model: "gemini-nano",
    apiKey: "",
    apiKeys: {},
    baseUrl: "",
    seedCategories: [],
    taxonomyPrompt: "",
    consentAt: null,
    lastCleanupAt: null,
    excludedFolders: [],
  };

  const result = await proposeTaxonomy(
    settings,
    [
      {
        idx: 0,
        id: "bookmark-1",
        title: "TypeScript handbook",
        url: "https://www.typescriptlang.org/docs/",
        root: "1",
      },
    ],
    [],
  );

  assert.deepEqual(result.taxonomy, [
    { name: "development", children: [] },
  ]);
  assert.deepEqual(promptOptions?.responseConstraint, taxonomyTool.parameters);
});
