import { Cpu, Download, ListChecks, MemoryStick, Moon, Sun, Upload, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Gauge, LoaderCircle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { DownloadCloud } from "lucide-react";
import { AppToolbar } from "./components/AppToolbar";
import { CommandForm } from "./components/CommandForm";
import { LogPanel } from "./components/LogPanel";
import { TaskList } from "./components/TaskList";
import { validateOnClient } from "./lib/commandValidation";
import { loadGroupOrder, persistGroupOrder } from "./lib/groupOrderSettings";
import { DEFAULT_GROUP, emptyTaskForm, loadTasks, persistTasks } from "./lib/taskStorage";
import {
  FALLBACK_TERMINAL,
  loadDefaultTerminal,
  loadTaskTerminals,
  persistDefaultTerminal,
  persistTaskTerminals,
} from "./lib/terminalSettings";
import { FALLBACK_THEME, loadTheme, persistTheme } from "./lib/themeSettings";
import appIcon from "./assets/app-mark.png";
import packageJson from "../package.json";
import type {
  AppTheme,
  LogEntry,
  RuntimeStatus,
  SavedTask,
  SystemMetrics,
  TerminalAvailability,
  TerminalKind,
  ValidationResult,
} from "./types";

type SpeedTestState = {
  checking: boolean;
  mbps?: number;
  medianMbps?: number;
  uploadMbps?: number;
  latencyMs?: number;
  receivedBytes?: number;
  sentBytes?: number;
  sampleCount?: number;
  error?: string;
};

type UpdateState = {
  checking: boolean;
  installing: boolean;
  available?: Update;
  downloadedBytes: number;
  contentLength?: number;
  error?: string;
};

export default function App() {
  const [tasks, setTasks] = useState<SavedTask[]>([]);
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [form, setForm] = useState<SavedTask>(emptyTaskForm);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [statuses, setStatuses] = useState<Record<string, RuntimeStatus>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [terminals, setTerminals] = useState<TerminalAvailability[]>([]);
  const [defaultTerminal, setDefaultTerminal] = useState<TerminalKind>(FALLBACK_TERMINAL);
  const [taskTerminals, setTaskTerminals] = useState<Record<string, TerminalKind>>({});
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(FALLBACK_THEME);
  const [commandFormCollapsed, setCommandFormCollapsed] = useState(false);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [speedTest, setSpeedTest] = useState<SpeedTestState>({ checking: false });
  const [updateState, setUpdateState] = useState<UpdateState>({
    checking: false,
    installing: false,
    downloadedBytes: 0,
  });

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0];
  const runningTaskCount = useMemo(
    () => tasks.filter((task) => statuses[task.id]?.running).length,
    [statuses, tasks],
  );
  const clientValidation = useMemo(
    () => validateOnClient(form.cwd, form.command),
    [form.cwd, form.command],
  );
  const groups = useMemo(() => {
    const names = new Set(tasks.map((task) => task.group.trim()).filter(Boolean));
    names.add(DEFAULT_GROUP);
    const existing = groupOrder.filter((group) => names.has(group));
    const missing = [...names].filter((group) => !existing.includes(group));
    return [...existing, ...missing.sort((left, right) => left.localeCompare(right, "ko"))];
  }, [groupOrder, tasks]);

  useEffect(() => {
    if (!selectedTaskId && tasks[0]) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [tasks, selectedTaskId]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([loadTasks(), loadGroupOrder(), loadDefaultTerminal(), loadTaskTerminals(), loadTheme()])
      .then(([storedTasks, storedGroupOrder, storedDefaultTerminal, storedTaskTerminals, storedTheme]) => {
        if (cancelled) return;
        setTasks(storedTasks);
        setGroupOrder(storedGroupOrder);
        setDefaultTerminal(storedDefaultTerminal);
        setTaskTerminals(storedTaskTerminals);
        setTheme(storedTheme);
        setStorageReady(true);
      })
      .catch((error) => {
        if (cancelled) return;
        setMessage(String(error));
        setStorageReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    persistTasks(tasks).catch((error) => setMessage(String(error)));
  }, [storageReady, tasks]);

  useEffect(() => {
    if (!storageReady) return;
    persistGroupOrder(groups).catch((error) => setMessage(String(error)));
  }, [groups, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    persistDefaultTerminal(defaultTerminal).catch((error) => setMessage(String(error)));
  }, [defaultTerminal, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    persistTaskTerminals(taskTerminals).catch((error) => setMessage(String(error)));
  }, [storageReady, taskTerminals]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (!storageReady) return;
    persistTheme(theme).catch((error) => setMessage(String(error)));
  }, [storageReady, theme]);

  useEffect(() => {
    let cancelled = false;

    const checkForUpdate = async () => {
      setUpdateState((current) => ({ ...current, checking: true, error: undefined }));
      try {
        const update = await check({ timeout: 10_000 });
        if (cancelled) return;
        setUpdateState((current) => ({
          ...current,
          checking: false,
          available: update ?? undefined,
        }));
      } catch (error) {
        if (cancelled) return;
        setUpdateState((current) => ({
          ...current,
          checking: false,
          error: String(error),
        }));
      }
    };

    checkForUpdate();
    const timer = window.setInterval(checkForUpdate, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    listen<LogEntry>("task://output", (event) => {
      setLogs((current) => [...current.slice(-799), event.payload]);
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<RuntimeStatus>("task://status", (event) => {
      setStatuses((current) => ({
        ...current,
        [event.payload.task_id]: event.payload,
      }));
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    invoke<TerminalAvailability[]>("get_terminal_availability")
      .then(setTerminals)
      .catch((error) => setMessage(String(error)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      invoke<SystemMetrics>("get_system_metrics")
        .then((metrics) => {
          if (!cancelled) setSystemMetrics(metrics);
        })
        .catch(() => undefined);
    };

    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!tasks.length) return;

    let cancelled = false;
    const refresh = async () => {
      const pairs = await Promise.all(
        tasks.map(async (task) => {
          const status = await invoke<RuntimeStatus | null>("get_task_status", {
            taskId: task.id,
          });
          return [task.id, status] as const;
        }),
      );
      if (cancelled) return;
      setStatuses((current) => {
        const next = { ...current };
        for (const [taskId, status] of pairs) {
          if (status) next[taskId] = status;
        }
        return next;
      });
    };

    refresh().catch((error) => setMessage(String(error)));
    const timer = window.setInterval(() => refresh().catch(() => undefined), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tasks]);

  const chooseFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "작업 실행 폴더 선택",
    });
    if (typeof selected === "string") {
      setForm((current) => ({ ...current, cwd: selected }));
    }
  };

  const saveTask = async () => {
    if (!form.name.trim()) {
      setMessage("작업 이름을 입력해야 합니다.");
      return;
    }

    const task = {
      ...form,
      id: form.id || crypto.randomUUID(),
      group: form.group.trim() || DEFAULT_GROUP,
      name: form.name.trim(),
      cwd: form.cwd.trim(),
      command: form.command.trim(),
    };

    setTasks((current) => {
      const existing = current.findIndex((item) => item.id === task.id);
      if (existing >= 0) {
        const next = [...current];
        next[existing] = task;
        return next;
      }
      return [...current, task];
    });
    setSelectedTaskId(task.id);
    setForm(emptyTaskForm);
    setMessage("");
  };

  const editTask = (task: SavedTask) => {
    setForm(task);
    setSelectedTaskId(task.id);
  };

  const removeTask = (taskId: string) => {
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setStatuses((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    setLogs((current) => current.filter((entry) => entry.task_id !== taskId));
    if (selectedTaskId === taskId) setSelectedTaskId("");
  };

  const startTask = async (task: SavedTask) => {
    setSelectedTaskId(task.id);
    setMessage("");
    try {
      const status = await invoke<RuntimeStatus>("start_task", {
        taskId: task.id,
        cwd: task.cwd,
        command: task.command,
      });
      setStatuses((current) => ({ ...current, [task.id]: status }));
    } catch (error) {
      const message = String(error);
      setMessage(message);
      setStatuses((current) => ({
        ...current,
        [task.id]: {
          task_id: task.id,
          running: false,
          error: message,
          last_error_output: message,
        },
      }));
    }
  };

  const stopTask = async (task: SavedTask) => {
    try {
      const status = await invoke<RuntimeStatus>("stop_task", { taskId: task.id });
      setStatuses((current) => ({ ...current, [task.id]: status }));
    } catch (error) {
      setMessage(String(error));
    }
  };

  const openTaskTerminal = async (task: SavedTask, terminalKind: TerminalKind) => {
    try {
      await invoke("open_terminal", {
        cwd: task.cwd,
        terminalKind,
      });
      setMessage("");
    } catch (error) {
      setMessage(String(error));
    }
  };

  const changeTaskTerminal = (taskId: string, terminalKind: TerminalKind | "") => {
    setTaskTerminals((current) => {
      const next = { ...current };
      if (terminalKind) {
        next[taskId] = terminalKind;
      } else {
        delete next[taskId];
      }
      return next;
    });
  };

  const renameGroup = (fromGroup: string, toGroup: string) => {
    const nextGroup = toGroup.trim();
    if (!nextGroup || nextGroup === fromGroup) return;
    setTasks((current) =>
      current.map((task) => (task.group === fromGroup ? { ...task, group: nextGroup } : task)),
    );
    setForm((current) =>
      current.group === fromGroup ? { ...current, group: nextGroup } : current,
    );
    setGroupOrder((current) =>
      current.map((group) => (group === fromGroup ? nextGroup : group)),
    );
  };

  const reorderGroup = (fromGroup: string, toGroup: string, placement: "before" | "after") => {
    if (fromGroup === toGroup) return;
    setGroupOrder(() => {
      const orderedGroups = groups.filter((group) => group !== fromGroup);
      const targetIndex = orderedGroups.indexOf(toGroup);
      if (targetIndex < 0) return groups;

      const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;

      return [
        ...orderedGroups.slice(0, insertIndex),
        fromGroup,
        ...orderedGroups.slice(insertIndex),
      ];
    });
  };

  const checkInternetSpeed = async () => {
    if (speedTest.checking) return;

    setSpeedTest({ checking: true });
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), SPEED_TEST_TIMEOUT_MS);

    try {
      const latencyMs = await measureLatency(controller.signal);
      const download = await measureDownloadSpeed(controller.signal, (progress) => {
        setSpeedTest((current) => ({
          ...current,
          checking: true,
          mbps: progress.currentMbps,
          receivedBytes: progress.bytes,
          sampleCount: progress.sampleCount,
        }));
      });
      const upload = await measureUploadSpeed(controller.signal);
      setSpeedTest({
        checking: false,
        mbps: download.mbps,
        medianMbps: download.medianMbps,
        uploadMbps: upload.mbps,
        latencyMs,
        receivedBytes: download.bytes,
        sentBytes: upload.bytes,
        sampleCount: download.sampleCount,
      });
    } catch (error) {
      setSpeedTest({
        checking: false,
        error: error instanceof Error && error.name === "AbortError" ? "timeout" : "failed",
      });
    } finally {
      window.clearTimeout(timer);
    }
  };

  const installUpdate = async () => {
    const update = updateState.available;
    if (!update || updateState.installing) return;

    setUpdateState((current) => ({
      ...current,
      installing: true,
      downloadedBytes: 0,
      contentLength: undefined,
      error: undefined,
    }));

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        setUpdateState((current) => {
          if (event.event === "Started") {
            return {
              ...current,
              contentLength: event.data.contentLength,
              downloadedBytes: 0,
            };
          }
          if (event.event === "Progress") {
            return {
              ...current,
              downloadedBytes: current.downloadedBytes + event.data.chunkLength,
            };
          }
          return current;
        });
      });
      await relaunch();
    } catch (error) {
      setUpdateState((current) => ({
        ...current,
        installing: false,
        error: String(error),
      }));
    }
  };

  const visibleLogs = selectedTask ? logs.filter((entry) => entry.task_id === selectedTask.id) : [];

  return (
    <main className="app-shell">
      <AppToolbar />

      <div className="screen-actions">
        <div className="screen-brand">
          <img className="screen-brand-icon" src={appIcon} alt="" aria-hidden="true" />
          <span>Clis</span>
          <span className="screen-version">v{packageJson.version}</span>
          {updateState.available ? (
            <button
              className="update-badge"
              type="button"
              disabled={updateState.installing}
              title={updateState.installing ? "업데이트 설치 중" : `v${updateState.available.version} 업데이트 설치`}
              onClick={installUpdate}
            >
              {updateState.installing ? (
                <LoaderCircle className="metric-spin" size={11} />
              ) : (
                <DownloadCloud size={11} />
              )}
              {updateState.installing
                ? formatUpdateProgress(updateState)
                : `UPDATE ${updateState.available.version}`}
            </button>
          ) : null}
        </div>
        <div className="screen-right-tools">
          <div className="system-metrics">
            <span className="metric-pill metric-cpu" title="현재 노트북 전체 CPU 사용률">
              <Cpu size={13} />
              CPU {formatPercent(systemMetrics?.cpu_percent)}
            </span>
            <span className="metric-pill metric-memory" title="현재 노트북 전체 메모리 사용률">
              <MemoryStick size={13} />
              MEMORY {formatPercent(systemMetrics?.memory_percent)}
            </span>
            <span
              className={`metric-pill ${systemMetrics?.network_online ? "metric-net-on" : "metric-net-off"}`}
              title="실제 인터넷 연결 상태입니다. 약 2초마다 다시 확인합니다."
            >
              {systemMetrics?.network_online ? <Wifi size={13} /> : <WifiOff size={13} />}
              NET {systemMetrics?.network_online ? "ON" : "NO"}
            </span>
            <span className="speed-test-wrap">
              <button
                className={`metric-pill metric-speed-test ${typeof speedTest.mbps === "number" ? speedRatingClass(speedTest.mbps) : ""}`}
                type="button"
                aria-describedby="speed-test-popover"
                aria-label="현재 인터넷 속도 측정"
                disabled={speedTest.checking}
                onClick={checkInternetSpeed}
              >
                {speedTest.checking ? <LoaderCircle className="metric-spin" size={13} /> : <Gauge size={13} />}
                {formatSpeedTest(speedTest)}
              </button>
              <div className="speed-popover" id="speed-test-popover" role="tooltip">
                <div className="speed-popover-title">인터넷 속도 측정</div>
                {speedTest.checking ? (
                  <div className="speed-popover-grid">
                    <span>상태</span>
                    <strong>측정 중</strong>
                    <span>현재 수신</span>
                    <strong>{formatOptionalMbps(speedTest.mbps)}</strong>
                    <span>샘플</span>
                    <strong>{speedTest.sampleCount ?? 0}회</strong>
                    <span>수신 데이터</span>
                    <strong>{formatBytes(speedTest.receivedBytes)}</strong>
                  </div>
                ) : speedTest.error ? (
                  <div className="speed-popover-message">
                    {speedTest.error === "timeout" ? "측정 시간이 초과되었습니다." : "측정에 실패했습니다."}
                  </div>
                ) : typeof speedTest.mbps === "number" ? (
                  <div className="speed-popover-grid">
                    <span>상태</span>
                    <strong>{speedRatingLabel(speedTest.mbps)}</strong>
                    <span>지연 시간</span>
                    <strong>{formatLatency(speedTest.latencyMs)}</strong>
                    <span>수신 속도</span>
                    <strong>{formatMbps(speedTest.mbps)}</strong>
                    <span>중앙값</span>
                    <strong>{formatOptionalMbps(speedTest.medianMbps)}</strong>
                    <span>송신 속도</span>
                    <strong>{formatOptionalMbps(speedTest.uploadMbps)}</strong>
                    <span>샘플</span>
                    <strong>{speedTest.sampleCount ?? 0}회</strong>
                    <span>수신 데이터</span>
                    <strong>{formatBytes(speedTest.receivedBytes)}</strong>
                    <span>송신 데이터</span>
                    <strong>{formatBytes(speedTest.sentBytes)}</strong>
                  </div>
                ) : (
                  <div className="speed-popover-message">
                    클릭하면 현재 인터넷 속도와 지연시간을 측정합니다.
                  </div>
                )}
                <div className="speed-popover-note">기준: 25Mbps 미만 느림, 25-100Mbps 보통, 100Mbps 이상 빠름</div>
              </div>
            </span>
            <span className="metric-pill metric-run" title="현재 Clis에서 실행 중인 작업 수">
              <ListChecks size={13} />
              RUN {runningTaskCount}
            </span>
          </div>
          <label className="theme-switch" title="테마 변경">
            <Sun className="theme-switch-icon" size={15} />
            <input
              type="checkbox"
              checked={theme === "dark"}
              onChange={(event) => setTheme(event.target.checked ? "dark" : "light")}
            />
            <span className="theme-switch-track" aria-hidden="true">
              <span className="theme-switch-thumb" />
            </span>
            <Moon className="theme-switch-icon" size={15} />
          </label>
        </div>
      </div>

      <CommandForm
        form={form}
        groups={groups}
        validation={clientValidation}
        collapsed={commandFormCollapsed}
        onChange={setForm}
        onChooseFolder={chooseFolder}
        onSave={saveTask}
        onToggle={() => setCommandFormCollapsed((current) => !current)}
      />

      <section className="workspace">
        <TaskList
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          statuses={statuses}
          terminals={terminals}
          defaultTerminal={defaultTerminal}
          groupOrder={groups}
          taskTerminals={taskTerminals}
          onDefaultTerminalChange={setDefaultTerminal}
          onTaskTerminalChange={changeTaskTerminal}
          onSelect={setSelectedTaskId}
          onStart={startTask}
          onStop={stopTask}
          onOpenTerminal={openTaskTerminal}
          onRenameGroup={renameGroup}
          onReorderGroup={reorderGroup}
          onEdit={editTask}
          onRemove={removeTask}
        />
      </section>

      <LogPanel
        open={terminalOpen}
        task={selectedTask}
        logs={visibleLogs}
        onToggle={() => setTerminalOpen((current) => !current)}
      />
    </main>
  );
}

function formatUpdateProgress(update: UpdateState) {
  if (!update.contentLength) return "UPDATING";
  const percent = Math.min(99, Math.floor((update.downloadedBytes / update.contentLength) * 100));
  return `${percent}%`;
}

function formatPercent(value?: number) {
  return typeof value === "number" ? `${value.toFixed(0)}%` : "-";
}

const SPEED_TEST_DOWNLOAD_BYTES = 4_000_000;
const SPEED_TEST_UPLOAD_BYTES = 2_000_000;
const SPEED_TEST_MIN_DURATION_MS = 7_000;
const SPEED_TEST_TIMEOUT_MS = 14_000;

function formatSpeedTest(speed: SpeedTestState) {
  if (speed.checking) return typeof speed.mbps === "number" ? `${formatMbps(speed.mbps)} 측정 중` : "측정 중";
  if (speed.error === "timeout") return "시간 초과";
  if (speed.error) return "측정 실패";
  if (typeof speed.mbps === "number") return `${formatMbps(speed.mbps)} ${speedRatingLabel(speed.mbps)}`;
  return "속도 측정";
}

function formatMbps(value: number) {
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} Mbps`;
}

function formatOptionalMbps(value?: number) {
  return typeof value === "number" ? formatMbps(value) : "-";
}

function formatLatency(value?: number) {
  return typeof value === "number" ? `${value.toFixed(0)} ms` : "-";
}

function formatBytes(value?: number) {
  if (typeof value !== "number") return "-";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(0)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function speedRatingLabel(value: number) {
  if (value < 25) return "느림";
  if (value < 100) return "보통";
  return "빠름";
}

function speedRatingClass(value: number) {
  if (value < 25) return "metric-speed-slow";
  if (value < 100) return "metric-speed-normal";
  return "metric-speed-fast";
}

async function measureLatency(signal: AbortSignal) {
  const samples: number[] = [];

  for (let index = 0; index < 3; index += 1) {
    const startedAt = performance.now();
    const response = await fetch(`https://speed.cloudflare.com/cdn-cgi/trace?cache=${Date.now()}-${index}`, {
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw new Error("Latency test failed");
    await response.text();
    samples.push(performance.now() - startedAt);
  }

  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

