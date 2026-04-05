/**
 * Embedded proxy HTTP server.
 *
 * Starts a local HTTP server that translates Anthropic API requests
 * to NVIDIA NIM format. Finds a free port automatically.
 */
import { type Server } from "node:http";
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
 * Start the proxy server.
 * Returns a handle with the port, host, and a stop() function.
 */
export declare function startProxyServer(options: ProxyServerOptions): Promise<RunningProxy>;
/**
 * Wait for the proxy server to be healthy.
 * Polls the /health endpoint with retries.
 */
export declare function waitForHealth(host: string, port: number, maxRetries?: number, intervalMs?: number): Promise<boolean>;
