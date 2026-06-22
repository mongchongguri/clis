import type { LogEntry, SavedTask } from "../types";
import { ChevronDown, ChevronUp, Terminal } from "lucide-react";

type LogPanelProps = {
  task?: SavedTask;
  logs: LogEntry[];
  open: boolean;
  onToggle: () => void;
};

export function LogPanel({ task, logs, open, onToggle }: LogPanelProps) {
  return (
    <section className={open ? "log-panel open" : "log-panel"}>
      <div
        className="log-header"
        onClick={onToggle}
        title={open ? "터미널 접기" : "터미널 펼치기"}
      >
        <div>
          <h2>
            <Terminal size={15} />
            {task?.name ?? "Terminal"}
          </h2>
        </div>
        <span className="terminal-toggle-button">
          {open ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
        </span>
      </div>
      <div className="log-panel-body">
        <pre>
          {logs.length
            ? logs.map((entry) => `[${entry.stream}] ${entry.line}`).join("\n")
            : "로그가 아직 없습니다."}
        </pre>
      </div>
    </section>
  );
}
