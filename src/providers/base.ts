/**
 * Base provider — shared streaming logic for all OpenAI-compatible providers.
 *
 * NIM, OpenRouter, Groq, and Ollama all speak the OpenAI chat completions
 * format. This module contains the single implementation; each provider just
 * supplies its own URL, auth header, and defaults.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { randomUUID } from "node:crypto";
import { buildBaseRequestBody } from "./converter.js";
import { SSEBuilder } from "./sseBuilder.js";
import { ThinkTagParser } from "./thinkParser.js";
import { HeuristicToolParser } from "./toolParser.js";
import {
  ContentType,
  type ChatCompletionChunk,
  mapStopReason,
} from "./types.js";
import type { EventDetector } from "../observer/eventDetector.js";

// ── Provider descriptor ───────────────────────────────────────────────────────

export interface ProviderConfig {
  /** Human-readable name shown in logs and status output. */
  name: string;
  /** Base URL for the /chat/completions endpoint (no trailing slash). */
  baseUrl: string;
  /** API key sent as a Bearer token, or null for unauthenticated providers. */
  apiKey: string | null;
  /** Model to use. */
  model: string;
  /** Max tokens cap. */
  maxTokens?: number;
  /** Default temperature (provider-specific). */
  temperature?: number;
  /** Default top_p. */
  topP?: number;
  /** Extra headers to merge into every request (e.g. HTTP-Referer for OpenRouter). */
  extraHeaders?: Record<string, string>;
}

// ── Request body builder ──────────────────────────────────────────────────────

function buildProviderRequestBody(requestData: any, cfg: ProviderConfig): any {
  const body = buildBaseRequestBody(requestData);

  body.model = cfg.model;

  const maxTokens = cfg.maxTokens ?? 81920;
  body.max_tokens =
    body.max_tokens == null
      ? maxTokens
      : Math.min(body.max_tokens, maxTokens);

  body.temperature ??= cfg.temperature ?? 1.0;
  body.top_p ??= cfg.topP ?? 1.0;

  if (body.tools && body.tools.length > 0) {
    body.parallel_tool_calls = true;
  }

  return body;
}

// ── Tool call processor ───────────────────────────────────────────────────────

function processToolCall(
  tc: { index: number; id?: string; function: { name?: string; arguments?: string } },
  sse: SSEBuilder
): string[] {
  const events: string[] = [];
  const tcIndex = tc.index < 0 ? sse.blocks.toolStates.size : tc.index;

  const fnDelta = tc.function ?? {};
  if (fnDelta.name != null) {
    sse.blocks.registerToolName(tcIndex, fnDelta.name);
  }

  const state = sse.blocks.toolStates.get(tcIndex);
  if (!state || !state.started) {
    const name = state?.name ?? "";
    if (name || tc.id) {
      const toolId = tc.id ?? `tool_${randomUUID()}`;
      events.push(sse.startToolBlock(tcIndex, toolId, name));
    }
  }

  const args = fnDelta.arguments ?? "";
  if (args) {
    let currentState = sse.blocks.toolStates.get(tcIndex);
    if (!currentState || !currentState.started) {
      const toolId = tc.id ?? `tool_${randomUUID()}`;
      const name = currentState?.name ?? "tool_call";
      events.push(sse.startToolBlock(tcIndex, toolId, name));
      currentState = sse.blocks.toolStates.get(tcIndex);
    }

    const currentName = currentState?.name ?? "";
    if (currentName === "Task") {
      const parsed = sse.blocks.bufferTaskArgs(tcIndex, args);
      if (parsed != null) {
        events.push(sse.emitToolDelta(tcIndex, JSON.stringify(parsed)));
      }
      return events;
    }

    events.push(sse.emitToolDelta(tcIndex, args));
  }

  return events;
}

// ── SSE line parser ───────────────────────────────────────────────────────────

function parseSSELine(line: string): ChatCompletionChunk | null {
  if (!line.startsWith("data: ")) return null;
  const data = line.slice(6).trim();
  if (data === "[DONE]") return null;
  try {
    return JSON.parse(data) as ChatCompletionChunk;
  } catch {
    return null;
  }
}

// ── Core streaming function ───────────────────────────────────────────────────

/**
 * Stream a response from any OpenAI-compatible provider and yield
 * Anthropic-format SSE events.
 */
