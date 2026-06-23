import { invoke } from "@tauri-apps/api/core";
import { AlertCircle, Pencil, Play, Square, SquareTerminal, Trash2 } from "lucide-react";
import { formatTime } from "../lib/format";
import { validateOnClient } from "../lib/commandValidation";
import type { RuntimeStatus, SavedTask, TerminalAvailability, TerminalKind } from "../types";
import { TerminalSelect } from "./TerminalSelect";

type TaskCardProps = {
  task: SavedTask;
  status?: RuntimeStatus;
  terminals: TerminalAvailability[];
  defaultTerminal: TerminalKind;
  selectedTerminal: TerminalKind | "";
  selected: boolean;
  onSelect: () => void;
  onStart: () => void;
  onStop: () => void;
  onOpenTerminal: (terminalKind: TerminalKind | "") => void;
  onTerminalChange: (terminalKind: TerminalKind | "") => void;
  onEdit: () => void;
  onRemove: () => void;
};

export function TaskCard({
  task,
  status,
  terminals,
  defaultTerminal,
  selectedTerminal,
  selected,
  onSelect,
  onStart,
  onStop,
  onOpenTerminal,
  onTerminalChange,
  onEdit,
  onRemove,
}: TaskCardProps) {
  const running = Boolean(status?.running);
  const hasError =
    !running &&
    (Boolean(status?.error) ||
      (typeof status?.exit_code === "number" && status.exit_code !== 0));
  const errorMessage =
    status?.error ||
    status?.last_error_output ||
    (typeof status?.exit_code === "number" ? `Exit code ${status.exit_code}` : "실행 오류");
  const effectiveTerminal = selectedTerminal || defaultTerminal;
  const runValidation = validateOnClient(task.cwd, task.command);
  const canRun = Boolean(task.command.trim()) && runValidation.ok;
  const disabledRunMessage = !task.cwd.trim()
    ? "실행 폴더가 없어 실행할 수 없습니다."
    : !task.command.trim()
      ? "명령어가 없어 실행할 수 없습니다."
      : "허용되지 않거나 해석할 수 없는 명령어입니다.";
  const defaultTerminalLabel =
    terminals.find((terminal) => terminal.kind === defaultTerminal)?.label ?? "기본";
  const canOpenTerminal = terminals.some(
    (terminal) => terminal.kind === effectiveTerminal && terminal.available,
  );

  const stopPropagation = (callback: () => void) => {
    return (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      callback();
    };
  };

  const openPort = (port: number) => {
    invoke("open_localhost_port", { port }).catch(() => undefined);
  };

  return (
    <article className={`task-card ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="task-row">
        <div className="task-head">
          <div className="task-main">
            <div className="task-title-line">
              <h3>{task.name}</h3>
              {hasError ? (
                <span className="task-error-indicator" title={errorMessage}>
                  <AlertCircle size={14} />
                </span>
              ) : null}
            </div>
            <p>{task.command}</p>
          </div>
        </div>

        <div className="task-path" title={task.cwd}>
          {task.cwd}
        </div>

        <dl className="metrics">
          <div>
            <dt>PID</dt>
            <dd>{status?.pid ?? "-"}</dd>
          </div>
          <div>
            <dt>PORT</dt>
            <dd>
              {status?.port ? (
                <button
                  className="link-button"
                  onClick={stopPropagation(() => openPort(status.port as number))}
                >
                  {status.port}
                </button>
              ) : (
                "-"
              )}
            </dd>
          </div>
          <div>
            <dt>START</dt>
            <dd>{formatTime(status?.started_at)}</dd>
          </div>
        </dl>

        <div className="task-actions">
          <TerminalSelect
            className="terminal-select"
            includeDefault
            defaultLabel={`기본 (${defaultTerminalLabel})`}
            onChange={onTerminalChange}
            terminals={terminals}
            value={selectedTerminal}
          />
          <div className="task-icon-group">
            <button
              className="icon-button"
              onClick={stopPropagation(() => onOpenTerminal(selectedTerminal))}
              disabled={!canOpenTerminal}
              title="터미널 열기"
            >
              <SquareTerminal size={16} />
            </button>
            <button className="toolbar-icon-button" onClick={stopPropagation(onEdit)} title="수정">
              <Pencil size={16} />
            </button>
            <button
              className="toolbar-icon-button danger-button"
              onClick={stopPropagation(onRemove)}
              title="삭제"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        <button
          className={running ? "run-icon-button running" : "run-icon-button"}
        onClick={stopPropagation(running ? onStop : onStart)}
        disabled={!running && !canRun}
        title={running ? "실행 중지" : canRun ? "실행" : disabledRunMessage}
      >
        {running ? (
          <span className="run-progress">
            <span className="run-spinner" />
            <Square className="run-stop-icon" size={9} fill="currentColor" />
          </span>
        ) : (
          <Play size={18} />
        )}
      </button>
      </div>

    </article>
  );
}
