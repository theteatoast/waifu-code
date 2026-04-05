/**
 * Command parsing utilities for API optimizations.
 * Port of Python command_utils.py from the proxy server.
 */
/**
 * Extract the command prefix for fast prefix detection.
 * Returns the command prefix (e.g., "git", "git commit", "npm install")
 * or "none" if no valid command found.
 */
export declare function extractCommandPrefix(command: string): string;
/**
 * Extract file paths from a command locally.
 * Returns filepath extraction result in <filepaths> format.
 */
export declare function extractFilepathsFromCommand(command: string, _output: string): string;
