/**
 * HTTP route handlers for the proxy server.
 *
 * Handles:
 *   POST /v1/messages              — Streaming messages (main endpoint)
 *   POST /v1/messages/count_tokens — Token counting
 *   GET  /health                   — Health check
 *   GET  /                         — Status
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { validateAuth } from "./auth.js";
import { tryOptimizations } from "./optimizer.js";
import { getTokenCount } from "./tokenCounter.js";
import type { MessagesRequest, MessagesResponse } from "./types.js";
import type { ProviderName } from "../config.js";

// Provider stream functions
import { streamNimResponse, type NimConfig } from "../providers/nim.js";
import { streamOpenRouterResponse, type OpenRouterConfig } from "../providers/openrouter.js";
import { streamGroqResponse, type GroqConfig } from "../providers/groq.js";
import { streamOllamaResponse, type OllamaConfig } from "../providers/ollama.js";

// ── Context passed from server.ts ─────────────────────────────────────────────

export interface RouteContext {
  provider: ProviderName;
  model: string;
  apiKey: string | null;
  authToken?: string;
  // Provider-specific extras
  ollamaBaseUrl?: string;
  openrouterSiteUrl?: string;
  openrouterSiteName?: string;
  detector?: import("../observer/eventDetector.js").EventDetector;
  // Legacy — kept for backward compat
  nimConfig?: NimConfig;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        if (!raw) return resolve({});
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: any): void {
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
function streamForProvider(
  requestData: any,
  ctx: RouteContext,
  inputTokens: number,
  requestId: string
): AsyncGenerator<string> {
  const { provider, apiKey, model, detector } = ctx;

  switch (provider) {
    case "openrouter": {
      const cfg: OpenRouterConfig = {
        apiKey: apiKey!,
        model,
        siteUrl: ctx.openrouterSiteUrl,
        siteName: ctx.openrouterSiteName,
      };
      return streamOpenRouterResponse(requestData, cfg, inputTokens, requestId, detector);
    }

    case "groq": {
      const cfg: GroqConfig = { apiKey: apiKey!, model };
      return streamGroqResponse(requestData, cfg, inputTokens, requestId, detector);
    }

    case "ollama": {
      const cfg: OllamaConfig = {
        model,
        baseUrl: ctx.ollamaBaseUrl,
      };
      return streamOllamaResponse(requestData, cfg, inputTokens, requestId, detector);
    }

    case "nim":
    default: {
      const cfg: NimConfig = { apiKey: apiKey!, model };
      return streamNimResponse(requestData, cfg, inputTokens, requestId, detector);
    }
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleMessages(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext
): Promise<void> {
  ctx.detector?.onThinking();
  const requestData: MessagesRequest = await readBody(req);
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

  const inputTokens = getTokenCount(
    requestData.messages,
    requestData.system,
    requestData.tools
  );

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
  } catch (err: any) {
    console.error(`[waifu] Stream error: ${err.message}`);
  }

  res.end();
}

async function handleCountTokens(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const requestData = await readBody(req);
  const tokens = getTokenCount(
    requestData.messages,
    requestData.system,
    requestData.tools
  );
  sendJson(res, 200, { input_tokens: tokens });
}

function handleHealth(res: ServerResponse): void {
  sendJson(res, 200, { status: "healthy" });
}

function handleRoot(res: ServerResponse, ctx: RouteContext): void {
  sendJson(res, 200, {
    status: "ok",
    provider: ctx.provider,
    model: ctx.model,
  });
}

// ── Main router ───────────────────────────────────────────────────────────────

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext
): Promise<void> {
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
    } else if (method === "POST" && pathname === "/v1/messages/count_tokens") {
      await handleCountTokens(req, res);
    } else if (method === "GET" && pathname === "/") {
      handleRoot(res, ctx);
    } else {
      sendJson(res, 404, { error: { message: "Not found", path: url } });
    }
  } catch (err: any) {
    console.error(`[waifu] Request error: ${err.message}`);
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: { message: err.message ?? "Internal server error" },
      });
    }
  }
}
