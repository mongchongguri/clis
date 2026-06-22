import type { TerminalKind } from "../types";
import { readLocalRecord, writeLocalRecord } from "./localDatabase";

const DEFAULT_TERMINAL_DB_KEY = "default-terminal";
const TASK_TERMINALS_DB_KEY = "task-terminals";
const LEGACY_DEFAULT_TERMINAL_KEY = "build-controller.default-terminal.v1";
const LEGACY_TASK_TERMINALS_KEY = "build-controller.task-terminals.v1";

export const FALLBACK_TERMINAL: TerminalKind = "powershell";

export async function loadDefaultTerminal(): Promise<TerminalKind> {
  const stored = normalizeTerminalKind(await readLocalRecord<string>(DEFAULT_TERMINAL_DB_KEY));
  if (stored) return stored;

  const legacyTerminal = normalizeTerminalKind(localStorage.getItem(LEGACY_DEFAULT_TERMINAL_KEY));
  if (legacyTerminal) {
    await persistDefaultTerminal(legacyTerminal);
    return legacyTerminal;
  }

  return FALLBACK_TERMINAL;
}

export function persistDefaultTerminal(terminalKind: TerminalKind): Promise<void> {
  return writeLocalRecord(DEFAULT_TERMINAL_DB_KEY, terminalKind);
}

function normalizeTaskTerminals(value: Record<string, string>): Record<string, TerminalKind> {
  return Object.fromEntries(
    Object.entries(value)
      .map(([taskId, terminalKind]) => [taskId, normalizeTerminalKind(terminalKind)])
      .filter((entry): entry is [string, TerminalKind] => Boolean(entry[1])),
  );
}

function loadLegacyTaskTerminals(): Record<string, TerminalKind> {
  const raw = localStorage.getItem(LEGACY_TASK_TERMINALS_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return normalizeTaskTerminals(parsed);
  } catch {
    return {};
  }
}

export async function loadTaskTerminals(): Promise<Record<string, TerminalKind>> {
  const stored = await readLocalRecord<Record<string, string>>(TASK_TERMINALS_DB_KEY);
  if (stored && typeof stored === "object") {
    return normalizeTaskTerminals(stored);
  }

  const legacyTerminals = loadLegacyTaskTerminals();
  if (Object.keys(legacyTerminals).length) {
    await persistTaskTerminals(legacyTerminals);
  }
  return legacyTerminals;
}

export function persistTaskTerminals(terminals: Record<string, TerminalKind>): Promise<void> {
  return writeLocalRecord(TASK_TERMINALS_DB_KEY, terminals);
}

function normalizeTerminalKind(value: string | null): TerminalKind | null {
  if (value === "git_bash" || value === "windows_terminal" || value === "powershell") {
    return value;
  }
  return null;
}
