/**
 * Simple token counter for API requests.
 *
 * Uses character-based estimation (chars/4) since we don't want
 * to bundle tiktoken's native WASM module as a dependency.
 */
import type { Message, Tool, SystemContent } from "./types.js";
/**
 * Estimate token count for a request.
 * Uses simple char/4 heuristic (no tiktoken dependency).
 */
export declare function getTokenCount(messages: Message[], system?: string | SystemContent[] | null, tools?: Tool[] | null): number;
