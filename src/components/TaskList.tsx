import { Pencil, Terminal } from "lucide-react";
import { useState } from "react";
import type { RuntimeStatus, SavedTask, TerminalAvailability, TerminalKind } from "../types";
import { TaskCard } from "./TaskCard";
import { TerminalSelect } from "./TerminalSelect";

type TaskListProps = {
  tasks: SavedTask[];
  selectedTaskId: string;
  statuses: Record<string, RuntimeStatus>;
  terminals: TerminalAvailability[];
  defaultTerminal: TerminalKind;
  taskTerminals: Record<string, TerminalKind>;
  onDefaultTerminalChange: (terminalKind: TerminalKind) => void;
  onTaskTerminalChange: (taskId: string, terminalKind: TerminalKind | "") => void;
  onSelect: (taskId: string) => void;
  onStart: (task: SavedTask) => void;
  onStop: (task: SavedTask) => void;
  onOpenTerminal: (task: SavedTask, terminalKind: TerminalKind) => void;
  onRenameGroup: (fromGroup: string, toGroup: string) => void;
  onEdit: (task: SavedTask) => void;
  onRemove: (taskId: string) => void;
};

export function TaskList({
  tasks,
  selectedTaskId,
  statuses,
  terminals,
  defaultTerminal,
  taskTerminals,
  onDefaultTerminalChange,
  onTaskTerminalChange,
  onSelect,
  onStart,
  onStop,
  onOpenTerminal,
  onRenameGroup,
  onEdit,
  onRemove,
}: TaskListProps) {
  const [editingGroup, setEditingGroup] = useState("");
  const [editingGroupName, setEditingGroupName] = useState("");

  const groupedTasks = tasks.reduce<Record<string, SavedTask[]>>((groups, task) => {
    const group = task.group.trim() || "Default";
    groups[group] = [...(groups[group] ?? []), task];
    return groups;
  }, {});

  const groupNames = Object.keys(groupedTasks).sort((left, right) =>
    left.localeCompare(right, "ko"),
  );

  const startGroupEdit = (group: string) => {
    setEditingGroup(group);
    setEditingGroupName(group);
  };

  const cancelGroupEdit = () => {
    setEditingGroup("");
    setEditingGroupName("");
  };

  const saveGroupEdit = () => {
    const nextGroup = editingGroupName.trim();
    if (!nextGroup) return;
    onRenameGroup(editingGroup, nextGroup);
    cancelGroupEdit();
  };

  return (
    <section className="task-list">
      <div className="task-list-header">
        <div className="panel-title">
          <Terminal size={18} />
          <h2>저장된 작업</h2>
        </div>
        <label className="default-terminal-control">
          <span>기본 터미널</span>
          <TerminalSelect
            className="default-terminal-select"
            onChange={(value) => {
              if (value) onDefaultTerminalChange(value);
            }}
            terminals={terminals}
            value={defaultTerminal}
          />
        </label>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state">아직 저장된 작업이 없습니다.</div>
      ) : (
        <div className="group-list">
          {groupNames.map((group) => (
            <section className="task-group" key={group}>
              <div className="group-header">
                <div className="group-title-area">
                  {editingGroup === group ? (
                    <input
                      className="group-name-input"
                      value={editingGroupName}
                      onChange={(event) => setEditingGroupName(event.target.value)}
                      onBlur={saveGroupEdit}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveGroupEdit();
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelGroupEdit();
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <h3>{group}</h3>
                  )}
                </div>
                <div className="group-header-actions">
                  <span>
                    {groupedTasks[group].filter((task) => statuses[task.id]?.running).length}/
                    {groupedTasks[group].length} running
                  </span>
                  {editingGroup !== group ? (
                    <button
                      className="toolbar-icon-button"
                      onClick={() => startGroupEdit(group)}
                      title="그룹명 편집"
                    >
                      <Pencil size={15} />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="task-rows">
                {groupedTasks[group].map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    status={statuses[task.id]}
                    terminals={terminals}
                    defaultTerminal={defaultTerminal}
                    selectedTerminal={taskTerminals[task.id] ?? ""}
                    selected={selectedTaskId === task.id}
                    onSelect={() => onSelect(task.id)}
                    onStart={() => onStart(task)}
                    onStop={() => onStop(task)}
                    onOpenTerminal={(terminalKind) =>
                      onOpenTerminal(task, terminalKind || defaultTerminal)
                    }
                    onTerminalChange={(terminalKind) => onTaskTerminalChange(task.id, terminalKind)}
                    onEdit={() => onEdit(task)}
                    onRemove={() => onRemove(task.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
