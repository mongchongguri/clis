import { readLocalRecord, writeLocalRecord } from "./localDatabase";

const GROUP_ORDER_KEY = "group-order";

function normalizeGroupOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((group): group is string => typeof group === "string")
    .map((group) => group.trim())
    .filter(Boolean);
}

export async function loadGroupOrder(): Promise<string[]> {
  const stored = await readLocalRecord<unknown>(GROUP_ORDER_KEY);
  return normalizeGroupOrder(stored);
}

export function persistGroupOrder(groupOrder: string[]): Promise<void> {
  return writeLocalRecord(GROUP_ORDER_KEY, normalizeGroupOrder(groupOrder));
}
