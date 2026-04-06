/**
 * Configuration management for waifu CLI.
 *
 * Stores provider choice, API keys, and model settings in ~/.waifu/config.json.
 */
export type ProviderName = "nim" | "openrouter" | "groq" | "ollama";
export declare const PROVIDER_NAMES: ProviderName[];
export declare const PROVIDER_DEFAULT_MODELS: Record<ProviderName, string>;
export declare const PROVIDER_KEY_ENV: Record<ProviderName, string[]>;
export interface WaifuConfig {
    provider?: ProviderName;
    model?: string;
    nimApiKey?: string;
    openrouterApiKey?: string;
    groqApiKey?: string;
    ollamaBaseUrl?: string;
}
export declare function loadConfig(): WaifuConfig;
export declare function saveConfig(config: WaifuConfig): void;
export declare function getConfigDir(): string;
export declare function getConfigFile(): string;
export declare function resolveProvider(cliProvider?: string): ProviderName;
export declare function resolveModel(provider: ProviderName, cliModel?: string): string;
/**
 * Resolve the API key for a given provider.
 * Priority: CLI flag → env var(s) → config file → null
 */
export declare function resolveApiKey(provider: ProviderName, cliKey?: string): string | null;
/** Save API key for a specific provider into config. */
export declare function saveApiKey(provider: ProviderName, key: string): void;
export declare function resolveNimApiKey(cliKey?: string): string | null;
