/**
 * HTTP route handlers for the proxy server.
 *
 * Handles:
 *   POST /v1/messages              — Streaming messages (main endpoint)
 *   POST /v1/messages/count_tokens — Token counting
 *   GET  /health                   — Health check
 *   GET  /                         — Status
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProviderName } from "../config.js";
import { type NimConfig } from "../providers/nim.js";
export interface RouteContext {
    provider: ProviderName;
    model: string;
    apiKey: string | null;
    authToken?: string;
    ollamaBaseUrl?: string;
    openrouterSiteUrl?: string;
    openrouterSiteName?: string;
    detector?: import("../observer/eventDetector.js").EventDetector;
    nimConfig?: NimConfig;
}
export declare function handleRequest(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void>;
