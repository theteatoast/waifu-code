/**
 * Simple token counter for API requests.
 *
 * Uses character-based estimation (chars/4) since we don't want
 * to bundle tiktoken's native WASM module as a dependency.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Message, Tool, SystemContent } from "./types.js";

function getBlockAttr(block: any, attr: string, defaultVal: any = ""): any {
  return block?.[attr] ?? defaultVal;
}

/**
 * Estimate token count for a request.
 * Uses simple char/4 heuristic (no tiktoken dependency).
 */
export function getTokenCount(
  messages: Message[],
  system?: string | SystemContent[] | null,
  tools?: Tool[] | null
): number {
  let totalTokens = 0;

  // System prompt
  if (system) {
    if (typeof system === "string") {
      totalTokens += Math.ceil(system.length / 4);
    } else if (Array.isArray(system)) {
      for (const block of system) {
        const text = getBlockAttr(block, "text", "");
        if (text) totalTokens += Math.ceil(String(text).length / 4);
      }
    }
    totalTokens += 4; // formatting overhead
  }

  // Messages
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      totalTokens += Math.ceil(msg.content.length / 4);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        const bType = getBlockAttr(block, "type");
        if (bType === "text") {
          totalTokens += Math.ceil(String(getBlockAttr(block, "text", "")).length / 4);
        } else if (bType === "thinking") {
          totalTokens += Math.ceil(
            String(getBlockAttr(block, "thinking", "")).length / 4
          );
        } else if (bType === "tool_use") {
          const name = String(getBlockAttr(block, "name", ""));
          const inp = getBlockAttr(block, "input", {});
          const id = String(getBlockAttr(block, "id", ""));
          totalTokens += Math.ceil(name.length / 4);
          totalTokens += Math.ceil(JSON.stringify(inp).length / 4);
          totalTokens += Math.ceil(id.length / 4);
          totalTokens += 15;
        } else if (bType === "image") {
          const source = getBlockAttr(block, "source");
          if (source && typeof source === "object") {
            const data = source.data || source.base64 || "";
            totalTokens += data ? Math.max(85, Math.ceil(data.length / 3000)) : 765;
          } else {
            totalTokens += 765;
          }
        } else if (bType === "tool_result") {
          const content = getBlockAttr(block, "content", "");
          const toolUseId = String(getBlockAttr(block, "tool_use_id", ""));
          if (typeof content === "string") {
            totalTokens += Math.ceil(content.length / 4);
          } else {
            totalTokens += Math.ceil(JSON.stringify(content).length / 4);
          }
          totalTokens += Math.ceil(toolUseId.length / 4);
          totalTokens += 8;
        }
      }
    }
  }

  // Tools
  if (tools) {
    for (const tool of tools) {
      const toolStr =
        tool.name + (tool.description || "") + JSON.stringify(tool.input_schema);
      totalTokens += Math.ceil(toolStr.length / 4);
    }
  }

  // Per-message and per-tool overhead
  totalTokens += messages.length * 4;
  if (tools) totalTokens += tools.length * 5;

  return Math.max(1, totalTokens);
}
