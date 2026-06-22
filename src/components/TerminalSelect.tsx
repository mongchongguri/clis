import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import type { TerminalAvailability, TerminalKind } from "../types";

type TerminalSelectProps = {
  value: TerminalKind | "";
  terminals: TerminalAvailability[];
  onChange: (value: TerminalKind | "") => void;
  includeDefault?: boolean;
  className?: string;
  defaultLabel?: string;
};

export function TerminalSelect({
  value,
  terminals,
  onChange,
  includeDefault = false,
  className = "",
  defaultLabel = "기본",
}: TerminalSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = terminals.find((terminal) => terminal.kind === value);
  const label = value ? (selected?.label ?? "Unknown") : defaultLabel;

  const options = useMemo(() => {
    const terminalOptions = terminals.map((terminal) => ({
      kind: terminal.kind as TerminalKind | "",
      label: terminal.label,
      available: terminal.available,
      message: terminal.message,
    }));

    return includeDefault
      ? [
          {
            kind: "" as const,
            label: defaultLabel,
            available: true,
            message: "기본 터미널 설정을 사용합니다.",
          },
          ...terminalOptions,
        ]
      : terminalOptions;
  }, [defaultLabel, includeDefault, terminals]);

  return (
    <div
      className={`terminal-dropdown ${className}`}
      onBlur={(event) => {
        event.currentTarget.closest(".task-card")?.classList.remove("dropdown-open");
        setOpen(false);
      }}
    >
      <button
        className="terminal-dropdown-button"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          event.currentTarget
            .closest(".task-card")
            ?.classList.toggle("dropdown-open", !open);
          setOpen((current) => !current);
        }}
      >
        <span>{label}</span>
        <ChevronDown size={15} />
      </button>

      {open ? (
        <div className="terminal-dropdown-menu" role="listbox">
          {options.map((option) => (
            <button
              className={option.kind === value ? "terminal-dropdown-item selected" : "terminal-dropdown-item"}
              disabled={!option.available}
              key={option.kind || "default"}
              title={option.message}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                onChange(option.kind);
                event.currentTarget.closest(".task-card")?.classList.remove("dropdown-open");
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {!option.available ? <em>사용 불가</em> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
