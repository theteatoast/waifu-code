/**
 * Request optimization handlers for fast-path API responses.
 *
 * These intercept trivial requests (quota checks, title generation, etc.)
 * and return instant mock responses instead of routing to NIM.
 * Port of Python optimization_handlers.py from the proxy server.
 */

import { randomUUID } from "node:crypto";
import { extractCommandPrefix, extractFilepathsFromCommand } from "./commandUtils.js";
import {
  isQuotaCheckRequest,
  isTitleGenerationRequest,
  isPrefixDetectionRequest,
  isSuggestionModeRequest,
  isFilepathExtractionRequest,
} from "./detection.js";
import type { MessagesRequest, MessagesResponse } from "./types.js";

function makeResponse(
  model: string,
  text: string,
  inputTokens: number,
  outputTokens: number
): MessagesResponse {
  return {
    id: `msg_${randomUUID()}`,
    model,
    role: "assistant",
    content: [{ type: "text", text }],
    type: "message",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  };
}

/**
 * Run optimization handlers in order.
 * Returns a MessagesResponse if any match, or null if the request
 * should be routed to the provider.
 */
export function tryOptimizations(
  requestData: MessagesRequest
): MessagesResponse | null {
  // 1. Quota mock
  if (isQuotaCheckRequest(requestData)) {
    return makeResponse(requestData.model, "Quota check passed.", 10, 5);
  }

  // 2. Prefix detection
  const [isPrefix, command] = isPrefixDetectionRequest(requestData);
  if (isPrefix) {
    return makeResponse(requestData.model, extractCommandPrefix(command), 100, 5);
  }

  // 3. Title skip
  if (isTitleGenerationRequest(requestData)) {
    return makeResponse(requestData.model, "Conversation", 100, 5);
  }

  // 4. Suggestion skip
  if (isSuggestionModeRequest(requestData)) {
    return makeResponse(requestData.model, "", 100, 1);
  }

  // 5. Filepath extraction
  const [isFp, cmd, output] = isFilepathExtractionRequest(requestData);
  if (isFp) {
    return makeResponse(
      requestData.model,
      extractFilepathsFromCommand(cmd, output),
      100,
      10
    );
  }

  return null;
}
