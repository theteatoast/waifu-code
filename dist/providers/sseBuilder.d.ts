/**
 * SSE event builder for Anthropic-format streaming responses.
 *
 * Generates properly formatted Server-Sent Events that match the
 * Anthropic Messages API streaming protocol.
 * Port of Python SSEBuilder from the proxy server.
 */
import { ToolCallState } from "./types.js";
/** Manages content block indices and state. */
declare class ContentBlockManager {
    nextIndex: number;
    thinkingIndex: number;
    textIndex: number;
    thinkingStarted: boolean;
    textStarted: boolean;
    toolStates: Map<number, ToolCallState>;
    allocateIndex(): number;
    registerToolName(index: number, name: string): void;
    bufferTaskArgs(index: number, args: string): any | null;
    flushTaskArgBuffers(): Array<[number, string]>;
}
export declare class SSEBuilder {
    readonly messageId: string;
    readonly model: string;
    readonly inputTokens: number;
    readonly blocks: ContentBlockManager;
    private accumulatedTextParts;
    private accumulatedReasoningParts;
    constructor(messageId: string, model: string, inputTokens?: number);
    private formatEvent;
    messageStart(): string;
    messageDelta(stopReason: string, outputTokens: number): string;
    messageStop(): string;
    contentBlockStart(index: number, blockType: string, extra?: any): string;
    contentBlockDelta(index: number, deltaType: string, content: string): string;
    contentBlockStop(index: number): string;
    startThinkingBlock(): string;
    emitThinkingDelta(content: string): string;
    stopThinkingBlock(): string;
    startTextBlock(): string;
    emitTextDelta(content: string): string;
    stopTextBlock(): string;
    startToolBlock(toolIndex: number, toolId: string, name: string): string;
    emitToolDelta(toolIndex: number, partialJson: string): string;
    stopToolBlock(toolIndex: number): string;
    ensureThinkingBlock(): Generator<string>;
    ensureTextBlock(): Generator<string>;
    closeContentBlocks(): Generator<string>;
    closeAllBlocks(): Generator<string>;
    emitError(errorMessage: string): Generator<string>;
    estimateOutputTokens(): number;
}
export {};
