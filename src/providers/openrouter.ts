/**
 * OpenRouter provider.
 *
 * OpenRouter proxies hundreds of models (Claude, GPT-4o, Gemini, Llama, etc.)
 * behind a single OpenAI-compatible endpoint.
 *
 * Get a free API key at: https://openrouter.ai/keys
 */

import { streamProviderResponse, type ProviderConfig } from "./base.js";
import type { EventDetector } from "../observer/eventDetector.js";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_DEFAULT_MODEL = "deepseek/deepseek-r1-0528";

export interface OpenRouterConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  /** Optional: shown in openrouter.ai usage dashboard */
  siteUrl?: string;
  /** Optional: shown in openrouter.ai usage dashboard */
  siteName?: string;
}

export async function* streamOpenRouterResponse(
  requestData: unknown,
  config: OpenRouterConfig,
  inputTokens: number,
  requestId?: string,
  detector?: EventDetector
): AsyncGenerator<string> {
  const extraHeaders: Record<string, string> = {};
  if (config.siteUrl) extraHeaders["HTTP-Referer"] = config.siteUrl;
  if (config.siteName) extraHeaders["X-Title"] = config.siteName;

  const cfg: ProviderConfig = {
    name: "OpenRouter",
    baseUrl: OPENROUTER_BASE_URL,
    apiKey: config.apiKey,
    model: config.model ?? OPENROUTER_DEFAULT_MODEL,
    maxTokens: config.maxTokens,
    extraHeaders,
  };

  yield* streamProviderResponse(requestData, cfg, inputTokens, requestId, detector);
}
