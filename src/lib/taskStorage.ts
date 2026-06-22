import type { SavedTask } from "../types";
import { readLocalRecord, writeLocalRecord } from "./localDatabase";

const TASKS_DB_KEY = "tasks";
const LEGACY_STORAGE_KEY = "build-controller.tasks.v1";
export const DEFAULT_GROUP = "Default";

export const emptyTaskForm: SavedTask = {
  id: "",
  group: DEFAULT_GROUP,
  name: "",
  cwd: "",
  command: "",
};

type StoredTask = Omit<SavedTask, "group"> & {
  group?: string;
};

function normalizeTask(task: StoredTask): SavedTask {
  return {
    ...task,
    group: task.group?.trim() || DEFAULT_GROUP,
  };
}

function loadLegacyTasks(): SavedTask[] {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as StoredTask[];
    return Array.isArray(parsed) ? parsed.map(normalizeTask) : [];
  } catch {
    return [];
  }
}

export async function loadTasks(): Promise<SavedTask[]> {
  const stored = await readLocalRecord<StoredTask[]>(TASKS_DB_KEY);
  if (Array.isArray(stored)) {
    return stored.map(normalizeTask);
  }

  const legacyTasks = loadLegacyTasks();
  if (legacyTasks.length) {
    await persistTasks(legacyTasks);
  }
  return legacyTasks;
}

export function persistTasks(tasks: SavedTask[]): Promise<void> {
  return writeLocalRecord(TASKS_DB_KEY, tasks);
}
