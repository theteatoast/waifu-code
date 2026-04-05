/**
 * Heuristic tool call parser.
 *
 * Detects raw text tool calls in the format:
 *   ● <function=Name><parameter=key>value</parameter>...
 *
 * Also strips leaked control tokens like <|tool_call_end|>.
 * Port of Python HeuristicToolParser from the proxy server.
 */
import { randomUUID } from "node:crypto";
var ParserState;
(function (ParserState) {
    ParserState[ParserState["TEXT"] = 1] = "TEXT";
    ParserState[ParserState["MATCHING_FUNCTION"] = 2] = "MATCHING_FUNCTION";
    ParserState[ParserState["PARSING_PARAMETERS"] = 3] = "PARSING_PARAMETERS";
})(ParserState || (ParserState = {}));
const CONTROL_TOKEN_RE = /<\|[^|>]{1,80}\|>/g;
const CONTROL_TOKEN_START = "<|";
const CONTROL_TOKEN_END = "|>";
const FUNC_START_RE = /●\s*<function=([^>]+)>/;
const PARAM_RE = /<parameter=([^>]+)>(.*?)(?:<\/parameter>|$)/gs;
export class HeuristicToolParser {
    state = ParserState.TEXT;
    buffer = "";
    currentToolId = null;
    currentFunctionName = null;
    currentParameters = {};
    stripControlTokens(text) {
        return text.replace(CONTROL_TOKEN_RE, "");
    }
    splitIncompleteControlTokenTail() {
        const start = this.buffer.lastIndexOf(CONTROL_TOKEN_START);
        if (start === -1)
            return "";
        const end = this.buffer.indexOf(CONTROL_TOKEN_END, start);
        if (end !== -1)
            return "";
        const prefix = this.buffer.slice(0, start);
        this.buffer = this.buffer.slice(start);
        return prefix;
    }
    /**
     * Feed text into the parser.
     * Returns [filteredText, detectedToolCalls].
     */
    feed(text) {
        this.buffer += text;
        this.buffer = this.stripControlTokens(this.buffer);
        const detectedTools = [];
        const filteredParts = [];
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (this.state === ParserState.TEXT) {
                if (this.buffer.includes("●")) {
                    const idx = this.buffer.indexOf("●");
                    filteredParts.push(this.buffer.slice(0, idx));
                    this.buffer = this.buffer.slice(idx);
                    this.state = ParserState.MATCHING_FUNCTION;
                }
                else {
                    const safePrefix = this.splitIncompleteControlTokenTail();
                    if (safePrefix) {
                        filteredParts.push(safePrefix);
                        break;
                    }
                    filteredParts.push(this.buffer);
                    this.buffer = "";
                    break;
                }
            }
            if (this.state === ParserState.MATCHING_FUNCTION) {
                const match = FUNC_START_RE.exec(this.buffer);
                if (match) {
                    this.currentFunctionName = match[1].trim();
                    this.currentToolId = `toolu_heuristic_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
                    this.currentParameters = {};
                    this.buffer = this.buffer.slice(match.index + match[0].length);
                    this.state = ParserState.PARSING_PARAMETERS;
                }
                else {
                    if (this.buffer.length > 100) {
                        filteredParts.push(this.buffer[0]);
                        this.buffer = this.buffer.slice(1);
                        this.state = ParserState.TEXT;
                    }
                    else {
                        break;
                    }
                }
            }
            if (this.state === ParserState.PARSING_PARAMETERS) {
                let finishedToolCall = false;
                // Extract complete parameters
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    PARAM_RE.lastIndex = 0;
                    const paramMatch = PARAM_RE.exec(this.buffer);
                    if (paramMatch && paramMatch[0].includes("</parameter>")) {
                        const preMatch = this.buffer.slice(0, paramMatch.index);
                        if (preMatch)
                            filteredParts.push(preMatch);
                        this.currentParameters[paramMatch[1].trim()] = paramMatch[2].trim();
                        this.buffer = this.buffer.slice(paramMatch.index + paramMatch[0].length);
                    }
                    else {
                        break;
                    }
                }
                if (this.buffer.includes("●")) {
                    const idx = this.buffer.indexOf("●");
                    if (idx > 0) {
                        filteredParts.push(this.buffer.slice(0, idx));
                        this.buffer = this.buffer.slice(idx);
                    }
                    finishedToolCall = true;
                }
                else if (this.buffer.length > 0 && !this.buffer.trim().startsWith("<")) {
                    if (!this.buffer.includes("<parameter=")) {
                        filteredParts.push(this.buffer);
                        this.buffer = "";
                        finishedToolCall = true;
                    }
                }
                if (finishedToolCall) {
                    detectedTools.push({
                        type: "tool_use",
                        id: this.currentToolId,
                        name: this.currentFunctionName,
                        input: this.currentParameters,
                    });
                    this.state = ParserState.TEXT;
                }
                else {
                    break;
                }
            }
        }
        return [filteredParts.join(""), detectedTools];
    }
    /** Flush any remaining tool calls in the buffer. */
    flush() {
        this.buffer = this.stripControlTokens(this.buffer);
        const detectedTools = [];
        if (this.state === ParserState.PARSING_PARAMETERS) {
            // Try to extract partial parameters
            const partialRe = /<parameter=([^>]+)>(.*)$/gs;
            let m;
            while ((m = partialRe.exec(this.buffer)) !== null) {
                this.currentParameters[m[1].trim()] = m[2].trim();
            }
            detectedTools.push({
                type: "tool_use",
                id: this.currentToolId,
                name: this.currentFunctionName,
                input: this.currentParameters,
            });
            this.state = ParserState.TEXT;
            this.buffer = "";
        }
        return detectedTools;
    }
}
//# sourceMappingURL=toolParser.js.map