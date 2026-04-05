/**
 * TypeScript types for Anthropic-compatible requests and responses.
 *
 * These mirror the Anthropic Messages API format that claude-code uses.
 */
export interface ContentBlockText {
    type: "text";
    text: string;
}
export interface ContentBlockImage {
    type: "image";
    source: Record<string, any>;
}
export interface ContentBlockToolUse {
    type: "tool_use";
    id: string;
    name: string;
    input: Record<string, any>;
}
export interface ContentBlockToolResult {
    type: "tool_result";
    tool_use_id: string;
    content: string | any[] | Record<string, any>;
}
export interface ContentBlockThinking {
    type: "thinking";
    thinking: string;
}
export type ContentBlock = ContentBlockText | ContentBlockImage | ContentBlockToolUse | ContentBlockToolResult | ContentBlockThinking;
export interface Message {
    role: "user" | "assistant";
    content: string | ContentBlock[];
}
export interface Tool {
    name: string;
    description?: string | null;
    input_schema: Record<string, any>;
}
export interface SystemContent {
    type: "text";
    text: string;
}
export interface MessagesRequest {
    model: string;
    max_tokens?: number | null;
    messages: Message[];
    system?: string | SystemContent[] | null;
    stop_sequences?: string[] | null;
    stream?: boolean | null;
    temperature?: number | null;
    top_p?: number | null;
    top_k?: number | null;
    metadata?: Record<string, any> | null;
    tools?: Tool[] | null;
    tool_choice?: Record<string, any> | null;
    thinking?: {
        enabled?: boolean;
    } | null;
    extra_body?: Record<string, any> | null;
}
export interface TokenCountRequest {
    model: string;
    messages: Message[];
    system?: string | SystemContent[] | null;
    tools?: Tool[] | null;
    thinking?: {
        enabled?: boolean;
    } | null;
    tool_choice?: Record<string, any> | null;
}
export interface Usage {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
}
export interface MessagesResponse {
    id: string;
    model: string;
    role: "assistant";
    content: any[];
    type: "message";
    stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
    stop_sequence: string | null;
    usage: Usage;
}
export interface TokenCountResponse {
    input_tokens: number;
}
