/**
 * Shared command routing for "module.action" dispatch.
 *
 * Replaces the duplicated `command.indexOf(".")` / `command.slice(...)` blocks
 * that every module router previously reimplemented.
 */

import { jsonResponse } from "./supabase.ts";

export interface ParsedCommand {
  module: string;
  action: string;
}

/**
 * Parse a "module.action" command string.
 *
 * Returns a ParsedCommand on success, or a 400 Response describing the error.
 * `help` is appended to error messages to list the available commands.
 */
export function parseCommand(
  command: unknown,
  help: string,
): ParsedCommand | Response {
  if (!command || typeof command !== "string") {
    return jsonResponse(
      {
        error:
          `command is required (format: "module.action"). Available: ${help}`,
      },
      400,
    );
  }

  const dotIndex = command.indexOf(".");
  if (dotIndex <= 0 || dotIndex === command.length - 1) {
    return jsonResponse(
      {
        error:
          `invalid command format. Use "module.action". Available: ${help}`,
      },
      400,
    );
  }

  return {
    module: command.slice(0, dotIndex),
    action: command.slice(dotIndex + 1),
  };
}

/**
 * Build a "module.action, module.action, ..." help string from a registry of
 * modules keyed by name with an `actions` string array.
 */
export function buildHelpText(
  modules: Record<string, { actions: string[] }>,
): string {
  const commands: string[] = [];
  for (const [mod, { actions }] of Object.entries(modules)) {
    for (const action of actions) {
      commands.push(`${mod}.${action}`);
    }
  }
  return commands.join(", ");
}
