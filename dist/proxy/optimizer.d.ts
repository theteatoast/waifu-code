/**
 * Request optimization handlers for fast-path API responses.
 *
 * These intercept trivial requests (quota checks, title generation, etc.)
 * and return instant mock responses instead of routing to NIM.
 * Port of Python optimization_handlers.py from the proxy server.
 */
import type { MessagesRequest, MessagesResponse } from "./types.js";
/**
 * Run optimization handlers in order.
 * Returns a MessagesResponse if any match, or null if the request
 * should be routed to the provider.
 */
export declare function tryOptimizations(requestData: MessagesRequest): MessagesResponse | null;
