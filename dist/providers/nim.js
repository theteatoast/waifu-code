/**
 * NVIDIA NIM provider.
 *
 * Thin wrapper around the shared base provider, configured for
 * NVIDIA's integrate.api.nvidia.com endpoint.
 *
 * Get a free key at: https://build.nvidia.com/settings/api-keys
 */
import { streamProviderResponse } from "./base.js";
export const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const DEFAULT_MODEL = "moonshotai/kimi-k2-thinking";
export const DEFAULT_MAX_TOKENS = 81920;
export async function* streamNimResponse(requestData, config, inputTokens, requestId, detector) {
    const cfg = {
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
//# sourceMappingURL=nim.js.map