import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { Settings } from '../types';

// Builds an AI SDK model from the user's BYO OpenAI-compatible endpoint.
// Works with OpenAI, OpenRouter, local servers — anything OpenAI-shaped.
export function buildModel(settings: Settings) {
  const provider = createOpenAICompatible({
    name: 'byok',
    baseURL: settings.baseUrl.replace(/\/$/, ''),
    apiKey: settings.apiKey,
  });
  return provider(settings.model);
}
