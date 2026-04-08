/**
 * Groq provider.
 *
 * Groq runs open-source models (Llama, Mixtral, Gemma) on custom LPU hardware
 * with very low latency. Free tier available.
 *
 * Get a free API key at: https://console.groq.com/keys
 */

import { streamProviderResponse, type ProviderConfig } from "./base.js";
import type { EventDetector } from "../observer/eventDetector.js";

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";

export interface GroqConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export async function* streamGroqResponse(
  requestData: unknown,
  config: GroqConfig,
  inputTokens: number,
  requestId?: string,
  detector?: EventDetector
): AsyncGenerator<string> {
  const cfg: ProviderConfig = {
    name: "Groq",
    baseUrl: GROQ_BASE_URL,
    apiKey: config.apiKey,
    model: config.model ?? GROQ_DEFAULT_MODEL,
    // Groq enforces its own max_tokens per model — keep a safe default
    maxTokens: config.maxTokens ?? 8192,
    temperature: 0.6,
  };

  yield* streamProviderResponse(requestData, cfg, inputTokens, requestId, detector);
}
