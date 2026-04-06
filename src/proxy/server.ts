/**
 * Embedded proxy HTTP server.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { handleRequest, type RouteContext } from "./routes.js";
import type { ProviderName } from "../config.js";

export interface ProxyServerOptions {
  provider: ProviderName;
  model: string;
  apiKey: string | null;
  authToken: string;
  port?: number;
  host?: string;
  ollamaBaseUrl?: string;
  openrouterSiteUrl?: string;
  openrouterSiteName?: string;
  detector?: import("../observer/eventDetector.js").EventDetector;
}

export interface RunningProxy {
  port: number;
  host: string;
  server: Server;
  stop: () => Promise<void>;
}

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

export async function startProxyServer(
  options: ProxyServerOptions
): Promise<RunningProxy> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? (await findFreePort(host));

  const ctx: RouteContext = {
    provider: options.provider,
    model: options.model,
    apiKey: options.apiKey,
    authToken: options.authToken,
    ollamaBaseUrl: options.ollamaBaseUrl,
    openrouterSiteUrl: options.openrouterSiteUrl,
    openrouterSiteName: options.openrouterSiteName,
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
          setTimeout(() => resolveStop(), 2000);
        });
      };
      resolve({ port, host, server, stop });
    });
  });
}

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
