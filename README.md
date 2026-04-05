# waifu CLI

A streamlined proxy and wrapper for Claude Code that transparently routes API requests through NVIDIA NIM, eliminating the need for complex Python proxy setups. 

By default, it uses `moonshotai/kimi-k2-thinking` for intelligent responses and natively supports Anthropic streaming APIs.

## Installation

First, ensure you have the official Claude Code CLI installed:

```bash
npm install -g @anthropic-ai/claude-code
```

Then, install the waifu-code CLI globally:

```bash
npm install -g waifu-code
```

## Usage

Simply run:

```bash
waifu
```

On first launch, it will prompt you for your NVIDIA NIM API key. This key is saved automatically to `~/.waifu/config.json`.

`waifu` will immediately start the integrated TypeScript proxy in the background on a random available port and securely launch your locally-installed `claude-code` CLI natively. No manual configuration or `$env` modifications are required!

### Options

```bash
Usage: waifu [options]

Run the Claude Code CLI through the NVIDIA NIM proxy.

Options:
  -v, --version           Output the current version
  -k, --nim-key <key>     NVIDIA NIM API key (saved automatically)
  -m, --model <model>     Specific NIM model to use (default: moonshotai/kimi-k2-thinking)
  -p, --port <port>       Port to run the proxy on (default: auto)
  --proxy-only            Start only the proxy server without launching claude
  --verbose               Enable verbose logging for debugging
  -h, --help              Display help for command
```

## How It Works

This tool is a drop-in replacement for the original Python proxy server. It relies on a hyper-efficient native NodeJS integration:

1. Intercepts Anthropic Server-Sent Events (SSE).
2. Converts Claude's messages format directly to NIM compatible JSON.
3. Fixes Anthropic API quirks (like `?beta=true` queries and streaming header strictness) seamlessly underneath the hood.
4. Auto-detects and preserves `<think>` tags returned by supported models without breaking the CLI UI experience.
