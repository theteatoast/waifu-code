/**
 * Heuristic tool call parser.
 *
 * Detects two formats of raw-text tool calls that local models emit
 * instead of using the OpenAI native tool_calls field:
 *
 * FORMAT 1 — bullet+XML (used by some fine-tuned models):
 *   ● <function=Name><parameter=key>value</parameter>...
 *
 * FORMAT 2 — plain JSON object (used by Ollama qwen/mistral/etc):
 *   { "name": "ToolName", "arguments": { "key": "value" } }
 *   or
 *   { "name": "ToolName", "parameters": { "key": "value" } }
 *
 * Also strips leaked control tokens like <|tool_call_end|>.
 */
export interface DetectedToolCall {
    type: "tool_use";
    id: string;
    name: string;
    input: Record<string, unknown>;
}
export declare class HeuristicToolParser {
    private state;
    private buffer;
    private currentToolId;
    private currentFunctionName;
    private currentParameters;
    private stripControlTokens;
    private splitIncompleteControlTokenTail;
    /**
     * Try to detect a plain-JSON tool call in the buffer.
     * Returns the tool call and advances the buffer past it, or null.
     *
     * We wait until we see a closing `}` that makes the outer object
     * complete before committing, so we never cut off mid-stream.
     */
    private tryParseJsonToolCall;
    /**
     * Feed text into the parser.
     * Returns [filteredText, detectedToolCalls].
     */
    feed(text: string): [string, DetectedToolCall[]];
    /** Flush any remaining tool calls in the buffer. */
    flush(): DetectedToolCall[];
}
