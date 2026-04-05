/**
 * Auth middleware for the proxy server.
 *
 * Validates API key in x-api-key header or Authorization Bearer token
 * against the configured internal auth token.
 */
import type { IncomingMessage } from "node:http";
/**
 * Validate the request's auth credentials against the expected token.
 * Returns null if valid, or an error message string if invalid.
 * If no token is configured, all requests are allowed.
 */
export declare function validateAuth(req: IncomingMessage, expectedToken: string | undefined): string | null;
