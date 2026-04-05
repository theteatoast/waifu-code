/**
 * Configuration management for waifu CLI.
 *
 * Stores NIM API key and settings in ~/.waifu/config.json.
 * Cross-platform: uses os.homedir() for the config directory.
 */
export interface WaifuConfig {
    nimApiKey?: string;
    model?: string;
}
/** Load config from disk. Returns empty config if file doesn't exist. */
export declare function loadConfig(): WaifuConfig;
/** Save config to disk. Creates the config directory if needed. */
export declare function saveConfig(config: WaifuConfig): void;
/**
 * Resolve the NIM API key from (in priority order):
 *   1. CLI flag --nim-key
 *   2. Environment variable NIM_API_KEY or NVIDIA_NIM_API_KEY
 *   3. Persisted config file ~/.waifu/config.json
 *
 * Returns the key or null if not found.
 */
export declare function resolveNimApiKey(cliKey?: string): string | null;
/**
 * Resolve the model from (in priority order):
 *   1. CLI flag --model
 *   2. Environment variable WAIFU_MODEL
 *   3. Persisted config file
 *   4. Default: moonshotai/kimi-k2.5
 */
export declare function resolveModel(cliModel?: string): string;
/** Get the config directory path. */
export declare function getConfigDir(): string;
/** Get the config file path. */
export declare function getConfigFile(): string;
