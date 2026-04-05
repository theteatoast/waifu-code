/**
 * Anthropic ↔ OpenAI message format converter.
 *
 * Converts Anthropic-style messages (with content blocks like text, thinking,
 * tool_use, tool_result) to OpenAI chat completions format.
 * Port of Python AnthropicToOpenAIConverter from the proxy server.
 */
/** Convert a list of Anthropic messages to OpenAI format. */
export declare function convertMessages(messages: any[]): any[];
/** Convert Anthropic tools to OpenAI format. */
export declare function convertTools(tools: any[]): any[];
/** Convert Anthropic system prompt to OpenAI format. */
export declare function convertSystemPrompt(system: string | any[] | undefined | null): {
    role: string;
    content: string;
} | null;
/** Build the common parts of an OpenAI-format request body. */
export declare function buildBaseRequestBody(requestData: any): any;
