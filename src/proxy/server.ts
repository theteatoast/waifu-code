/**
 * Embedded proxy HTTP server.
 *
 * Starts a local HTTP server that translates Anthropic API requests
 * to NVIDIA NIM format. Finds a free port automatically.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { handleRequest, type RouteContext } from "./routes.js";

export interface ProxyServerOptions {
  nimApiKey: string;
  model?: string;
  authToken: string;
  port?: number;
  host?: string;
  detector?: import("../observer/eventDetector.js").EventDetector;
}

export interface RunningProxy {
  port: number;
  host: string;
  server: Server;
  stop: () => Promise<void>;
}

/**
 * Find a free port by binding to port 0 and reading back the assigned port.
 */
async function findFreePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, host, () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Could not determine port")));
      }
    });
    srv.on("error", reject);
  });
}

/**
 * Start the proxy server.
 * Returns a handle with the port, host, and a stop() function.
 */
export async function startProxyServer(
  options: ProxyServerOptions
): Promise<RunningProxy> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? (await findFreePort(host));

  const ctx: RouteContext = {
    nimConfig: {
      apiKey: options.nimApiKey,
      model: options.model,
    },
    authToken: options.authToken,
    model: options.model ?? "moonshotai/kimi-k2.5",
    detector: options.detector,
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    handleRequest(req, res, ctx).catch((err) => {
      console.error(`[waifu] Unhandled error: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Internal server error" } }));
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, host, () => {
      const stop = async (): Promise<void> => {
        return new Promise<void>((resolveStop) => {
          server.close(() => resolveStop());
          // Force-close after 2 seconds
          setTimeout(() => resolveStop(), 2000);
        });
      };

      resolve({ port, host, server, stop });
    });
  });
}

/**
 * Wait for the proxy server to be healthy.
 * Polls the /health endpoint with retries.
 */
export async function waitForHealth(
  host: string,
  port: number,
  maxRetries = 30,
  intervalMs = 100
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(`http://${host}:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (resp.ok) return true;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
