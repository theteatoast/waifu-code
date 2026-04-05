/**
 * SSE event builder for Anthropic-format streaming responses.
 *
 * Generates properly formatted Server-Sent Events that match the
 * Anthropic Messages API streaming protocol.
 * Port of Python SSEBuilder from the proxy server.
 */
/** Manages content block indices and state. */
class ContentBlockManager {
    nextIndex = 0;
    thinkingIndex = -1;
    textIndex = -1;
    thinkingStarted = false;
    textStarted = false;
    toolStates = new Map();
    allocateIndex() {
        return this.nextIndex++;
    }
    registerToolName(index, name) {
        const existing = this.toolStates.get(index);
        if (!existing) {
            this.toolStates.set(index, {
                blockIndex: -1,
                toolId: "",
                name,
                contents: [],
                started: false,
                taskArgBuffer: "",
                taskArgsEmitted: false,
            });
            return;
        }
        const prev = existing.name;
        if (!prev || name.startsWith(prev)) {
            existing.name = name;
        }
        else if (!prev.startsWith(name)) {
            existing.name = prev + name;
        }
    }
    bufferTaskArgs(index, args) {
        const state = this.toolStates.get(index);
        if (!state || state.taskArgsEmitted)
            return null;
        state.taskArgBuffer += args;
        try {
            const argsJson = JSON.parse(state.taskArgBuffer);
            if (argsJson.run_in_background !== false) {
                argsJson.run_in_background = false;
            }
            state.taskArgsEmitted = true;
            state.taskArgBuffer = "";
            return argsJson;
        }
        catch {
            return null;
        }
    }
    flushTaskArgBuffers() {
        const results = [];
        for (const [toolIndex, state] of this.toolStates.entries()) {
            if (!state.taskArgBuffer || state.taskArgsEmitted)
                continue;
            let out = "{}";
            try {
                const argsJson = JSON.parse(state.taskArgBuffer);
                if (argsJson.run_in_background !== false) {
                    argsJson.run_in_background = false;
                }
                out = JSON.stringify(argsJson);
            }
            catch {
                // Best effort
            }
            state.taskArgsEmitted = true;
            state.taskArgBuffer = "";
            results.push([toolIndex, out]);
        }
        return results;
    }
}
export class SSEBuilder {
    messageId;
    model;
    inputTokens;
    blocks;
    accumulatedTextParts = [];
    accumulatedReasoningParts = [];
    constructor(messageId, model, inputTokens = 0) {
        this.messageId = messageId;
        this.model = model;
        this.inputTokens = inputTokens;
        this.blocks = new ContentBlockManager();
    }
    formatEvent(eventType, data) {
        return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    }
    // ── Message lifecycle ──
    messageStart() {
        return this.formatEvent("message_start", {
            type: "message_start",
            message: {
                id: this.messageId,
                type: "message",
                role: "assistant",
                content: [],
                model: this.model,
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: this.inputTokens, output_tokens: 1 },
            },
        });
    }
    messageDelta(stopReason, outputTokens) {
        return this.formatEvent("message_delta", {
            type: "message_delta",
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage: {
                input_tokens: this.inputTokens,
                output_tokens: outputTokens,
            },
        });
    }
    messageStop() {
        return this.formatEvent("message_stop", { type: "message_stop" });
    }
    // ── Content block events ──
    contentBlockStart(index, blockType, extra = {}) {
        const contentBlock = { type: blockType };
        if (blockType === "thinking") {
            contentBlock.thinking = extra.thinking ?? "";
        }
        else if (blockType === "text") {
            contentBlock.text = extra.text ?? "";
        }
        else if (blockType === "tool_use") {
            contentBlock.id = extra.id ?? "";
            contentBlock.name = extra.name ?? "";
            contentBlock.input = extra.input ?? {};
        }
        return this.formatEvent("content_block_start", {
            type: "content_block_start",
            index,
            content_block: contentBlock,
        });
    }
    contentBlockDelta(index, deltaType, content) {
        const delta = { type: deltaType };
        if (deltaType === "thinking_delta") {
            delta.thinking = content;
        }
        else if (deltaType === "text_delta") {
            delta.text = content;
        }
        else if (deltaType === "input_json_delta") {
            delta.partial_json = content;
        }
        return this.formatEvent("content_block_delta", {
            type: "content_block_delta",
            index,
            delta,
        });
    }
    contentBlockStop(index) {
        return this.formatEvent("content_block_stop", {
            type: "content_block_stop",
            index,
        });
    }
    // ── Thinking block helpers ──
    startThinkingBlock() {
        this.blocks.thinkingIndex = this.blocks.allocateIndex();
        this.blocks.thinkingStarted = true;
        return this.contentBlockStart(this.blocks.thinkingIndex, "thinking");
    }
    emitThinkingDelta(content) {
        this.accumulatedReasoningParts.push(content);
        return this.contentBlockDelta(this.blocks.thinkingIndex, "thinking_delta", content);
    }
    stopThinkingBlock() {
        this.blocks.thinkingStarted = false;
        return this.contentBlockStop(this.blocks.thinkingIndex);
    }
    // ── Text block helpers ──
    startTextBlock() {
        this.blocks.textIndex = this.blocks.allocateIndex();
        this.blocks.textStarted = true;
        return this.contentBlockStart(this.blocks.textIndex, "text");
    }
    emitTextDelta(content) {
        this.accumulatedTextParts.push(content);
        return this.contentBlockDelta(this.blocks.textIndex, "text_delta", content);
    }
    stopTextBlock() {
        this.blocks.textStarted = false;
        return this.contentBlockStop(this.blocks.textIndex);
    }
    // ── Tool block helpers ──
    startToolBlock(toolIndex, toolId, name) {
        const blockIdx = this.blocks.allocateIndex();
        const existing = this.blocks.toolStates.get(toolIndex);
        if (existing) {
            existing.blockIndex = blockIdx;
            existing.toolId = toolId;
            existing.started = true;
        }
        else {
            this.blocks.toolStates.set(toolIndex, {
                blockIndex: blockIdx,
                toolId,
                name,
                contents: [],
                started: true,
                taskArgBuffer: "",
                taskArgsEmitted: false,
            });
        }
        return this.contentBlockStart(blockIdx, "tool_use", { id: toolId, name });
    }
    emitToolDelta(toolIndex, partialJson) {
        const state = this.blocks.toolStates.get(toolIndex);
        state.contents.push(partialJson);
        return this.contentBlockDelta(state.blockIndex, "input_json_delta", partialJson);
    }
    stopToolBlock(toolIndex) {
        const blockIdx = this.blocks.toolStates.get(toolIndex).blockIndex;
        return this.contentBlockStop(blockIdx);
    }
    // ── State management ──
    *ensureThinkingBlock() {
        if (this.blocks.textStarted)
            yield this.stopTextBlock();
        if (!this.blocks.thinkingStarted)
            yield this.startThinkingBlock();
    }
    *ensureTextBlock() {
        if (this.blocks.thinkingStarted)
            yield this.stopThinkingBlock();
        if (!this.blocks.textStarted)
            yield this.startTextBlock();
    }
    *closeContentBlocks() {
        if (this.blocks.thinkingStarted)
            yield this.stopThinkingBlock();
        if (this.blocks.textStarted)
            yield this.stopTextBlock();
    }
    *closeAllBlocks() {
        if (this.blocks.thinkingStarted)
            yield this.stopThinkingBlock();
        if (this.blocks.textStarted)
            yield this.stopTextBlock();
        for (const [toolIndex, state] of this.blocks.toolStates.entries()) {
            if (state.started)
                yield this.stopToolBlock(toolIndex);
        }
    }
    // ── Error handling ──
    *emitError(errorMessage) {
        const errorIndex = this.blocks.allocateIndex();
        yield this.contentBlockStart(errorIndex, "text");
        yield this.contentBlockDelta(errorIndex, "text_delta", errorMessage);
        yield this.contentBlockStop(errorIndex);
    }
    // ── Token estimation ──
    estimateOutputTokens() {
        const text = this.accumulatedTextParts.join("");
        const reasoning = this.accumulatedReasoningParts.join("");
        // Simple char/4 estimation (no tiktoken in Node.js without native deps)
        const textTokens = Math.ceil(text.length / 4);
        const reasoningTokens = Math.ceil(reasoning.length / 4);
        let toolTokens = 0;
        for (const state of this.blocks.toolStates.values()) {
            if (state.started)
                toolTokens += 50;
        }
        return textTokens + reasoningTokens + toolTokens;
    }
}
//# sourceMappingURL=sseBuilder.js.map