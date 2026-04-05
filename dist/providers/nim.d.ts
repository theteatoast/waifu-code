/**
 * NVIDIA NIM provider — sends requests to NVIDIA NIM API.
 *
 * Converts Anthropic-format requests to OpenAI chat completions format,
 * sends them to NIM, and streams back responses as Anthropic SSE events.
 * Port of Python NvidiaNimProvider + OpenAICompatibleProvider from proxy server.
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
/**
 * Stream a response from NVIDIA NIM and yield Anthropic-format SSE events.
 */
export declare function streamNimResponse(requestData: any, config: NimConfig, inputTokens: number, requestId?: string, detector?: EventDetector): AsyncGenerator<string>;
