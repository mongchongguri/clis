import { ChevronDown } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

type GroupComboboxProps = {
  value: string;
  groups: string[];
  onChange: (value: string) => void;
};

export function GroupCombobox({ value, groups, onChange }: GroupComboboxProps) {
  const inputId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [showAllGroups, setShowAllGroups] = useState(false);

  const uniqueGroups = useMemo(
    () => [...new Set(groups.map((group) => group.trim()).filter(Boolean))],
    [groups],
  );

  const visibleGroups = useMemo(() => {
    const query = showAllGroups ? "" : value.trim().toLowerCase();
    if (!query) return uniqueGroups;
    return uniqueGroups.filter((group) => group.toLowerCase().includes(query));
  }, [showAllGroups, uniqueGroups, value]);

  const showNewGroupHint =
    value.trim() &&
    !uniqueGroups.some((group) => group.toLowerCase() === value.trim().toLowerCase());

  const openGroupList = (showAll = false) => {
    setShowAllGroups(showAll);
    setOpen(true);
  };

  const closeGroupList = () => {
    setOpen(false);
    setShowAllGroups(false);
  };

  return (
    <div
      className="group-combobox"
      ref={rootRef}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
          closeGroupList();
        }
      }}
    >
      <div className="group-combobox-control">
        <input
          id={inputId}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            openGroupList(false);
          }}
          onFocus={() => openGroupList(true)}
          placeholder="Frontend"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${inputId}-menu`}
          aria-autocomplete="list"
        />
        <button
          className="group-combobox-toggle"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault();
            if (open && showAllGroups) {
              closeGroupList();
            } else {
              openGroupList(true);
            }
          }}
          title="그룹 목록"
        >
          <ChevronDown size={15} />
        </button>
      </div>

      {open ? (
        <div className="group-combobox-menu" id={`${inputId}-menu`} role="listbox">
          {visibleGroups.map((group) => (
            <button
              className={group === value ? "group-combobox-item selected" : "group-combobox-item"}
              key={group}
              role="option"
              aria-selected={group === value}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(group);
                closeGroupList();
              }}
            >
              {group}
            </button>
          ))}
          {showNewGroupHint ? (
            <button
              className="group-combobox-item new"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(value.trim());
                closeGroupList();
              }}
            >
              새 그룹 생성: {value.trim()}
            </button>
          ) : null}
          {!visibleGroups.length && !showNewGroupHint ? (
            <div className="group-combobox-empty">그룹이 없습니다.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
