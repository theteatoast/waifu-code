/**
 * Shared types for the provider layer.
 */

/** Content type enum for parsed content chunks. */
export enum ContentType {
  TEXT = "text",
  THINKING = "thinking",
}

/** A chunk of parsed content from the think tag parser. */
export interface ContentChunk {
  type: ContentType;
  content: string;
}

/** State for a single streaming tool call. */
export interface ToolCallState {
  blockIndex: number; // -1 if not yet allocated
  toolId: string;
  name: string;
  contents: string[];
  started: boolean;
  taskArgBuffer: string;
  taskArgsEmitted: boolean;
}

/** OpenAI-compatible chat completion chunk (subset of fields we use). */
export interface ChatCompletionChunk {
  id: string;
  object: string;
  choices: ChatCompletionChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface ChatCompletionChoice {
  index: number;
  delta: ChatCompletionDelta;
  finish_reason: string | null;
}

export interface ChatCompletionDelta {
  role?: string;
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: ToolCallDelta[];
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function: {
    name?: string;
    arguments?: string;
  };
}

/** OpenAI stop_reason → Anthropic stop_reason mapping. */
export const STOP_REASON_MAP: Record<string, string> = {
  stop: "end_turn",
  length: "max_tokens",
  tool_calls: "tool_use",
  content_filter: "end_turn",
};

export function mapStopReason(openaiReason: string | null | undefined): string {
  return openaiReason ? STOP_REASON_MAP[openaiReason] ?? "end_turn" : "end_turn";
}