async function measureDownloadSpeed(
  signal: AbortSignal,
  onProgress: (progress: { currentMbps: number; bytes: number; sampleCount: number }) => void,
) {
  const samples: number[] = [];
  let totalBytes = 0;
  const testStartedAt = performance.now();

  while (performance.now() - testStartedAt < SPEED_TEST_MIN_DURATION_MS || samples.length < 3) {
    const url = `https://speed.cloudflare.com/__down?bytes=${SPEED_TEST_DOWNLOAD_BYTES}&cache=${Date.now()}-${samples.length}`;
    const sampleStartedAt = performance.now();
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) throw new Error("Speed test failed");

    const buffer = await response.arrayBuffer();
    const elapsedSeconds = (performance.now() - sampleStartedAt) / 1_000;
    const currentMbps =
      elapsedSeconds <= 0 ? 0 : (buffer.byteLength * 8) / elapsedSeconds / 1_000_000;

    samples.push(currentMbps);
    totalBytes += buffer.byteLength;
    onProgress({
      currentMbps,
      bytes: totalBytes,
      sampleCount: samples.length,
    });
  }

  return {
    bytes: totalBytes,
    mbps: trimmedAverage(samples),
    medianMbps: median(samples),
    sampleCount: samples.length,
  };
}

function trimmedAverage(samples: number[]) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  const trimmed = sorted.length >= 5 ? sorted.slice(1, -1) : sorted;
  return trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
}

function median(samples: number[]) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

async function measureUploadSpeed(signal: AbortSignal) {
  const body = new Uint8Array(SPEED_TEST_UPLOAD_BYTES);
  const startedAt = performance.now();
  const response = await fetch(`https://speed.cloudflare.com/__up?cache=${Date.now()}`, {
    method: "POST",
    body,
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("Upload speed test failed");

  const elapsedSeconds = (performance.now() - startedAt) / 1_000;
  return {
    bytes: body.byteLength,
    mbps: elapsedSeconds <= 0 ? 0 : (body.byteLength * 8) / elapsedSeconds / 1_000_000,
  };
}
