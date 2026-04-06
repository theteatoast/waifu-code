/**
 * HTTP route handlers for the proxy server.
 *
 * Handles:
 *   POST /v1/messages              — Streaming messages (main endpoint)
 *   POST /v1/messages/count_tokens — Token counting
 *   GET  /health                   — Health check
 *   GET  /                         — Status
 */
import { randomUUID } from "node:crypto";
import { validateAuth } from "./auth.js";
import { tryOptimizations } from "./optimizer.js";
import { getTokenCount } from "./tokenCounter.js";
// Provider stream functions
import { streamNimResponse } from "../providers/nim.js";
import { streamOpenRouterResponse } from "../providers/openrouter.js";
import { streamGroqResponse } from "../providers/groq.js";
import { streamOllamaResponse } from "../providers/ollama.js";
// ── Helpers ───────────────────────────────────────────────────────────────────
async function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
            try {
                const raw = Buffer.concat(chunks).toString("utf-8");
                if (!raw)
                    return resolve({});
                resolve(JSON.parse(raw));
            }
            catch (err) {
                reject(new Error("Invalid JSON body"));
            }
        });
        req.on("error", reject);
    });
}
function sendJson(res, statusCode, data) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
    });
    res.end(body);
}
// ── Provider dispatch ─────────────────────────────────────────────────────────
/**
 * Return the correct async generator for the configured provider.
 */
function streamForProvider(requestData, ctx, inputTokens, requestId) {
    const { provider, apiKey, model, detector } = ctx;
    switch (provider) {
        case "openrouter": {
            const cfg = {
                apiKey: apiKey,
                model,
                siteUrl: ctx.openrouterSiteUrl,
                siteName: ctx.openrouterSiteName,
            };
            return streamOpenRouterResponse(requestData, cfg, inputTokens, requestId, detector);
        }
        case "groq": {
            const cfg = { apiKey: apiKey, model };
            return streamGroqResponse(requestData, cfg, inputTokens, requestId, detector);
        }
        case "ollama": {
            const cfg = {
                model,
                baseUrl: ctx.ollamaBaseUrl,
            };
            return streamOllamaResponse(requestData, cfg, inputTokens, requestId, detector);
        }
        case "nim":
        default: {
            const cfg = { apiKey: apiKey, model };
            return streamNimResponse(requestData, cfg, inputTokens, requestId, detector);
        }
    }
}
// ── Route handlers ────────────────────────────────────────────────────────────
async function handleMessages(req, res, ctx) {
    ctx.detector?.onThinking();
    const requestData = await readBody(req);
    const requestId = `req_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    if (!requestData.messages || requestData.messages.length === 0) {
        sendJson(res, 400, { error: { message: "messages cannot be empty" } });
        return;
    }
    const optimized = tryOptimizations(requestData);
    if (optimized) {
        sendJson(res, 200, optimized);
        return;
    }
    const inputTokens = getTokenCount(requestData.messages, requestData.system, requestData.tools);
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
    });
    try {
        for await (const event of streamForProvider(requestData, ctx, inputTokens, requestId)) {
            res.write(event);
        }
        ctx.detector?.setCompletion();
    }
    catch (err) {
        console.error(`[waifu] Stream error: ${err.message}`);
    }
    res.end();
}
async function handleCountTokens(req, res) {
    const requestData = await readBody(req);
    const tokens = getTokenCount(requestData.messages, requestData.system, requestData.tools);
    sendJson(res, 200, { input_tokens: tokens });
}
function handleHealth(res) {
    sendJson(res, 200, { status: "healthy" });
}
function handleRoot(res, ctx) {
    sendJson(res, 200, {
        status: "ok",
        provider: ctx.provider,
        model: ctx.model,
    });
}
// ── Main router ───────────────────────────────────────────────────────────────
export async function handleRequest(req, res, ctx) {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";
    if (process.env.WAIFU_VERBOSE) {
        console.log(`\n==== [INCOMING] ${method} ${url} ====\n`);
    }
    const pathname = url.split("?")[0];
    if (method === "GET" && pathname === "/health") {
        handleHealth(res);
        return;
    }
    const authError = validateAuth(req, ctx.authToken);
    if (authError) {
        sendJson(res, 401, { error: { message: authError } });
        return;
    }
    try {
        if (method === "POST" && pathname === "/v1/messages") {
            await handleMessages(req, res, ctx);
        }
        else if (method === "POST" && pathname === "/v1/messages/count_tokens") {
            await handleCountTokens(req, res);
        }
        else if (method === "GET" && pathname === "/") {
            handleRoot(res, ctx);
        }
        else {
            sendJson(res, 404, { error: { message: "Not found", path: url } });
        }
    }
    catch (err) {
        console.error(`[waifu] Request error: ${err.message}`);
        if (!res.headersSent) {
            sendJson(res, 500, {
                error: { message: err.message ?? "Internal server error" },
            });
        }
    }
}
//# sourceMappingURL=routes.js.map