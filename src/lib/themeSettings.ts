import type { AppTheme } from "../types";
import { readLocalRecord, writeLocalRecord } from "./localDatabase";

const THEME_DB_KEY = "theme";
export const FALLBACK_THEME: AppTheme = "light";

export async function loadTheme(): Promise<AppTheme> {
  return normalizeTheme(await readLocalRecord<string>(THEME_DB_KEY)) ?? FALLBACK_THEME;
}

export function persistTheme(theme: AppTheme): Promise<void> {
  return writeLocalRecord(THEME_DB_KEY, theme);
}

function normalizeTheme(value: string | null): AppTheme | null {
  if (value === "light" || value === "dark") return value;
  return null;
}