export async function* streamProviderResponse(
  requestData: any,
  cfg: ProviderConfig,
  inputTokens: number,
  requestId?: string,
  detector?: EventDetector
): AsyncGenerator<string> {
  const messageId = `msg_${randomUUID()}`;
  const sse = new SSEBuilder(messageId, requestData.model, inputTokens);
  const body = buildProviderRequestBody(requestData, cfg);

  yield sse.messageStart();

  const thinkParser = new ThinkTagParser();
  const heuristicParser = new HeuristicToolParser();

  let finishReason: string | null = null;
  let usageInfo: any = null;
  let errorOccurred = false;
  let permissionActive = false;

  // Build auth header — skip entirely for Ollama (no key needed)
  const authHeaders: Record<string, string> =
    cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {};

  try {
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...authHeaders,
        ...(cfg.extraHeaders ?? {}),
      },
      body: JSON.stringify({ ...body, stream: true }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `${cfg.name} API error ${response.status}: ${errText.slice(0, 500)}`
      );
    }

    if (!response.body) {
      throw new Error(`${cfg.name} returned no response body`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (process.env.WAIFU_VERBOSE) console.log(`[${cfg.name}_RAW]`, trimmed);

        const chunk = parseSSELine(trimmed);
        if (!chunk) continue;

        if (chunk.usage) {
          usageInfo = chunk.usage;
        }

        if (!chunk.choices || chunk.choices.length === 0) continue;

        const choice = chunk.choices[0]!;
        const delta = choice.delta;
        if (!delta) continue;

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        // reasoning_content (extended OpenAI format used by some models)
        if (delta.reasoning_content) {
          if (permissionActive) {
            detector?.onPermissionEnd();
            permissionActive = false;
          }
          detector?.onThinking();
          for (const ev of sse.ensureThinkingBlock()) yield ev;
          yield sse.emitThinkingDelta(delta.reasoning_content);
        }

        // text content
        if (delta.content) {
          for (const part of thinkParser.feed(delta.content)) {
            if (part.type === ContentType.THINKING) {
                if (permissionActive) {
                  detector?.onPermissionEnd();
                  permissionActive = false;
                }
              detector?.onThinking();
              for (const ev of sse.ensureThinkingBlock()) yield ev;
              yield sse.emitThinkingDelta(part.content);
            } else {
              const [filteredText, detectedTools] = heuristicParser.feed(
                part.content
              );

              if (filteredText) {
                  if (permissionActive) {
                    detector?.onPermissionEnd();
                    permissionActive = false;
                  }
                for (const ev of sse.ensureTextBlock()) yield ev;
                yield sse.emitTextDelta(filteredText);
              }

              for (const toolUse of detectedTools) {
                  if (!permissionActive) {
                    detector?.onPermissionStart();
                    permissionActive = true;
                  }
                for (const ev of sse.closeContentBlocks()) yield ev;
                const blockIdx = sse.blocks.allocateIndex();
                if (toolUse.name === "Task" && typeof toolUse.input === "object") {
                  (toolUse.input as any).run_in_background = false;
                }
                yield sse.contentBlockStart(blockIdx, "tool_use", {
                  id: toolUse.id,
                  name: toolUse.name,
                });
                yield sse.contentBlockDelta(
                  blockIdx,
                  "input_json_delta",
                  JSON.stringify(toolUse.input)
                );
                yield sse.contentBlockStop(blockIdx);
              }
            }
          }
        }

        // native tool calls
        if (delta.tool_calls) {
          if (!permissionActive) {
            detector?.onPermissionStart();
            permissionActive = true;
          }
          for (const ev of sse.closeContentBlocks()) yield ev;
          for (const tc of delta.tool_calls) {
            for (const ev of processToolCall(
              {
                index: tc.index,
                id: tc.id,
                function: {
                  name: tc.function?.name,
                  arguments: tc.function?.arguments,
                },
              },
              sse
            )) {
              yield ev;
            }
          }
        }
      }
    }
  } catch (err: any) {
    errorOccurred = true;
    const errorMsg = err.message ?? `${cfg.name} provider request failed`;
    const fullMsg = requestId
      ? `${errorMsg} (request_id=${requestId})`
      : errorMsg;

    for (const ev of sse.closeContentBlocks()) yield ev;
    for (const ev of sse.emitError(fullMsg)) yield ev;
  }

  // Flush remaining think content
  const remaining = thinkParser.flush();
  if (remaining) {
    if (remaining.type === ContentType.THINKING) {
      if (permissionActive) {
        detector?.onPermissionEnd();
        permissionActive = false;
      }
      for (const ev of sse.ensureThinkingBlock()) yield ev;
      yield sse.emitThinkingDelta(remaining.content);
    } else {
      if (permissionActive) {
        detector?.onPermissionEnd();
        permissionActive = false;
      }
      for (const ev of sse.ensureTextBlock()) yield ev;
      yield sse.emitTextDelta(remaining.content);
    }
  }

  // Flush heuristic tool calls
  for (const toolUse of heuristicParser.flush()) {
    if (!permissionActive) {
      detector?.onPermissionStart();
      permissionActive = true;
    }
    for (const ev of sse.closeContentBlocks()) yield ev;
    const blockIdx = sse.blocks.allocateIndex();
    if (toolUse.name === "Task" && typeof toolUse.input === "object") {
      (toolUse.input as any).run_in_background = false;
    }
    yield sse.contentBlockStart(blockIdx, "tool_use", {
      id: toolUse.id,
      name: toolUse.name,
    });
    yield sse.contentBlockDelta(
      blockIdx,
      "input_json_delta",
      JSON.stringify(toolUse.input)
    );
    yield sse.contentBlockStop(blockIdx);
  }

  // Ensure at least one text block
  if (
    !errorOccurred &&
    sse.blocks.textIndex === -1 &&
    sse.blocks.toolStates.size === 0
  ) {
    for (const ev of sse.ensureTextBlock()) yield ev;
    yield sse.emitTextDelta(" ");
  }

  // Flush Task arg buffers
  for (const [toolIndex, out] of sse.blocks.flushTaskArgBuffers()) {
    yield sse.emitToolDelta(toolIndex, out);
  }

  // Close all open blocks
  for (const ev of sse.closeAllBlocks()) yield ev;

  // Final message events
  const outputTokens =
    usageInfo?.completion_tokens ?? sse.estimateOutputTokens();
  yield sse.messageDelta(mapStopReason(finishReason), outputTokens);
  yield sse.messageStop();
}
