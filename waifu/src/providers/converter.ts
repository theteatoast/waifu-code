/**
 * Anthropic ↔ OpenAI message format converter.
 *
 * Converts Anthropic-style messages (with content blocks like text, thinking,
 * tool_use, tool_result) to OpenAI chat completions format.
 * Port of Python AnthropicToOpenAIConverter from the proxy server.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function getBlockAttr(block: any, attr: string, defaultVal: any = undefined): any {
  if (block && typeof block === "object") {
    return block[attr] ?? defaultVal;
  }
  return defaultVal;
}

function getBlockType(block: any): string | undefined {
  return getBlockAttr(block, "type");
}

/** Convert a list of Anthropic messages to OpenAI format. */
export function convertMessages(messages: any[]): any[] {
  const result: any[] = [];

  for (const msg of messages) {
    const role = msg.role;
    const content = msg.content;

    if (typeof content === "string") {
      result.push({ role, content });
    } else if (Array.isArray(content)) {
      if (role === "assistant") {
        result.push(...convertAssistantMessage(content));
      } else if (role === "user") {
        result.push(...convertUserMessage(content));
      }
    } else {
      result.push({ role, content: String(content) });
    }
  }

  return result;
}

function convertAssistantMessage(content: any[]): any[] {
  const contentParts: string[] = [];
  const toolCalls: any[] = [];

  for (const block of content) {
    const blockType = getBlockType(block);

    if (blockType === "text") {
      contentParts.push(getBlockAttr(block, "text", ""));
    } else if (blockType === "thinking") {
      const thinking = getBlockAttr(block, "thinking", "");
      contentParts.push(`<think>\n${thinking}\n</think>`);
    } else if (blockType === "tool_use") {
      const toolInput = getBlockAttr(block, "input", {});
      toolCalls.push({
        id: getBlockAttr(block, "id"),
        type: "function",
        function: {
          name: getBlockAttr(block, "name"),
          arguments:
            typeof toolInput === "object"
              ? JSON.stringify(toolInput)
              : String(toolInput),
        },
      });
    }
  }

  let contentStr = contentParts.join("\n\n");

  // Ensure content is never empty for assistant messages
  // NIM requires non-empty content if there are no tool calls
  if (!contentStr && toolCalls.length === 0) {
    contentStr = " ";
  }

  const msg: any = { role: "assistant", content: contentStr };
  if (toolCalls.length > 0) {
    msg.tool_calls = toolCalls;
  }

  return [msg];
}

function convertUserMessage(content: any[]): any[] {
  const result: any[] = [];
  const textParts: string[] = [];

  const flushText = () => {
    if (textParts.length > 0) {
      result.push({ role: "user", content: textParts.join("\n") });
      textParts.length = 0;
    }
  };

  for (const block of content) {
    const blockType = getBlockType(block);

    if (blockType === "text") {
      textParts.push(getBlockAttr(block, "text", ""));
    } else if (blockType === "tool_result") {
      flushText();
      let toolContent = getBlockAttr(block, "content", "");
      if (Array.isArray(toolContent)) {
        toolContent = toolContent
          .map((item: any) =>
            typeof item === "object" ? item.text ?? String(item) : String(item)
          )
          .join("\n");
      }
      result.push({
        role: "tool",
        tool_call_id: getBlockAttr(block, "tool_use_id"),
        content: toolContent ? String(toolContent) : "",
      });
    }
  }

  flushText();
  return result;
}

/** Convert Anthropic tools to OpenAI format. */
export function convertTools(tools: any[]): any[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.input_schema,
    },
  }));
}

/** Convert Anthropic system prompt to OpenAI format. */
export function convertSystemPrompt(
  system: string | any[] | undefined | null
): { role: string; content: string } | null {
  if (typeof system === "string") {
    return { role: "system", content: system };
  }
  if (Array.isArray(system)) {
    const textParts = system
      .filter((block) => getBlockType(block) === "text")
      .map((block) => getBlockAttr(block, "text", ""));
    if (textParts.length > 0) {
      return { role: "system", content: textParts.join("\n\n").trim() };
    }
  }
  return null;
}

/** Build the common parts of an OpenAI-format request body. */
export function buildBaseRequestBody(requestData: any): any {
  const messages = convertMessages(requestData.messages);

  const system = requestData.system;
  if (system) {
    const systemMsg = convertSystemPrompt(system);
    if (systemMsg) {
      messages.unshift(systemMsg);
    }
  }

  const body: any = { model: requestData.model, messages };

  if (requestData.max_tokens != null) {
    body.max_tokens = requestData.max_tokens;
  }
  if (requestData.temperature != null) {
    body.temperature = requestData.temperature;
  }
  if (requestData.top_p != null) {
    body.top_p = requestData.top_p;
  }
  if (requestData.stop_sequences) {
    body.stop = requestData.stop_sequences;
  }
  if (requestData.tools && requestData.tools.length > 0) {
    body.tools = convertTools(requestData.tools);
  }
  if (requestData.tool_choice) {
    body.tool_choice = requestData.tool_choice;
  }

  return body;
}
