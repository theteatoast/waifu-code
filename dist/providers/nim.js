/**
 * NVIDIA NIM provider — sends requests to NVIDIA NIM API.
 *
 * Converts Anthropic-format requests to OpenAI chat completions format,
 * sends them to NIM, and streams back responses as Anthropic SSE events.
 * Port of Python NvidiaNimProvider + OpenAICompatibleProvider from proxy server.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { buildBaseRequestBody } from "./converter.js";
import { SSEBuilder } from "./sseBuilder.js";
import { ThinkTagParser } from "./thinkParser.js";
import { HeuristicToolParser } from "./toolParser.js";
import { ContentType, mapStopReason, } from "./types.js";
export const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const DEFAULT_MODEL = "moonshotai/kimi-k2-thinking";
export const DEFAULT_MAX_TOKENS = 81920;
function buildNimRequestBody(requestData, config) {
    const body = buildBaseRequestBody(requestData);
    // Override model to the configured NIM model
    body.model = config.model ?? DEFAULT_MODEL;
    // Cap max_tokens
    const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    if (body.max_tokens == null) {
        body.max_tokens = maxTokens;
    }
    else {
        body.max_tokens = Math.min(body.max_tokens, maxTokens);
    }
    // NIM defaults
    body.temperature ??= config.temperature ?? 1.0;
    body.top_p ??= config.topP ?? 1.0;
    // Parallel tool calls
    if (body.tools && body.tools.length > 0) {
        body.parallel_tool_calls = true;
    }
    return body;
}
function processToolCall(tc, sse) {
    const events = [];
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
/**
 * Parse a single SSE line from the NIM API response.
 * Returns the parsed JSON chunk, or null for non-data lines.
 */
function parseSSELine(line) {
    if (!line.startsWith("data: "))
        return null;
    const data = line.slice(6).trim();
    if (data === "[DONE]")
        return null;
    try {
        return JSON.parse(data);
    }
    catch {
        return null;
    }
}
/**
 * Stream a response from NVIDIA NIM and yield Anthropic-format SSE events.
 */
