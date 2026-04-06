/**
 * Embedded proxy HTTP server.
 */
import { type Server } from "node:http";
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
export declare function startProxyServer(options: ProxyServerOptions): Promise<RunningProxy>;
export declare function waitForHealth(host: string, port: number, maxRetries?: number, intervalMs?: number): Promise<boolean>;
