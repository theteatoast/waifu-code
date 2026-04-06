/**
 * Configuration management for waifu CLI.
 *
 * Stores provider choice, API keys, and model settings in ~/.waifu/config.json.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_MODEL as NIM_DEFAULT_MODEL } from "./providers/nim.js";
import { OPENROUTER_DEFAULT_MODEL } from "./providers/openrouter.js";
import { GROQ_DEFAULT_MODEL } from "./providers/groq.js";
import { OLLAMA_DEFAULT_MODEL } from "./providers/ollama.js";

// ── Provider names ────────────────────────────────────────────────────────────

export type ProviderName = "nim" | "openrouter" | "groq" | "ollama";

export const PROVIDER_NAMES: ProviderName[] = ["nim", "openrouter", "groq", "ollama"];

export const PROVIDER_DEFAULT_MODELS: Record<ProviderName, string> = {
  nim: NIM_DEFAULT_MODEL,
  openrouter: OPENROUTER_DEFAULT_MODEL,
  groq: GROQ_DEFAULT_MODEL,
  ollama: OLLAMA_DEFAULT_MODEL,
};

export const PROVIDER_KEY_ENV: Record<ProviderName, string[]> = {
  nim: ["NIM_API_KEY", "NVIDIA_NIM_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  groq: ["GROQ_API_KEY"],
  ollama: [], // no key needed
};

// ── Config shape ──────────────────────────────────────────────────────────────

export interface WaifuConfig {
  provider?: ProviderName;
  model?: string;
  // Per-provider API keys
  nimApiKey?: string;
  openrouterApiKey?: string;
  groqApiKey?: string;
  // Ollama needs no key but supports a custom host
  ollamaBaseUrl?: string;
}

// ── Persistence ───────────────────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), ".waifu");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

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

export function saveConfig(config: WaifuConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function getConfigDir(): string { return CONFIG_DIR; }
export function getConfigFile(): string { return CONFIG_FILE; }

// ── Resolvers ─────────────────────────────────────────────────────────────────

export function resolveProvider(cliProvider?: string): ProviderName {
  const raw = cliProvider ?? process.env.WAIFU_PROVIDER ?? loadConfig().provider;
  if (raw && PROVIDER_NAMES.includes(raw as ProviderName)) {
    return raw as ProviderName;
  }
  // Auto-detect from available keys
  const cfg = loadConfig();
  if (cfg.groqApiKey || process.env.GROQ_API_KEY) return "groq";
  if (cfg.openrouterApiKey || process.env.OPENROUTER_API_KEY) return "openrouter";
  return "nim"; // default
}

export function resolveModel(provider: ProviderName, cliModel?: string): string {
  if (cliModel) return cliModel;
  if (process.env.WAIFU_MODEL) return process.env.WAIFU_MODEL;
  return loadConfig().model ?? PROVIDER_DEFAULT_MODELS[provider];
}

/**
 * Resolve the API key for a given provider.
 * Priority: CLI flag → env var(s) → config file → null
 */
export function resolveApiKey(provider: ProviderName, cliKey?: string): string | null {
  if (cliKey) return cliKey;

  for (const envVar of PROVIDER_KEY_ENV[provider]) {
    if (process.env[envVar]) return process.env[envVar]!;
  }

  const cfg = loadConfig();
  switch (provider) {
    case "nim": return cfg.nimApiKey ?? null;
    case "openrouter": return cfg.openrouterApiKey ?? null;
    case "groq": return cfg.groqApiKey ?? null;
    case "ollama": return null; // no key
  }
}

/** Save API key for a specific provider into config. */
export function saveApiKey(provider: ProviderName, key: string): void {
  const cfg = loadConfig();
  switch (provider) {
    case "nim": cfg.nimApiKey = key; break;
    case "openrouter": cfg.openrouterApiKey = key; break;
    case "groq": cfg.groqApiKey = key; break;
    case "ollama": break;
  }
  saveConfig(cfg);
}

// Keep backward-compat alias for old code that reads nimApiKey directly
export function resolveNimApiKey(cliKey?: string): string | null {
  return resolveApiKey("nim", cliKey);
}