export async function* streamNimResponse(requestData, config, inputTokens, requestId, detector) {
    const messageId = `msg_${randomUUID()}`;
    const sse = new SSEBuilder(messageId, requestData.model, inputTokens);
    const body = buildNimRequestBody(requestData, config);
    const baseUrl = config.baseUrl ?? NVIDIA_NIM_BASE_URL;
    yield sse.messageStart();
    const thinkParser = new ThinkTagParser();
    const heuristicParser = new HeuristicToolParser();
    let finishReason = null;
    let usageInfo = null;
    let errorOccurred = false;
    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
                Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({ ...body, stream: true }),
        });
        if (!response.ok) {
            const errText = await response.text().catch(() => "Unknown error");
            throw new Error(`NIM API error ${response.status}: ${errText.slice(0, 500)}`);
        }
        if (!response.body) {
            throw new Error("NIM API returned no response body");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                if (process.env.WAIFU_VERBOSE)
                    console.log("[NIM_RAW]", trimmed);
                const chunk = parseSSELine(trimmed);
                if (!chunk)
                    continue;
                if (chunk.usage) {
                    usageInfo = chunk.usage;
                }
                if (!chunk.choices || chunk.choices.length === 0)
                    continue;
                const choice = chunk.choices[0];
                const delta = choice.delta;
                if (!delta)
                    continue;
                if (choice.finish_reason) {
                    finishReason = choice.finish_reason;
                }
                // Handle reasoning_content (OpenAI extended format)
                if (delta.reasoning_content) {
                    detector?.onThinking();
                    for (const ev of sse.ensureThinkingBlock())
                        yield ev;
                    yield sse.emitThinkingDelta(delta.reasoning_content);
                }
                // Handle text content
                if (delta.content) {
                    for (const part of thinkParser.feed(delta.content)) {
                        if (part.type === ContentType.THINKING) {
                            detector?.onThinking();
                            for (const ev of sse.ensureThinkingBlock())
                                yield ev;
                            yield sse.emitThinkingDelta(part.content);
                        }
                        else {
                            const [filteredText, detectedTools] = heuristicParser.feed(part.content);
                            if (filteredText) {
                                for (const ev of sse.ensureTextBlock())
                                    yield ev;
                                yield sse.emitTextDelta(filteredText);
                            }
                            for (const toolUse of detectedTools) {
                                for (const ev of sse.closeContentBlocks())
                                    yield ev;
                                const blockIdx = sse.blocks.allocateIndex();
                                if (toolUse.name === "Task" &&
                                    typeof toolUse.input === "object") {
                                    toolUse.input.run_in_background = false;
                                }
                                yield sse.contentBlockStart(blockIdx, "tool_use", {
                                    id: toolUse.id,
                                    name: toolUse.name,
                                });
                                yield sse.contentBlockDelta(blockIdx, "input_json_delta", JSON.stringify(toolUse.input));
                                yield sse.contentBlockStop(blockIdx);
                            }
                        }
                    }
                }
                // Handle native tool calls
                if (delta.tool_calls) {
                    for (const ev of sse.closeContentBlocks())
                        yield ev;
                    for (const tc of delta.tool_calls) {
                        const tcInfo = {
                            index: tc.index,
                            id: tc.id,
                            function: {
                                name: tc.function?.name,
                                arguments: tc.function?.arguments,
                            },
                        };
                        for (const ev of processToolCall(tcInfo, sse)) {
                            yield ev;
                        }
                    }
                }
            }
        }
    }
    catch (err) {
        errorOccurred = true;
        const errorMsg = err.message ?? "NIM provider request failed";
        const fullMsg = requestId
            ? `${errorMsg} (request_id=${requestId})`
            : errorMsg;
        for (const ev of sse.closeContentBlocks())
            yield ev;
        for (const ev of sse.emitError(fullMsg))
            yield ev;
    }
    // Flush remaining think content
    const remaining = thinkParser.flush();
    if (remaining) {
        if (remaining.type === ContentType.THINKING) {
            for (const ev of sse.ensureThinkingBlock())
                yield ev;
            yield sse.emitThinkingDelta(remaining.content);
        }
        else {
            for (const ev of sse.ensureTextBlock())
                yield ev;
            yield sse.emitTextDelta(remaining.content);
        }
    }
    // Flush heuristic tool calls
    for (const toolUse of heuristicParser.flush()) {
        for (const ev of sse.closeContentBlocks())
            yield ev;
        const blockIdx = sse.blocks.allocateIndex();
        if (toolUse.name === "Task" && typeof toolUse.input === "object") {
            toolUse.input.run_in_background = false;
        }
        yield sse.contentBlockStart(blockIdx, "tool_use", {
            id: toolUse.id,
            name: toolUse.name,
        });
        yield sse.contentBlockDelta(blockIdx, "input_json_delta", JSON.stringify(toolUse.input));
        yield sse.contentBlockStop(blockIdx);
    }
    // Ensure at least one text block exists
    if (!errorOccurred &&
        sse.blocks.textIndex === -1 &&
        sse.blocks.toolStates.size === 0) {
        for (const ev of sse.ensureTextBlock())
            yield ev;
        yield sse.emitTextDelta(" ");
    }
    // Flush Task arg buffers
    for (const [toolIndex, out] of sse.blocks.flushTaskArgBuffers()) {
        yield sse.emitToolDelta(toolIndex, out);
    }
    // Close all open blocks
    for (const ev of sse.closeAllBlocks())
        yield ev;
    // Final message events
    const outputTokens = usageInfo?.completion_tokens ?? sse.estimateOutputTokens();
    yield sse.messageDelta(mapStopReason(finishReason), outputTokens);
    yield sse.messageStop();
}
//# sourceMappingURL=nim.js.map