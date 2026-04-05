/**
 * HTTP route handlers for the proxy server.
 *
 * Handles:
 *   POST /v1/messages          — Streaming messages (main endpoint)
 *   POST /v1/messages/count_tokens — Token counting
 *   GET  /health               — Health check
 *   GET  /                     — Status
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { streamNimResponse, type NimConfig } from "../providers/nim.js";
import { validateAuth } from "./auth.js";
import { tryOptimizations } from "./optimizer.js";
import { getTokenCount } from "./tokenCounter.js";
import type { MessagesRequest, MessagesResponse } from "./types.js";

export interface RouteContext {
  nimConfig: NimConfig;
  authToken?: string;
  model: string;
  detector?: import("../observer/eventDetector.js").EventDetector;
}

/** Read the full request body as JSON. */
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
        console.error("[readBody] Raw body string:", Buffer.concat(chunks).toString("utf-8").slice(0, 500));
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/** Send a JSON response. */
function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: any
): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/** Handle POST /v1/messages — streaming messages. */
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

  // Try optimizations first
  const optimized = tryOptimizations(requestData);
  if (optimized) {
    sendJson(res, 200, optimized);
    return;
  }

  // Calculate input tokens
  const inputTokens = getTokenCount(
    requestData.messages,
    requestData.system,
    requestData.tools
  );

  // Stream SSE response
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  try {
    for await (const event of streamNimResponse(
      requestData,
      ctx.nimConfig,
      inputTokens,
      requestId,
      ctx.detector
    )) {
      res.write(event);
    }
    ctx.detector?.setCompletion();
  } catch (err: any) {
    // If headers already sent, we can only close
    console.error(`[waifu] Stream error: ${err.message}`);
  }

  res.end();
}

/** Handle POST /v1/messages/count_tokens — token counting. */
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

/** Handle GET /health — health check. */
function handleHealth(res: ServerResponse): void {
  sendJson(res, 200, { status: "healthy" });
}

/** Handle GET / — root status. */
function handleRoot(res: ServerResponse, ctx: RouteContext): void {
  sendJson(res, 200, {
    status: "ok",
    provider: "nvidia_nim",
    model: ctx.model,
  });
}

/**
 * Main request router. Called for every incoming HTTP request.
 */
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

  // Health check doesn't need auth
  const pathname = url.split("?")[0];

  if (method === "GET" && pathname === "/health") {
    handleHealth(res);
    return;
  }

  // Auth check for all other routes
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
