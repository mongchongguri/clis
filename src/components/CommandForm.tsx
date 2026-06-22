import { ChevronDown, ChevronUp, FolderOpen, Plus, Save } from "lucide-react";
import type { SavedTask, ValidationResult } from "../types";
import { GroupCombobox } from "./GroupCombobox";

type CommandFormProps = {
  form: SavedTask;
  groups: string[];
  validation: ValidationResult;
  collapsed: boolean;
  onChange: (form: SavedTask) => void;
  onChooseFolder: () => void;
  onSave: () => void;
  onToggle: () => void;
};

export function CommandForm({
  form,
  groups,
  validation,
  collapsed,
  onChange,
  onChooseFolder,
  onSave,
  onToggle,
}: CommandFormProps) {
  return (
    <aside className="command-panel">
      <button
        className="command-panel-header"
        onClick={onToggle}
        title={collapsed ? "작업 추가 펼치기" : "작업 추가 접기"}
        type="button"
      >
        <div>
          <Plus size={18} />
          <h2>작업 추가</h2>
        </div>
        <div className="command-panel-header-right">
          <span className={validation.ok ? "validation-status ok" : "validation-status"}>
            {validation.message}
          </span>
          {collapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
        </div>
      </button>

      <div className={collapsed ? "command-panel-body collapsed" : "command-panel-body"}>
        <div className="command-panel-body-inner">
          <div className="command-form-grid">
            <label className="command-field group-field">
              <span>그룹</span>
              <GroupCombobox
                groups={groups}
                value={form.group}
                onChange={(group) => onChange({ ...form, group })}
              />
            </label>

            <label className="command-field name-field">
              <span>작업 이름</span>
              <input
                value={form.name}
                onChange={(event) => onChange({ ...form, name: event.target.value })}
                placeholder="Frontend dev"
              />
            </label>

            <label className="command-field path-field">
              <span>실행 폴더</span>
              <div className="folder-row">
                <input
                  value={form.cwd}
                  onChange={(event) => onChange({ ...form, cwd: event.target.value })}
                  placeholder="C:\\dev\\my-front"
                />
                <button className="icon-button" onClick={onChooseFolder} title="폴더 선택">
                  <FolderOpen size={18} />
                </button>
              </div>
            </label>

            <label className="command-field command-input-field">
              <span>실행 명령</span>
              <input
                value={form.command}
                onChange={(event) => onChange({ ...form, command: event.target.value })}
                placeholder="npm run dev"
              />
            </label>

            <button className="primary-button command-save-button" onClick={onSave}>
              <Save size={17} />
              저장
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
