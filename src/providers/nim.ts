/**
 * NVIDIA NIM provider.
 *
 * Thin wrapper around the shared base provider, configured for
 * NVIDIA's integrate.api.nvidia.com endpoint.
 *
 * Get a free key at: https://build.nvidia.com/settings/api-keys
 */

import { streamProviderResponse, type ProviderConfig } from "./base.js";
import type { EventDetector } from "../observer/eventDetector.js";

export const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const DEFAULT_MODEL = "moonshotai/kimi-k2-thinking";
export const DEFAULT_MAX_TOKENS = 81920;

export interface NimConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  baseUrl?: string;
}

export async function* streamNimResponse(
  requestData: unknown,
  config: NimConfig,
  inputTokens: number,
  requestId?: string,
  detector?: EventDetector
): AsyncGenerator<string> {
  const cfg: ProviderConfig = {
    name: "NIM",
    baseUrl: config.baseUrl ?? NVIDIA_NIM_BASE_URL,
    apiKey: config.apiKey,
    model: config.model ?? DEFAULT_MODEL,
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: config.temperature,
    topP: config.topP,
  };

  yield* streamProviderResponse(requestData, cfg, inputTokens, requestId, detector);
}
