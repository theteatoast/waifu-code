/**
 * Heuristic tool call parser.
 *
 * Detects raw text tool calls in the format:
 *   ● <function=Name><parameter=key>value</parameter>...
 *
 * Also strips leaked control tokens like <|tool_call_end|>.
 * Port of Python HeuristicToolParser from the proxy server.
 */
export interface DetectedToolCall {
    type: "tool_use";
    id: string;
    name: string;
    input: Record<string, string>;
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
     * Feed text into the parser.
     * Returns [filteredText, detectedToolCalls].
     */
    feed(text: string): [string, DetectedToolCall[]];
    /** Flush any remaining tool calls in the buffer. */
    flush(): DetectedToolCall[];
}
