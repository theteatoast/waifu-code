/**
 * Ollama provider.
 *
 * Ollama runs open-source models locally on your machine. No API key needed.
 * Install from: https://ollama.com
 *
 * Usage:
 *   ollama pull qwen2.5-coder:7b
 *   waifu --provider ollama --model qwen2.5-coder:7b
 */

import { streamProviderResponse, type ProviderConfig } from "./base.js";
import type { EventDetector } from "../observer/eventDetector.js";

export const OLLAMA_BASE_URL = "http://localhost:11434/v1";
export const OLLAMA_DEFAULT_MODEL = "qwen2.5-coder:7b";

export interface OllamaConfig {
  model?: string;
  maxTokens?: number;
  /** Override if Ollama runs on a non-default host/port. */
  baseUrl?: string;
}

export async function* streamOllamaResponse(
  requestData: unknown,
  config: OllamaConfig,
  inputTokens: number,
  requestId?: string,
  detector?: EventDetector
): AsyncGenerator<string> {
  const cfg: ProviderConfig = {
    name: "Ollama",
    baseUrl: config.baseUrl ?? OLLAMA_BASE_URL,
    apiKey: null, // Ollama needs no auth
    model: config.model ?? OLLAMA_DEFAULT_MODEL,
    maxTokens: config.maxTokens ?? 32768,
    temperature: 0.7,
  };

  yield* streamProviderResponse(requestData, cfg, inputTokens, requestId, detector);
}
