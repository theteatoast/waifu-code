# waifu CLI

A streamlined proxy and wrapper for Claude Code that transparently routes API requests through your choice of AI provider — no complex setup required.

By default it uses NVIDIA NIM with `moonshotai/kimi-k2-thinking`, but you can switch to OpenRouter, Groq, or a fully local Ollama instance with a single flag.

## Installation

First, ensure you have the official Claude Code CLI installed:

```bash
npm install -g @anthropic-ai/claude-code
```

Then install the waifu-code CLI globally:

```bash
npm install -g waifu-code
```

## Providers

waifu supports four providers. Pick whichever suits you:

| Provider | Free? | Best for | Get a key |
|---|---|---|---|
| NVIDIA NIM (default) | Free tier | `kimi-k2-thinking`, high token limits | [build.nvidia.com](https://build.nvidia.com/settings/api-keys) |
| OpenRouter | Free models available | 200+ models, varied size limits | [openrouter.ai/keys](https://openrouter.ai/keys) |
| Groq | Free tier | Fast inference (note: low TPM limits on free tier (around 6000)) | [console.groq.com/keys](https://console.groq.com/keys) |
| Ollama | Completely free | 100% local, no internet or API key needed | [ollama.com](https://ollama.com) |

> **Groq note:** The free tier cap (~6k–12k TPM depending on model) is too small for Claude Code's system prompt (~50k tokens). Groq works fine for simple queries but will error on large context operations like `@src`. Use OpenRouter or Ollama for full functionality.

## Usage

```bash
# NVIDIA NIM (original default)
waifu --provider nim --key nvapi-xxx

# OpenRouter — recommended for free usage
waifu --provider openrouter --key sk-or-xxx --model openrouter/free

# OpenRouter with a specific model
waifu --provider openrouter --key sk-or-xxx --model nvidia/nemotron-3-super-120b-a12b:free

# Groq
waifu --provider groq --key gsk-xxx --model llama-3.1-8b-instant

# Ollama — fully local, no key needed
waifu --provider ollama --model qwen2.5-coder:7b
```

Keys are saved on first use to `~/.waifu/config.json` so next time you just run:

```bash
waifu
```

## Ollama Setup (local, fully free)

1. Install Ollama from [ollama.com](https://ollama.com)

2. Pull a model based on your available RAM:

   | RAM | Recommended model | Command |
   |---|---|---|
   | 8GB | qwen2.5-coder:7b | `ollama pull qwen2.5-coder:7b` |
   | 16GB | qwen2.5-coder:14b | `ollama pull qwen2.5-coder:14b` |
   | 32GB+ | qwen2.5-coder:32b | `ollama pull qwen2.5-coder:32b` |

3. Run waifu:

   ```bash
   waifu --provider ollama --model qwen2.5-coder:7b
   ```

On Linux you may need to start Ollama first:

```bash
ollama serve  # run in a separate terminal
```

## Saving your configuration

```bash
# Save provider and model so you never have to type flags again
waifu config --provider openrouter --model openrouter/free

# View current config
waifu config

# See all providers and their default models
waifu providers

# Reset everything
waifu config --reset
```

## All options

```bash
Usage: waifu [options]

Options:
  --provider <name>        AI provider: nim, openrouter, groq, ollama (default: nim)
  --key <key>              API key for the chosen provider (saved automatically)
  --nim-key <key>          NVIDIA NIM API key (shorthand)
  --openrouter-key <key>   OpenRouter API key (shorthand)
  --groq-key <key>         Groq API key (shorthand)
  --model <model>          Model to use (overrides per-provider default)
  --port <port>            Proxy server port (default: auto)
  --proxy-only             Start proxy only, don't launch claude
  --no-waifu               Disable the waifu overlay
  --verbose                Enable verbose logging
  -v, --version            Output the current version
  -h, --help               Display help

Commands:
  config                   View or update configuration
  providers                List all supported providers and default models
```

## How It Works

waifu starts a local HTTP proxy on a random free port, then launches Claude Code with `ANTHROPIC_BASE_URL` pointing at that proxy. Claude Code never knows the difference.

The proxy:

1. Intercepts Anthropic-format requests from Claude Code
2. Converts them to OpenAI chat completions format (which all supported providers speak)
3. Streams the response back as Anthropic-format SSE events
4. Handles `<think>` tags from reasoning models transparently
5. Short-circuits trivial requests (quota checks, title generation) locally to save API calls

## Testing the proxy without Claude Code

```bash
waifu --provider ollama --proxy-only
```

This prints the proxy URL and auth token so you can test with curl directly.