#!/usr/bin/env node

/**
 * waifu — Free coding assistant CLI.
 *
 * Starts an embedded proxy server that translates Anthropic API
 * requests to NVIDIA NIM, then launches claude-code CLI with
 * the proxy configured automatically.
 *
 * Usage:
 *   waifu                      # Use saved NIM key
 *   waifu --nim-key nvapi-xxx  # Provide NIM key (saved for next time)
 *   waifu config               # Show current configuration
 *   waifu config --nim-key xxx # Save NIM key without starting
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import {
  resolveNimApiKey,
  resolveModel,
  loadConfig,
  saveConfig,
  getConfigFile,
} from "./config.js";
import { startProxyServer, waitForHealth } from "./proxy/server.js";
import { DEFAULT_MODEL } from "./providers/nim.js";
import { EventDetector } from "./observer/eventDetector.js";
import { OverlayRenderer } from "./waifu/overlayRenderer.js";



const VERSION = "1.0.0";

const program = new Command();

program
  .name("waifu")
  .description("Free coding assistant — Claude Code powered by NVIDIA NIM")
  .version(VERSION)
  .enablePositionalOptions()
  .passThroughOptions();

// ── Main command (default) ──
program
  .option("--nim-key <key>", "NVIDIA NIM API key")
  .option("--model <model>", `Model to use (default: ${DEFAULT_MODEL})`)
  .option("--port <port>", "Proxy server port (default: auto)")
  .option("--proxy-only", "Start proxy server only (don't launch claude)")
  .option("--no-waifu", "Disable waifu overlay and sounds")
  .option("--verbose", "Enable verbose logging")

  .action(async (opts) => {
    const nimKey = resolveNimApiKey(opts.nimKey);
    const model = resolveModel(opts.model);
    const verbose = opts.verbose ?? false;

    if (!nimKey) {
      console.error(
        "\x1b[31m✗ No NVIDIA NIM API key found.\x1b[0m\n\n" +
        "Provide your key in one of these ways:\n" +
        "  waifu --nim-key nvapi-xxx\n" +
        "  waifu config --nim-key nvapi-xxx\n" +
        "  export NIM_API_KEY=nvapi-xxx\n\n" +
        "Get a free key at: \x1b[36mhttps://build.nvidia.com/settings/api-keys\x1b[0m"
      );
      process.exit(1);
    }

    // Save the key for next time if provided via CLI
    if (opts.nimKey) {
      const config = loadConfig();
      config.nimApiKey = opts.nimKey;
      if (opts.model) config.model = opts.model;
      saveConfig(config);
      if (verbose) console.log(`[waifu] Config saved to ${getConfigFile()}`);
    }

    // Generate internal auth token
    const authToken = randomUUID();

    // Initialize waifu overlay if enabled
    const useWaifu = opts.waifu !== false;
    let detector: EventDetector | undefined;
    if (useWaifu) {
      detector = new EventDetector();
      const renderer = new OverlayRenderer(true);
      detector.on("event", (ev) => renderer.render(ev as any));
    }

    // Start proxy server
    if (verbose) console.log("[waifu] Starting proxy server...");

    const proxy = await startProxyServer({
      nimApiKey: nimKey,
      model,
      authToken,
      port: opts.port ? parseInt(opts.port, 10) : undefined,
      detector,
    });


    console.log(
      `\x1b[32m✓ Proxy started\x1b[0m on http://${proxy.host}:${proxy.port} → NIM (${model})`
    );

    // Wait for health check
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
      // Keep running until interrupted
      process.on("SIGINT", async () => {
        console.log("\n[waifu] Shutting down...");
        await proxy.stop();
        process.exit(0);
      });
      process.on("SIGTERM", async () => {
        await proxy.stop();
        process.exit(0);
      });
      return;
    }

    // Launch claude-code CLI
    if (verbose) console.log("[waifu] Launching claude...");

    const claudeCmd = "claude";
    const claudeArgs = process.argv.slice(2).filter(
      (arg) =>
        !arg.startsWith("--nim-key") &&
        !arg.startsWith("--model") &&
        !arg.startsWith("--port") &&
        !arg.startsWith("--proxy-only") &&
        !arg.startsWith("--verbose") &&
        // Also filter out the values for key/model/port
        arg !== opts.nimKey &&
        arg !== opts.model &&
        arg !== opts.port &&
        arg !== "--no-waifu"
    );

    const child = spawn(claudeCmd, claudeArgs, {
      stdio: "inherit",
      env: {
        ...process.env,
        ANTHROPIC_AUTH_TOKEN: authToken,
        ANTHROPIC_BASE_URL: `http://${proxy.host}:${proxy.port}`,
        // Disable the update check (we're not the official CLI)
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
      proxy.stop().then(() => process.exit(1));
    });

    child.on("exit", async (code) => {
      await proxy.stop();
      process.exit(code ?? 0);
    });

    // Cleanup on signals
    const cleanup = async () => {
      child.kill();
      await proxy.stop();
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  });

// ── Config subcommand ──
program
  .command("config")
  .description("View or update waifu configuration")
  .option("--nim-key <key>", "Set NVIDIA NIM API key")
  .option("--model <model>", "Set default model")
  .option("--reset", "Reset all configuration")
  .action((opts) => {
    if (opts.reset) {
      saveConfig({});
      console.log("✓ Configuration reset.");
      return;
    }

    if (opts.nimKey || opts.model) {
      const config = loadConfig();
      if (opts.nimKey) config.nimApiKey = opts.nimKey;
      if (opts.model) config.model = opts.model;
      saveConfig(config);
      console.log(`✓ Configuration saved to ${getConfigFile()}`);
      return;
    }

    // Show current config
    const config = loadConfig();
    const key = config.nimApiKey;
    console.log("\n\x1b[1mwaifu configuration\x1b[0m");
    console.log(`  Config file: ${getConfigFile()}`);
    console.log(
      `  NIM API Key: ${key ? key.slice(0, 8) + "..." + key.slice(-4) : "\x1b[33m(not set)\x1b[0m"}`
    );
    console.log(`  Model:       ${config.model ?? `${DEFAULT_MODEL} (default)`}`);
    console.log("");
  });

program.parse();
