/**
 * Request type detection utilities for API optimizations.
 *
 * Detects quota checks, title generation, prefix detection,
 * suggestion mode, and filepath extraction requests.
 * Port of Python detection.py from the proxy server.
 */
function extractTextFromContent(content) {
    if (typeof content === "string")
        return content;
    if (Array.isArray(content)) {
        const parts = [];
        for (const block of content) {
            if (block && typeof block === "object" && "text" in block) {
                const text = block.text;
                if (text && typeof text === "string")
                    parts.push(text);
            }
        }
        return parts.join("");
    }
    return "";
}
export function isQuotaCheckRequest(requestData) {
    if (requestData.max_tokens === 1 &&
        requestData.messages.length === 1 &&
        requestData.messages[0].role === "user") {
        const text = extractTextFromContent(requestData.messages[0].content);
        return text.toLowerCase().includes("quota");
    }
    return false;
}
export function isTitleGenerationRequest(requestData) {
    if (!requestData.system || (requestData.tools && requestData.tools.length > 0)) {
        return false;
    }
    const systemText = extractTextFromContent(requestData.system).toLowerCase();
    return systemText.includes("new conversation topic") && systemText.includes("title");
}
export function isPrefixDetectionRequest(requestData) {
    if (requestData.messages.length !== 1 ||
        requestData.messages[0].role !== "user") {
        return [false, ""];
    }
    const content = extractTextFromContent(requestData.messages[0].content);
    if (content.includes("<policy_spec>") && content.includes("Command:")) {
        try {
            const cmdStart = content.lastIndexOf("Command:") + "Command:".length;
            return [true, content.slice(cmdStart).trim()];
        }
        catch {
            // ignore
        }
    }
    return [false, ""];
}
export function isSuggestionModeRequest(requestData) {
    for (const msg of requestData.messages) {
        if (msg.role === "user") {
            const text = extractTextFromContent(msg.content);
            if (text.includes("[SUGGESTION MODE:"))
                return true;
        }
    }
    return false;
}
export function isFilepathExtractionRequest(requestData) {
    if (requestData.messages.length !== 1 ||
        requestData.messages[0].role !== "user") {
        return [false, "", ""];
    }
    if (requestData.tools && requestData.tools.length > 0) {
        return [false, "", ""];
    }
    const content = extractTextFromContent(requestData.messages[0].content);
    if (!content.includes("Command:") || !content.includes("Output:")) {
        return [false, "", ""];
    }
    const userHasFilepaths = content.toLowerCase().includes("filepaths") ||
        content.toLowerCase().includes("<filepaths>");
    const systemText = requestData.system
        ? extractTextFromContent(requestData.system).toLowerCase()
        : "";
    const systemHasExtract = systemText.includes("extract any file paths") ||
        systemText.includes("file paths that this command");
    if (!userHasFilepaths && !systemHasExtract) {
        return [false, "", ""];
    }
    try {
        const cmdStart = content.indexOf("Command:") + "Command:".length;
        const outputMarker = content.indexOf("Output:", cmdStart);
        if (outputMarker === -1)
            return [false, "", ""];
        const command = content.slice(cmdStart, outputMarker).trim();
        let output = content.slice(outputMarker + "Output:".length).trim();
        for (const marker of ["<", "\n\n"]) {
            if (output.includes(marker)) {
                output = output.split(marker)[0].trim();
            }
        }
        return [true, command, output];
    }
    catch {
        return [false, "", ""];
    }
}
//# sourceMappingURL=detection.js.map