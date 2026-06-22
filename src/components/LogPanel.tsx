import type { LogEntry, SavedTask } from "../types";
import { ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { useState } from "react";

type LogPanelProps = {
  task?: SavedTask;
  logs: LogEntry[];
  open: boolean;
  onToggle: () => void;
};

export function LogPanel({ task, logs, open, onToggle }: LogPanelProps) {
  const [height, setHeight] = useState(240);

  const startResize = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!open) return;

    event.preventDefault();
    event.stopPropagation();

    const startY = event.clientY;
    const startHeight = height;

    const resize = (moveEvent: MouseEvent) => {
      const nextHeight = startHeight + startY - moveEvent.clientY;
      setHeight(Math.min(520, Math.max(140, nextHeight)));
    };

    const stopResize = () => {
      document.body.classList.remove("resizing-log-panel");
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResize);
    };

    document.body.classList.add("resizing-log-panel");
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResize);
  };

  return (
    <section
      className={open ? "log-panel open" : "log-panel"}
      style={{ "--log-panel-height": `${height}px` } as React.CSSProperties}
    >
      {open ? (
        <div
          className="log-resize-handle"
          onMouseDown={startResize}
          title="터미널 높이 조절"
        />
      ) : null}
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
