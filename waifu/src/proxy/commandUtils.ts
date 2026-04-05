/**
 * Command parsing utilities for API optimizations.
 * Port of Python command_utils.py from the proxy server.
 */

/**
 * Extract the command prefix for fast prefix detection.
 * Returns the command prefix (e.g., "git", "git commit", "npm install")
 * or "none" if no valid command found.
 */
export function extractCommandPrefix(command: string): string {
  if (command.includes("`") || command.includes("$(")) {
    return "command_injection_detected";
  }

  try {
    // Simple shell-like splitting (not full shlex but good enough)
    const parts = shellSplit(command);
    if (parts.length === 0) return "none";

    // Skip env var assignments
    let cmdStart = 0;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i]!.includes("=") && !parts[i]!.startsWith("-")) {
        cmdStart = i + 1;
      } else {
        break;
      }
    }

    if (cmdStart >= parts.length) return "none";

    const cmdParts = parts.slice(cmdStart);
    if (cmdParts.length === 0) return "none";

    const firstWord = cmdParts[0]!;
    const twoWordCommands = new Set([
      "git", "npm", "docker", "kubectl", "cargo", "go", "pip", "yarn",
    ]);

    if (twoWordCommands.has(firstWord) && cmdParts.length > 1) {
      const secondWord = cmdParts[1]!;
      if (!secondWord.startsWith("-")) {
        return `${firstWord} ${secondWord}`;
      }
      return firstWord;
    }

    if (cmdStart > 0) {
      return parts.slice(0, cmdStart).join(" ") + " " + firstWord;
    }
    return firstWord;
  } catch {
    const split = command.split(/\s+/);
    return split[0] || "none";
  }
}

/**
 * Extract file paths from a command locally.
 * Returns filepath extraction result in <filepaths> format.
 */
export function extractFilepathsFromCommand(
  command: string,
  _output: string
): string {
  const LISTING_COMMANDS = new Set([
    "ls", "dir", "find", "tree", "pwd", "cd", "mkdir", "rmdir", "rm",
  ]);
  const READING_COMMANDS = new Set([
    "cat", "head", "tail", "less", "more", "bat", "type",
  ]);

  try {
    const parts = shellSplit(command);
    if (parts.length === 0) return "<filepaths>\n</filepaths>";

    // Get base command name (handle paths like /usr/bin/cat)
    const baseCmd = parts[0]!
      .split("/").pop()!
      .split("\\").pop()!
      .toLowerCase();

    if (LISTING_COMMANDS.has(baseCmd)) {
      return "<filepaths>\n</filepaths>";
    }

    if (READING_COMMANDS.has(baseCmd)) {
      const filepaths = parts.slice(1).filter((p) => !p.startsWith("-"));
      if (filepaths.length > 0) {
        return `<filepaths>\n${filepaths.join("\n")}\n</filepaths>`;
      }
      return "<filepaths>\n</filepaths>";
    }

    if (baseCmd === "grep") {
      const flagsWithArgs = new Set(["-e", "-f", "-m", "-A", "-B", "-C"]);
      let patternViaFlag = false;
      const positional: string[] = [];
      let skipNext = false;

      for (const part of parts.slice(1)) {
        if (skipNext) { skipNext = false; continue; }
        if (part.startsWith("-")) {
          if (flagsWithArgs.has(part)) {
            if (part === "-e" || part === "-f") patternViaFlag = true;
            skipNext = true;
          }
          continue;
        }
        positional.push(part);
      }

      const filepaths = patternViaFlag ? positional : positional.slice(1);
      if (filepaths.length > 0) {
        return `<filepaths>\n${filepaths.join("\n")}\n</filepaths>`;
      }
      return "<filepaths>\n</filepaths>";
    }

    return "<filepaths>\n</filepaths>";
  } catch {
    return "<filepaths>\n</filepaths>";
  }
}

/** Simple shell-like argument splitting. */
function shellSplit(cmd: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  for (const ch of cmd) {
    if (escape) {
      current += ch;
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (/\s/.test(ch) && !inSingle && !inDouble) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }

  if (current) parts.push(current);
  return parts;
}
