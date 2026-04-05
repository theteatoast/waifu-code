/**
 * Auth middleware for the proxy server.
 *
 * Validates API key in x-api-key header or Authorization Bearer token
 * against the configured internal auth token.
 */
/**
 * Validate the request's auth credentials against the expected token.
 * Returns null if valid, or an error message string if invalid.
 * If no token is configured, all requests are allowed.
 */
export function validateAuth(req, expectedToken) {
    if (!expectedToken) {
        return null; // No auth configured → allow all
    }
    const xApiKey = req.headers["x-api-key"];
    const authorization = req.headers["authorization"];
    const anthropicAuth = req.headers["anthropic-auth-token"];
    const header = xApiKey ?? authorization ?? anthropicAuth;
    if (!header) {
        return "Missing API key";
    }
    let token = Array.isArray(header) ? header[0] : header;
    // Support "Bearer <token>" format
    if (token.toLowerCase().startsWith("bearer ")) {
        token = token.slice(7);
    }
    // Strip anything after first colon (handles tokens with appended model names)
    if (token.includes(":")) {
        token = token.split(":")[0];
    }
    if (token !== expectedToken) {
        return "Invalid API key";
    }
    return null;
}
//# sourceMappingURL=auth.js.map