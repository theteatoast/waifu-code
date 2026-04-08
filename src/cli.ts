#!/usr/bin/env node

/**
 * waifu — Free coding assistant CLI.
 *
 * Starts an embedded proxy server that translates Anthropic API requests
 * to the configured provider, then launches claude-code with the proxy
 * configured automatically.
 *
 * Usage:
 *   waifu                                   # Use saved config
 *   waifu --provider openrouter --key sk-.. # OpenRouter
 *   waifu --provider groq --key gsk-...     # Groq
 *   waifu --provider ollama                 # Local Ollama (no key needed)
 *   waifu --provider nim --key nvapi-...    # NVIDIA NIM (default)
 *   waifu config                            # Show current configuration
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import {
  resolveProvider,
  resolveModel,
  resolveApiKey,
  loadConfig,
  saveConfig,
  saveApiKey,
  getConfigFile,
  PROVIDER_NAMES,
  PROVIDER_DEFAULT_MODELS,
  type ProviderName,
} from "./config.js";
import { startProxyServer, waitForHealth } from "./proxy/server.js";
import { EventDetector } from "./observer/eventDetector.js";
import { OverlayRenderer } from "./waifu/overlayRenderer.js";
import { PermissionSoundNotifier } from "./waifu/permissionSound.js";

const VERSION = "2.0.0";

const program = new Command();

program
  .name("waifu")
  .description("Free coding assistant — Claude Code powered by your choice of AI provider")
  .version(VERSION)
  .enablePositionalOptions()
  .passThroughOptions();

// ── Main command ──────────────────────────────────────────────────────────────

program
  .option(
    "--provider <name>",
    `AI provider to use: ${PROVIDER_NAMES.join(", ")} (default: nim)`
  )
  .option("--key <key>", "API key for the chosen provider (saved automatically)")
  // Legacy per-provider key flags for muscle memory
  .option("--nim-key <key>", "NVIDIA NIM API key (shorthand)")
  .option("--openrouter-key <key>", "OpenRouter API key (shorthand)")
  .option("--groq-key <key>", "Groq API key (shorthand)")
  .option("--model <model>", "Model to use (overrides per-provider default)")
  .option("--port <port>", "Proxy server port (default: auto)")
  .option("--proxy-only", "Start proxy server only (don't launch claude)")
  .option("--no-waifu", "Disable waifu overlay")
  .option("--no-faaah", "Disable permission prompt sound alert")
  .option("--verbose", "Enable verbose logging")

  .action(async (opts) => {
    // ── Resolve provider ────────────────────────────────────────────────────
    const provider = resolveProvider(opts.provider) as ProviderName;

    // ── Resolve API key ─────────────────────────────────────────────────────
    // Accept --key or the legacy per-provider shorthand flags
    const cliKey =
      opts.key ??
      (provider === "nim" ? opts.nimKey : undefined) ??
      (provider === "openrouter" ? opts.openrouterKey : undefined) ??
      (provider === "groq" ? opts.groqKey : undefined);

    const apiKey = resolveApiKey(provider, cliKey);

    if (provider !== "ollama" && !apiKey) {
      console.error(
        `\x1b[31m✗ No API key found for provider "${provider}".\x1b[0m\n\n` +
        keyHelpText(provider)
      );
      process.exit(1);
    }

    // ── Resolve model ───────────────────────────────────────────────────────
    const model = resolveModel(provider, opts.model);
    const verbose = opts.verbose ?? false;

    // ── Persist key if supplied via CLI ─────────────────────────────────────
    if (cliKey && provider !== "ollama") {
      saveApiKey(provider, cliKey);
      const cfg = loadConfig();
      cfg.provider = provider;
      if (opts.model) cfg.model = opts.model;
      saveConfig(cfg);
      if (verbose) console.log(`[waifu] Config saved to ${getConfigFile()}`);
    }

    // ── Auth token for proxy ────────────────────────────────────────────────
    const authToken = randomUUID();

    // ── Waifu overlay ───────────────────────────────────────────────────────
    const useWaifu = opts.waifu !== false;
    const useFaaah = opts.faaah !== false;
    let detector: EventDetector | undefined;
    let permissionSound: PermissionSoundNotifier | undefined;
    if (useWaifu) {
      detector = new EventDetector();
      const renderer = new OverlayRenderer(true);
      if (useFaaah) {
        permissionSound = new PermissionSoundNotifier();
      }
      detector.on("event", (ev) => {
        renderer.render(ev as any);
        if (ev === "permission") {
          permissionSound?.start();
        } else {
          permissionSound?.stop();
        }
      });
    }

    // ── Start proxy ─────────────────────────────────────────────────────────
    if (verbose) console.log(`[waifu] Starting proxy (provider: ${provider}, model: ${model})...`);

    const proxy = await startProxyServer({
      provider,
      model,
      apiKey,
      authToken,
      port: opts.port ? parseInt(opts.port, 10) : undefined,
      detector,
    });

    console.log(
      `\x1b[32m✓ Proxy started\x1b[0m on http://${proxy.host}:${proxy.port} → ${provider} (${model})`
    );

    const healthy = await waitForHealth(proxy.host, proxy.port);
    if (!healthy) {
      console.error("\x1b[31m✗ Proxy health check failed\x1b[0m");
      await proxy.stop();
      process.exit(1);
    }

    if (opts.proxyOnly) {
      console.log(
        "\n\x1b[33mProxy-only mode.\x1b[0m Use these env vars with claude:\n" +
        `  ANTHROPIC_AUTH_TOKEN=${authToken}\n` +
        `  ANTHROPIC_BASE_URL=http://${proxy.host}:${proxy.port}\n`
      );
      process.on("SIGINT", async () => { await proxy.stop(); process.exit(0); });
      process.on("SIGTERM", async () => { await proxy.stop(); process.exit(0); });
      return;
    }

    // ── Launch claude-code ──────────────────────────────────────────────────
    if (verbose) console.log("[waifu] Launching claude...");

    const skipArgs = new Set([
      "--provider", opts.provider,
      "--key", cliKey,
      "--nim-key", opts.nimKey,
      "--openrouter-key", opts.openrouterKey,
      "--groq-key", opts.groqKey,
      "--model", opts.model,
      "--port", opts.port,
      "--no-waifu",
      "--no-faaah",
      "--proxy-only",
      "--verbose",
    ]);

    const claudeArgs = process.argv.slice(2).filter((arg) => !skipArgs.has(arg));

    const child = spawn("claude", claudeArgs, {
      stdio: "inherit",
      env: {
        ...process.env,
        ANTHROPIC_AUTH_TOKEN: authToken,
        ANTHROPIC_BASE_URL: `http://${proxy.host}:${proxy.port}`,
        CLAUDE_CODE_SKIP_UPDATE_CHECK: "1",
      },
      shell: process.platform === "win32",
    });

    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        console.error(
          "\x1b[31m✗ 'claude' CLI not found.\x1b[0m\n\n" +
          "Install it first:\n" +
          "  npm install -g @anthropic-ai/claude-code\n"
        );
      } else {
        console.error(`\x1b[31m✗ Failed to start claude: ${err.message}\x1b[0m`);
      }
      permissionSound?.dispose();
      proxy.stop().then(() => process.exit(1));
    });

    child.on("exit", async (code) => {
      permissionSound?.dispose();
      await proxy.stop();
      process.exit(code ?? 0);
    });

    const cleanup = async () => {
      child.kill();
      permissionSound?.dispose();
      await proxy.stop();
      process.exit(0);
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  });

// ── Config subcommand ─────────────────────────────────────────────────────────

program
  .command("config")
  .description("View or update waifu configuration")
  .option("--provider <name>", "Set default provider")
  .option("--key <key>", "Set API key for the current/specified provider")
  .option("--nim-key <key>", "Set NVIDIA NIM API key")
  .option("--openrouter-key <key>", "Set OpenRouter API key")
  .option("--groq-key <key>", "Set Groq API key")
  .option("--model <model>", "Set default model")
  .option("--reset", "Reset all configuration")
  .action((opts) => {
    if (opts.reset) {
      saveConfig({});
      console.log("✓ Configuration reset.");
      return;
    }

    const cfg = loadConfig();
    let changed = false;

    if (opts.provider) { cfg.provider = opts.provider as ProviderName; changed = true; }
    if (opts.model) { cfg.model = opts.model; changed = true; }
    if (opts.nimKey) { cfg.nimApiKey = opts.nimKey; changed = true; }
    if (opts.openrouterKey) { cfg.openrouterApiKey = opts.openrouterKey; changed = true; }
    if (opts.groqKey) { cfg.groqApiKey = opts.groqKey; changed = true; }
    if (opts.key) {
      const provider = cfg.provider ?? "nim";
      saveApiKey(provider, opts.key);
      changed = true;
    }

    if (changed) {
      saveConfig(cfg);
      console.log(`✓ Configuration saved to ${getConfigFile()}`);
      return;
    }

    // Show current config
    const activeProvider = cfg.provider ?? "nim";
    const mask = (k?: string) =>
      k ? k.slice(0, 6) + "..." + k.slice(-4) : "\x1b[33m(not set)\x1b[0m";

    console.log("\n\x1b[1mwaifu configuration\x1b[0m");
    console.log(`  Config file : ${getConfigFile()}`);
    console.log(`  Provider    : ${activeProvider}`);
    console.log(`  Model       : ${cfg.model ?? `${PROVIDER_DEFAULT_MODELS[activeProvider]} (default)`}`);
    console.log(`\n  API Keys:`);
    console.log(`    NIM         : ${mask(cfg.nimApiKey)}`);
    console.log(`    OpenRouter  : ${mask(cfg.openrouterApiKey)}`);
    console.log(`    Groq        : ${mask(cfg.groqApiKey)}`);
    console.log(`    Ollama      : (no key needed)`);
    console.log("");
  });

// ── Providers subcommand ──────────────────────────────────────────────────────

program
  .command("providers")
  .description("List all supported providers and their default models")
  .action(() => {
    console.log("\n\x1b[1mSupported providers\x1b[0m\n");
    const info: Record<ProviderName, { url: string; free: string }> = {
      nim: {
        url: "https://build.nvidia.com/settings/api-keys",
        free: "Free tier available",
      },
      openrouter: {
        url: "https://openrouter.ai/keys",
        free: "Free models available",
      },
      groq: {
        url: "https://console.groq.com/keys",
        free: "Free tier available",
      },
      ollama: {
        url: "https://ollama.com",
        free: "Fully local — no API key needed",
      },
    };

    for (const name of PROVIDER_NAMES) {
      const { url, free } = info[name];
      console.log(`  \x1b[36m${name.padEnd(12)}\x1b[0m default: ${PROVIDER_DEFAULT_MODELS[name]}`);
      console.log(`               ${free}`);
      console.log(`               Keys: \x1b[2m${url}\x1b[0m`);
      console.log("");
    }

    console.log("  Use a provider:  waifu --provider <name>");
    console.log("  Save a key:      waifu config --<name>-key <key>\n");
  });

// ── Helpers ───────────────────────────────────────────────────────────────────

function keyHelpText(provider: ProviderName): string {
  const sources: Record<ProviderName, string> = {
    nim:
      "Provide your key:\n" +
      "  waifu --provider nim --key nvapi-xxx\n" +
      "  export NIM_API_KEY=nvapi-xxx\n\n" +
      "Get a free key at: \x1b[36mhttps://build.nvidia.com/settings/api-keys\x1b[0m",
    openrouter:
      "Provide your key:\n" +
      "  waifu --provider openrouter --key sk-or-xxx\n" +
      "  export OPENROUTER_API_KEY=sk-or-xxx\n\n" +
      "Get a free key at: \x1b[36mhttps://openrouter.ai/keys\x1b[0m",
    groq:
      "Provide your key:\n" +
      "  waifu --provider groq --key gsk-xxx\n" +
      "  export GROQ_API_KEY=gsk-xxx\n\n" +
      "Get a free key at: \x1b[36mhttps://console.groq.com/keys\x1b[0m",
    ollama:
      "Ollama runs locally and needs no API key.\n" +
      "Install from: \x1b[36mhttps://ollama.com\x1b[0m\n" +
      "Then run: ollama pull qwen2.5-coder:7b",
  };
  return sources[provider] ?? "";
}

program.parse();
