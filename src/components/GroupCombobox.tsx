import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

type GroupComboboxProps = {
  value: string;
  groups: string[];
  onChange: (value: string) => void;
};

export function GroupCombobox({ value, groups, onChange }: GroupComboboxProps) {
  const [open, setOpen] = useState(false);

  const filteredGroups = useMemo(() => {
    const query = value.trim().toLowerCase();
    const uniqueGroups = [...new Set(groups.map((group) => group.trim()).filter(Boolean))];
    if (!query) return uniqueGroups;
    return uniqueGroups.filter((group) => group.toLowerCase().includes(query));
  }, [groups, value]);

  const showNewGroupHint =
    value.trim() && !groups.some((group) => group.toLowerCase() === value.trim().toLowerCase());

  return (
    <div className="group-combobox" onBlur={() => setOpen(false)}>
      <div className="group-combobox-control">
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Frontend"
        />
        <button
          className="group-combobox-toggle"
          type="button"
          onClick={(event) => {
            event.preventDefault();
            setOpen((current) => !current);
          }}
          title="그룹 목록"
        >
          <ChevronDown size={15} />
        </button>
      </div>

      {open ? (
        <div className="group-combobox-menu">
          {filteredGroups.map((group) => (
            <button
              className={group === value ? "group-combobox-item selected" : "group-combobox-item"}
              key={group}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(group);
                setOpen(false);
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
              onClick={() => setOpen(false)}
            >
              새 그룹 생성: {value.trim()}
            </button>
          ) : null}
          {!filteredGroups.length && !showNewGroupHint ? (
            <div className="group-combobox-empty">그룹이 없습니다.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
