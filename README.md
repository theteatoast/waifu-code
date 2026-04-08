# waifu CLI

A streamlined proxy and wrapper for Claude Code that transparently routes API requests through your choice of AI provider, eliminating the need for complex Python proxy setups.

By default, it uses NVIDIA NIM with `moonshotai/kimi-k2-thinking` for intelligent responses and natively supports Anthropic streaming APIs.

## Installation

First, ensure you have the official Claude Code CLI installed:

```bash
npm install -g @anthropic-ai/claude-code
```

> **Note:** Claude Code has moved to a native installer in recent versions. If you see a prompt to update, follow it — it won't break waifu.

Then, install the waifu-code CLI globally:

```bash
npm install -g waifu-code
```

## Providers

waifu now supports multiple AI providers. The original NVIDIA NIM is the default, but you can switch with a single flag:

| Provider | Free? | Works with Claude Code? | Notes |
|---|---|---|---|
| NVIDIA NIM (default) | Free tier | ✓ Yes | Best free option, high token limits |
| OpenRouter | Free models available | ✓ Yes | Recommended — no token size limits |
| Groq | Free tier | ✗ Partial | TPM too low for large contexts |
| Ollama | Completely free | ⚠ Depends | Needs 32b+ for reliable tool use |

## Usage

Simply run:

```bash
waifu
```

On first launch, it will prompt you for your API key. This key is saved automatically to `~/.waifu/config.json`.

`waifu` will immediately start the integrated TypeScript proxy in the background on a random available port and securely launch your locally-installed `claude-code` CLI natively. No manual configuration or `$env` modifications are required!

### Using a different provider

```bash
# NVIDIA NIM (original default)
waifu --provider nim --key nvapi-xxx

# OpenRouter — recommended free option
waifu --provider openrouter --key sk-or-xxx --model openrouter/free

# OpenRouter with a specific model
waifu --provider openrouter --key sk-or-xxx --model nvidia/nemotron-3-super-120b-a12b:free

# Groq (simple queries only)
waifu --provider groq --key gsk-xxx --model llama-3.1-8b-instant

# Ollama — fully local, no key needed
waifu --provider ollama --model qwen2.5:32b
```

### Options

```
Usage: waifu [options]

Run the Claude Code CLI through your chosen AI provider proxy.

Options:
  -v, --version              Output the current version
  --provider <n>             AI provider: nim, openrouter, groq, ollama (default: nim)
  --key <key>                API key for the chosen provider (saved automatically)
  --nim-key <key>            NVIDIA NIM API key (shorthand)
  --openrouter-key <key>     OpenRouter API key (shorthand)
  --groq-key <key>           Groq API key (shorthand)
  --model <model>            Model to use (overrides per-provider default)
  --port <port>              Port to run the proxy on (default: auto)
  --proxy-only               Start only the proxy server without launching claude
  --no-waifu                 Disable the waifu overlay
  --no-faaah                 Disable permission prompt sound alert
  --verbose                  Enable verbose logging for debugging
  -h, --help                 Display help for command

Commands:
  config                     View or update saved configuration
  providers                  List all supported providers and default models
```

### Saving your config

```bash
# Save provider + model so you never have to type flags again
waifu config --provider openrouter --model openrouter/free

# View current saved config
waifu config

# Reset everything
waifu config --reset
```

### Permission prompt sound alert

If `public/faaah.mp3` exists, waifu will play it when Claude Code enters a permission-gated step (for example, waiting for tool-use approval).

- Trigger: starts when a permission event is detected.
- Repeat: replays every few seconds until the session resumes normal output.
- Stop: automatically stops when output returns to `thinking`/`idle`/completion.
- Missing player/file: waifu continues normally and prints a one-time warning.
- Disable alert: run with `--no-faaah`.

Cross-platform playback backends:
- Windows: PowerShell `Media.SoundPlayer`
- macOS: `afplay`
- Linux: `paplay`, fallback to `aplay`, then `ffplay`

## Provider notes

### OpenRouter

The most reliable free option. `openrouter/free` automatically picks from all currently available free models:

```bash
waifu --provider openrouter --key sk-or-xxx --model openrouter/free
```

Free model names change over time — if you get a 404 on a specific model name, switch to `openrouter/free` or check [openrouter.ai/models](https://openrouter.ai/models) for models marked `:free`.

**Recommended free models that work well with Claude Code:**
- `nvidia/nemotron-3-super-120b-a12b:free` — large, reads files autonomously, good tool use
- `deepseek/deepseek-r1:free` — strong reasoning
- `openrouter/free` — auto-selects, always available

### Groq

Groq's free tier caps at 6k–12k tokens per minute depending on the model. Claude Code's system prompt alone is ~50k tokens, so you'll hit this limit immediately on any large context operation like `@src`.

```
Error: Request too large — Limit 6000, Requested 53008
```

Groq works fine for short standalone queries but is not suitable for full Claude Code agentic use on the free tier.

### Ollama (local)

Ollama runs models entirely on your machine — no internet, no API key, no cost.

**Setup:**
1. Download from [ollama.com](https://ollama.com)
2. Pull a model: `ollama pull qwen2.5:32b`
3. On Linux, start the server first: `ollama serve`

**Model guide by RAM:**

| RAM | Recommended | Command |
|---|---|---|
| 16GB | `qwen2.5:14b` or `mistral-nemo` | `ollama pull qwen2.5:14b` |
| 32GB | `qwen2.5:32b` | `ollama pull qwen2.5:32b` |
| 64GB+ | `qwen2.5:72b` | `ollama pull qwen2.5:72b` |

**Known limitations with small models (below 32b):**

- Models may hallucinate tool names not in Claude Code's schema (e.g. `Glob`, `simplify`, `GloballySearch`) — these silently do nothing
- Models tend to ask clarifying questions instead of reading files autonomously
- Tool call formatting is inconsistent

waifu handles one common Ollama issue automatically: some models output tool calls as raw JSON text instead of the structured API format. The proxy detects and converts both formats:
- Bullet+XML: `● <function=Name><parameter=key>value</parameter>`
- Plain JSON: `{ "name": "ToolName", "arguments": { ... } }`

For reliable agentic use locally, 32b+ models are recommended.

## How It Works

This tool is a drop-in replacement for the original Python proxy server. It relies on a hyper-efficient native NodeJS integration:

1. Intercepts Anthropic Server-Sent Events (SSE).
2. Converts Claude's messages format to OpenAI-compatible JSON (which all supported providers speak).
3. Fixes Anthropic API quirks (like `?beta=true` queries and streaming header strictness) seamlessly underneath the hood.
4. Auto-detects and preserves `<think>` tags returned by supported models without breaking the CLI UI experience.
5. Short-circuits trivial requests (quota checks, title generation, suggestion mode) locally without hitting any API.
6. Detects raw-text tool calls from local models and converts them to proper tool use blocks.