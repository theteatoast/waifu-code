/**
 * Request type detection utilities for API optimizations.
 *
 * Detects quota checks, title generation, prefix detection,
 * suggestion mode, and filepath extraction requests.
 * Port of Python detection.py from the proxy server.
 */
import type { MessagesRequest } from "./types.js";
export declare function isQuotaCheckRequest(requestData: MessagesRequest): boolean;
export declare function isTitleGenerationRequest(requestData: MessagesRequest): boolean;
export declare function isPrefixDetectionRequest(requestData: MessagesRequest): [boolean, string];
export declare function isSuggestionModeRequest(requestData: MessagesRequest): boolean;
export declare function isFilepathExtractionRequest(requestData: MessagesRequest): [boolean, string, string];
