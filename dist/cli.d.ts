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
export {};
