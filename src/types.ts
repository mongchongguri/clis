export type SavedTask = {
  id: string;
  group: string;
  name: string;
  cwd: string;
  command: string;
};

export type RuntimeStatus = {
  task_id: string;
  running: boolean;
  pid?: number;
  port?: number;
  started_at?: number;
  exited_at?: number;
  exit_code?: number;
  error?: string;
  last_output?: string;
  last_error_output?: string;
};

export type LogEntry = {
  task_id: string;
  stream: "stdout" | "stderr" | "system";
  line: string;
  timestamp: number;
};

export type ValidationResult = {
  ok: boolean;
  message: string;
  executable?: string;
  args: string[];
};

export type SystemMetrics = {
  cpu_percent: number;
  memory_percent: number;
  memory_used_bytes: number;
  memory_total_bytes: number;
  network_online: boolean;
  network_rx_bytes_per_sec: number;
  network_tx_bytes_per_sec: number;
};

export type TerminalKind = "git_bash" | "windows_terminal" | "powershell";

export type AppTheme = "light" | "dark";

export type TerminalAvailability = {
  kind: TerminalKind;
  label: string;
  available: boolean;
  path?: string;
  message: string;
};
