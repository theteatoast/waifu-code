/**
 * Shared types for the provider layer.
 */
/** Content type enum for parsed content chunks. */
export var ContentType;
(function (ContentType) {
    ContentType["TEXT"] = "text";
    ContentType["THINKING"] = "thinking";
})(ContentType || (ContentType = {}));
/** OpenAI stop_reason → Anthropic stop_reason mapping. */
export const STOP_REASON_MAP = {
    stop: "end_turn",
    length: "max_tokens",
    tool_calls: "tool_use",
    content_filter: "end_turn",
};
export function mapStopReason(openaiReason) {
    return openaiReason ? STOP_REASON_MAP[openaiReason] ?? "end_turn" : "end_turn";
}
//# sourceMappingURL=types.js.map