/**
 * Configuration management for waifu CLI.
 *
 * Stores NIM API key and settings in ~/.waifu/config.json.
 * Cross-platform: uses os.homedir() for the config directory.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface WaifuConfig {
  nimApiKey?: string;
  model?: string;
}

const CONFIG_DIR = join(homedir(), ".waifu");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/** Load config from disk. Returns empty config if file doesn't exist. */
export function loadConfig(): WaifuConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(raw) as WaifuConfig;
    }
  } catch {
    // Corrupted config — treat as empty
  }
  return {};
}

/** Save config to disk. Creates the config directory if needed. */
export function saveConfig(config: WaifuConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * Resolve the NIM API key from (in priority order):
 *   1. CLI flag --nim-key
 *   2. Environment variable NIM_API_KEY or NVIDIA_NIM_API_KEY
 *   3. Persisted config file ~/.waifu/config.json
 *
 * Returns the key or null if not found.
 */
export function resolveNimApiKey(cliKey?: string): string | null {
  if (cliKey) return cliKey;
  if (process.env.NIM_API_KEY) return process.env.NIM_API_KEY;
  if (process.env.NVIDIA_NIM_API_KEY) return process.env.NVIDIA_NIM_API_KEY;

  const config = loadConfig();
  return config.nimApiKey ?? null;
}

/**
 * Resolve the model from (in priority order):
 *   1. CLI flag --model
 *   2. Environment variable WAIFU_MODEL
 *   3. Persisted config file
 *   4. Default: moonshotai/kimi-k2.5
 */
export function resolveModel(cliModel?: string): string {
  if (cliModel) return cliModel;
  if (process.env.WAIFU_MODEL) return process.env.WAIFU_MODEL;

  const config = loadConfig();
  return config.model ?? "moonshotai/kimi-k2-thinking";
}

/** Get the config directory path. */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/** Get the config file path. */
export function getConfigFile(): string {
  return CONFIG_FILE;
}
