/**
 * HTTP route handlers for the proxy server.
 *
 * Handles:
 *   POST /v1/messages          — Streaming messages (main endpoint)
 *   POST /v1/messages/count_tokens — Token counting
 *   GET  /health               — Health check
 *   GET  /                     — Status
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { type NimConfig } from "../providers/nim.js";
export interface RouteContext {
    nimConfig: NimConfig;
    authToken?: string;
    model: string;
    detector?: import("../observer/eventDetector.js").EventDetector;
}
/**
 * Main request router. Called for every incoming HTTP request.
 */
export declare function handleRequest(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void>;
