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
export {};
