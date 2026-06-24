import { getCurrentWindow } from "@tauri-apps/api/window";

export function AppToolbar() {
  const appWindow = getCurrentWindow();
  const startDragging = async (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (event.button !== 0) return;
    if (target.closest("button")) return;
    await appWindow.startDragging();
  };
  const toggleMaximize = async (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    await appWindow.toggleMaximize();
  };

  return (
    <header
      className="app-toolbar"
      data-tauri-drag-region
      onDoubleClick={toggleMaximize}
      onMouseDown={startDragging}
    >
      <div className="window-right" data-tauri-drag-region>
        <div className="window-controls" data-tauri-drag-region>
          <button
            className="window-control minimize"
            onClick={() => appWindow.minimize()}
            title="최소화"
            aria-label="최소화"
          />
          <button
            className="window-control maximize"
            onClick={() => appWindow.toggleMaximize()}
            title="최대화"
            aria-label="최대화"
          />
          <button
            className="window-control close"
            onClick={() => appWindow.close()}
            title="닫기"
            aria-label="닫기"
          />
        </div>
      </div>
    </header>
  );
}
