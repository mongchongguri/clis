import { Pencil, Terminal } from "lucide-react";
import { useRef, useState } from "react";
import type { RuntimeStatus, SavedTask, TerminalAvailability, TerminalKind } from "../types";
import { TaskCard } from "./TaskCard";
import { TerminalSelect } from "./TerminalSelect";

type TaskListProps = {
  tasks: SavedTask[];
  selectedTaskId: string;
  statuses: Record<string, RuntimeStatus>;
  terminals: TerminalAvailability[];
  defaultTerminal: TerminalKind;
  groupOrder: string[];
  taskTerminals: Record<string, TerminalKind>;
  onDefaultTerminalChange: (terminalKind: TerminalKind) => void;
  onTaskTerminalChange: (taskId: string, terminalKind: TerminalKind | "") => void;
  onSelect: (taskId: string) => void;
  onStart: (task: SavedTask) => void;
  onStop: (task: SavedTask) => void;
  onOpenTerminal: (task: SavedTask, terminalKind: TerminalKind) => void;
  onRenameGroup: (fromGroup: string, toGroup: string) => void;
  onReorderGroup: (fromGroup: string, toGroup: string, placement: "before" | "after") => void;
  onEdit: (task: SavedTask) => void;
  onRemove: (taskId: string) => void;
};

export function TaskList({
  tasks,
  selectedTaskId,
  statuses,
  terminals,
  defaultTerminal,
  groupOrder,
  taskTerminals,
  onDefaultTerminalChange,
  onTaskTerminalChange,
  onSelect,
  onStart,
  onStop,
  onOpenTerminal,
  onRenameGroup,
  onReorderGroup,
  onEdit,
  onRemove,
}: TaskListProps) {
  const [editingGroup, setEditingGroup] = useState("");
  const [editingGroupName, setEditingGroupName] = useState("");
  const [draggingGroup, setDraggingGroup] = useState("");
  const [dragOverGroup, setDragOverGroup] = useState("");
  const [dragPlacement, setDragPlacement] = useState<"before" | "after">("before");
  const draggingGroupRef = useRef("");
  const dragOverGroupRef = useRef("");
  const dragPlacementRef = useRef<"before" | "after">("before");

  const groupedTasks = tasks.reduce<Record<string, SavedTask[]>>((groups, task) => {
    const group = task.group.trim() || "Default";
    groups[group] = [...(groups[group] ?? []), task];
    return groups;
  }, {});

  const groupNames = [
    ...groupOrder.filter((group) => groupedTasks[group]),
    ...Object.keys(groupedTasks)
      .filter((group) => !groupOrder.includes(group))
      .sort((left, right) => left.localeCompare(right, "ko")),
  ];

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

  const finishGroupDrag = () => {
    draggingGroupRef.current = "";
    dragOverGroupRef.current = "";
    dragPlacementRef.current = "before";
    setDraggingGroup("");
    setDragOverGroup("");
    setDragPlacement("before");
  };

  const startGroupDrag = (group: string, event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || editingGroup === group || target.closest("button, input, select")) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingGroupRef.current = group;
    dragOverGroupRef.current = "";
    setDraggingGroup(group);
    setDragOverGroup("");
  };

  const moveGroupDrag = (event: React.PointerEvent<HTMLElement>) => {
    const sourceGroup = draggingGroupRef.current;
    if (!sourceGroup) return;

    event.preventDefault();
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const groupElement = element?.closest<HTMLElement>(".task-group");
    const targetGroup = groupElement?.dataset.group ?? "";

    if (!groupElement || !targetGroup || targetGroup === sourceGroup) {
      dragOverGroupRef.current = "";
      setDragOverGroup("");
      return;
    }

    const rect = groupElement.getBoundingClientRect();
    const nextPlacement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";

    dragOverGroupRef.current = targetGroup;
    dragPlacementRef.current = nextPlacement;
    setDragOverGroup(targetGroup);
    setDragPlacement(nextPlacement);
  };

  const endGroupDrag = (event: React.PointerEvent<HTMLElement>) => {
    const sourceGroup = draggingGroupRef.current;
    const targetGroup = dragOverGroupRef.current;
    const placement = dragPlacementRef.current;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (sourceGroup && targetGroup) {
      onReorderGroup(sourceGroup, targetGroup, placement);
    }
    finishGroupDrag();
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
            <section
              data-group={group}
              className={[
                "task-group",
                draggingGroup === group ? "dragging" : "",
                dragOverGroup === group && draggingGroup !== group
                  ? `drag-over drag-over-${dragPlacement}`
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={group}
            >
              <div
                className="group-header"
                onPointerCancel={endGroupDrag}
                onPointerDown={(event) => startGroupDrag(group, event)}
                onPointerMove={moveGroupDrag}
                onPointerUp={endGroupDrag}
              >
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
