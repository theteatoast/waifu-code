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

import { randomUUID } from "node:crypto";

enum ParserState {
  TEXT = 1,
  MATCHING_FUNCTION = 2,
  PARSING_PARAMETERS = 3,
}

export interface DetectedToolCall {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

const CONTROL_TOKEN_RE = /<\|[^|>]{1,80}\|>/g;
const CONTROL_TOKEN_START = "<|";
const CONTROL_TOKEN_END = "|>";
const FUNC_START_RE = /●\s*<function=([^>]+)>/;
const PARAM_RE = /<parameter=([^>]+)>(.*?)(?:<\/parameter>|$)/gs;

// Matches a standalone JSON object that looks like a tool call.
// Anchored to start-of-string after trimming so we don't false-positive
// on JSON that appears inside normal prose.
const JSON_TOOL_RE = /^\s*\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"(?:arguments|parameters)"\s*:\s*(\{[\s\S]*?\})\s*\}/;

function makeId(): string {
  return `toolu_heuristic_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

export class HeuristicToolParser {
  private state = ParserState.TEXT;
  private buffer = "";
  private currentToolId: string | null = null;
  private currentFunctionName: string | null = null;
  private currentParameters: Record<string, string> = {};

  private stripControlTokens(text: string): string {
    return text.replace(CONTROL_TOKEN_RE, "");
  }

  private splitIncompleteControlTokenTail(): string {
    const start = this.buffer.lastIndexOf(CONTROL_TOKEN_START);
    if (start === -1) return "";
    const end = this.buffer.indexOf(CONTROL_TOKEN_END, start);
    if (end !== -1) return "";
    const prefix = this.buffer.slice(0, start);
    this.buffer = this.buffer.slice(start);
    return prefix;
  }

  /**
   * Try to detect a plain-JSON tool call in the buffer.
   * Returns the tool call and advances the buffer past it, or null.
   *
   * We wait until we see a closing `}` that makes the outer object
   * complete before committing, so we never cut off mid-stream.
   */
  private tryParseJsonToolCall(): DetectedToolCall | null {
    const trimmed = this.buffer.trimStart();
    if (!trimmed.startsWith("{")) return null;

    // Find the matching closing brace for the outermost object.
    // We scan character-by-character tracking nesting depth so we
    // don't get confused by braces inside string values.
    let depth = 0;
    let inString = false;
    let escape = false;
    let closeIdx = -1;

    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i]!;
      if (escape) { escape = false; continue; }
      if (ch === "\\" && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") { depth++; continue; }
      if (ch === "}") {
        depth--;
        if (depth === 0) { closeIdx = i; break; }
      }
    }

    // Haven't received the closing brace yet — keep buffering
    if (closeIdx === -1) return null;

    const candidate = trimmed.slice(0, closeIdx + 1);
    const match = JSON_TOOL_RE.exec(candidate);
    if (!match) return null;

    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(match[2]!) as Record<string, unknown>;
    } catch {
      return null;
    }

    // Advance buffer past the consumed object
    const consumed = this.buffer.indexOf(candidate) + candidate.length;
    this.buffer = this.buffer.slice(consumed);

    return {
      type: "tool_use",
      id: makeId(),
      name: match[1]!,
      input,
    };
  }

  /**
   * Feed text into the parser.
   * Returns [filteredText, detectedToolCalls].
   */
  feed(text: string): [string, DetectedToolCall[]] {
    this.buffer += text;
    this.buffer = this.stripControlTokens(this.buffer);
    const detectedTools: DetectedToolCall[] = [];
    const filteredParts: string[] = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // ── FORMAT 2: plain JSON tool call ──────────────────────────────────
      // Check before the bullet-based state machine so we catch it early.
      if (this.state === ParserState.TEXT) {
        const jsonTool = this.tryParseJsonToolCall();
        if (jsonTool) {
          detectedTools.push(jsonTool);
          continue;
        }
      }

      // ── FORMAT 1: bullet+XML state machine ──────────────────────────────
      if (this.state === ParserState.TEXT) {
        if (this.buffer.includes("●")) {
          const idx = this.buffer.indexOf("●");
          filteredParts.push(this.buffer.slice(0, idx));
          this.buffer = this.buffer.slice(idx);
          this.state = ParserState.MATCHING_FUNCTION;
        } else {
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
          this.currentFunctionName = match[1]!.trim();
          this.currentToolId = makeId();
          this.currentParameters = {};
          this.buffer = this.buffer.slice(match.index! + match[0].length);
          this.state = ParserState.PARSING_PARAMETERS;
        } else {
          if (this.buffer.length > 100) {
            filteredParts.push(this.buffer[0]!);
            this.buffer = this.buffer.slice(1);
            this.state = ParserState.TEXT;
          } else {
            break;
          }
        }
      }

      if (this.state === ParserState.PARSING_PARAMETERS) {
        let finishedToolCall = false;

        while (true) {
          PARAM_RE.lastIndex = 0;
          const paramMatch = PARAM_RE.exec(this.buffer);
          if (paramMatch && paramMatch[0].includes("</parameter>")) {
            const preMatch = this.buffer.slice(0, paramMatch.index);
            if (preMatch) filteredParts.push(preMatch);
            this.currentParameters[paramMatch[1]!.trim()] = paramMatch[2]!.trim();
            this.buffer = this.buffer.slice(paramMatch.index! + paramMatch[0].length);
          } else {
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
        } else if (this.buffer.length > 0 && !this.buffer.trim().startsWith("<")) {
          if (!this.buffer.includes("<parameter=")) {
            filteredParts.push(this.buffer);
            this.buffer = "";
            finishedToolCall = true;
          }
        }

        if (finishedToolCall) {
          detectedTools.push({
            type: "tool_use",
            id: this.currentToolId!,
            name: this.currentFunctionName!,
            input: this.currentParameters,
          });
          this.state = ParserState.TEXT;
        } else {
          break;
        }
      }
    }

    return [filteredParts.join(""), detectedTools];
  }

  /** Flush any remaining tool calls in the buffer. */
  flush(): DetectedToolCall[] {
    this.buffer = this.stripControlTokens(this.buffer);
    const detectedTools: DetectedToolCall[] = [];

    // Try flushing a JSON tool call first
    if (this.state === ParserState.TEXT) {
      const jsonTool = this.tryParseJsonToolCall();
      if (jsonTool) detectedTools.push(jsonTool);
    }

    if (this.state === ParserState.PARSING_PARAMETERS) {
      const partialRe = /<parameter=([^>]+)>(.*)$/gs;
      let m: RegExpExecArray | null;
      while ((m = partialRe.exec(this.buffer)) !== null) {
        this.currentParameters[m[1]!.trim()] = m[2]!.trim();
      }
      detectedTools.push({
        type: "tool_use",
        id: this.currentToolId!,
        name: this.currentFunctionName!,
        input: this.currentParameters,
      });
      this.state = ParserState.TEXT;
      this.buffer = "";
    }

    return detectedTools;
  }
}
