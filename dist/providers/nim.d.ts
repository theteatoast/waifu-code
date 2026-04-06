/**
 * NVIDIA NIM provider.
 *
 * Thin wrapper around the shared base provider, configured for
 * NVIDIA's integrate.api.nvidia.com endpoint.
 *
 * Get a free key at: https://build.nvidia.com/settings/api-keys
 */
import type { EventDetector } from "../observer/eventDetector.js";
export declare const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
export declare const DEFAULT_MODEL = "moonshotai/kimi-k2-thinking";
export declare const DEFAULT_MAX_TOKENS = 81920;
export interface NimConfig {
    apiKey: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    baseUrl?: string;
}
export declare function streamNimResponse(requestData: unknown, config: NimConfig, inputTokens: number, requestId?: string, detector?: EventDetector): AsyncGenerator<string>;
